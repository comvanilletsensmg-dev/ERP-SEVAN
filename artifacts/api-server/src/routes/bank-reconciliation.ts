import { Router, type IRouter } from "express";
import {
  db, bankTransactionsTable, accountingInvoicesTable,
  journalEntriesTable, journalLinesTable, partnersTable,
} from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

async function ensureAccount(code: string, name: string, type: string) {
  const rows = await db.execute(sql`SELECT id FROM accounts WHERE code = ${code} LIMIT 1`);
  if (rows.rows.length > 0) return rows.rows[0].id as string;
  const r = await db.execute(sql`
    INSERT INTO accounts (id, code, name, type)
    VALUES (gen_random_uuid()::text, ${code}, ${name}, ${type})
    RETURNING id
  `);
  return r.rows[0].id as string;
}

function scoreMatch(txn: { amount: number; date: Date; reference: string | null; description: string }, inv: any): number {
  const txnAmt = Math.abs(txn.amount);
  const invAmt = Number(inv.amount_ttc);
  if (invAmt === 0) return 0;
  const diff = Math.abs(txnAmt - invAmt) / invAmt;
  let score = 0;

  if (diff === 0)      score += 80;
  else if (diff < 0.01) score += 55;
  else if (diff < 0.05) score += 25;
  else return 0; // too far off

  const ref = (txn.reference ?? "").toLowerCase();
  const invNum = (inv.invoice_number ?? "").toLowerCase();
  if (ref && invNum && (ref.includes(invNum) || invNum.includes(ref))) score += 15;

  if (inv.due_date) {
    const days = Math.abs((new Date(txn.date).getTime() - new Date(inv.due_date).getTime()) / 86_400_000);
    if (days <= 3) score += 5;
    else if (days <= 7) score += 3;
    else if (days <= 30) score += 1;
  }

  const desc = txn.description.toLowerCase();
  const pname = (inv.partner_name ?? "").toLowerCase();
  if (pname && desc.includes(pname.split(" ")[0])) score += 5;

  return Math.min(score, 100);
}

// ─── GET /api/bank/reconciliation ─────────────────────────────────────────────
router.get("/bank/reconciliation", requireAuth, async (_req, res): Promise<void> => {
  const [txns, invoicesRaw, entries] = await Promise.all([
    db.select().from(bankTransactionsTable).orderBy(desc(bankTransactionsTable.date)),
    db.execute(sql`
      SELECT ai.*, ap.name AS partner_name
      FROM accounting_invoices ai
      LEFT JOIN accounting_partners ap ON ap.id = ai.partner_id
      ORDER BY ai.created_at DESC
    `),
    db.select().from(journalEntriesTable).orderBy(desc(journalEntriesTable.date)),
  ]);

  // Enrich txns with invoice/partner details
  const invoiceMap: Record<string, any> = {};
  for (const inv of invoicesRaw.rows) invoiceMap[inv.id as string] = inv;

  const enriched = txns.map(t => ({
    ...t,
    invoiceDetails: t.invoiceId ? invoiceMap[t.invoiceId] ?? null : null,
  }));

  const totalBank = txns.reduce((s, t) => s + t.amount, 0);
  const totalMatched = txns.filter(t => t.status === "matched").reduce((s, t) => s + t.amount, 0);
  const unmatchedCount = txns.filter(t => t.status === "unmatched").length;
  const suggestedCount = txns.filter(t => t.status === "suggested").length;

  res.json({
    transactions: enriched,
    invoices: invoicesRaw.rows,
    journalEntries: entries,
    summary: {
      totalBank,
      totalMatched,
      ecart: totalBank - totalMatched,
      unmatchedCount,
      suggestedCount,
    },
  });
});

// ─── POST /api/bank/auto-match ────────────────────────────────────────────────
router.post("/bank/auto-match", requireAuth, async (req, res): Promise<void> => {
  const txns = await db.execute(sql`
    SELECT * FROM bank_transactions WHERE status = 'unmatched' ORDER BY date
  `);

  const invoicesRaw = await db.execute(sql`
    SELECT ai.*, ap.name AS partner_name
    FROM accounting_invoices ai
    LEFT JOIN accounting_partners ap ON ap.id = ai.partner_id
    WHERE ai.status != 'paid'
  `);

  let suggested = 0, autoMatched = 0;

  for (const txn of txns.rows) {
    let bestScore = 0;
    let bestInv: any = null;

    for (const inv of invoicesRaw.rows) {
      const score = scoreMatch({
        amount: Number(txn.amount),
        date: new Date(txn.date as string),
        reference: txn.reference as string | null,
        description: txn.description as string,
      }, inv);
      if (score > bestScore) { bestScore = score; bestInv = inv; }
    }

    if (bestInv && bestScore >= 50) {
      const newStatus = bestScore >= 90 ? "matched" : "suggested";
      await db.execute(sql`
        UPDATE bank_transactions SET
          status = ${newStatus},
          invoice_id = ${bestInv.id as string},
          partner_id = ${bestInv.partner_id as string | null},
          match_score = ${bestScore},
          matched = ${newStatus === "matched"},
          matched_ref = ${bestInv.invoice_number as string}
        WHERE id = ${txn.id as string}
      `);
      if (newStatus === "matched") autoMatched++;
      else suggested++;
    }
  }

  res.json({
    processed: txns.rows.length,
    suggested,
    autoMatched,
    message: `${autoMatched} rapprochés automatiquement, ${suggested} suggestions`,
  });
});

// ─── PUT /api/bank/:id/reconcile ──────────────────────────────────────────────
router.put("/bank/:id/reconcile", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { invoiceId, partnerId, journalEntryId, matchScore } = req.body;

  let matchedRef = "";
  if (invoiceId) {
    const r = await db.execute(sql`SELECT invoice_number FROM accounting_invoices WHERE id = ${invoiceId} LIMIT 1`);
    matchedRef = (r.rows[0]?.invoice_number as string) ?? invoiceId;
  } else if (journalEntryId) {
    const r = await db.execute(sql`SELECT reference FROM journal_entries WHERE id = ${journalEntryId} LIMIT 1`);
    matchedRef = (r.rows[0]?.reference as string) ?? journalEntryId;
  }

  await db.execute(sql`
    UPDATE bank_transactions SET
      status = 'matched',
      invoice_id = ${invoiceId ?? null},
      partner_id = ${partnerId ?? null},
      journal_entry_id = ${journalEntryId ?? null},
      match_score = ${matchScore ?? 100},
      matched = true,
      matched_ref = ${matchedRef}
    WHERE id = ${id}
  `);

  const [updated] = await db.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, id));
  res.json(updated);
});

// ─── PUT /api/bank/:id/unreconcile ────────────────────────────────────────────
router.put("/bank/:id/unreconcile", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  await db.execute(sql`
    UPDATE bank_transactions SET
      status = 'unmatched',
      invoice_id = NULL,
      partner_id = NULL,
      journal_entry_id = NULL,
      match_score = NULL,
      matched = false,
      matched_ref = NULL
    WHERE id = ${id}
  `);
  const [updated] = await db.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, id));
  res.json(updated);
});

// ─── POST /api/bank/:id/gap ───────────────────────────────────────────────────
// Creates a gap journal entry (658 or 758) and marks the transaction matched
router.post("/bank/:id/gap", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { gapAmount, invoiceId, partnerId, description } = req.body;

  if (!gapAmount || gapAmount === 0) {
    res.status(400).json({ error: "gapAmount required and must be non-zero" });
    return;
  }

  const gap = Number(gapAmount);
  const bankAccountId = await ensureAccount("512", "Banques", "asset");
  const gapAccountId = gap > 0
    ? await ensureAccount("758", "Produits divers de gestion courante", "revenue")
    : await ensureAccount("658", "Charges diverses de gestion courante", "expense");

  const ref = `ECART-${id.slice(0, 8).toUpperCase()}`;
  const entryDesc = description ?? `Écart de rapprochement bancaire`;

  // Create journal entry
  const [entry] = await db.execute(sql`
    INSERT INTO journal_entries (id, date, reference, description, status)
    VALUES (gen_random_uuid()::text, NOW(), ${ref}, ${entryDesc}, 'validated')
    RETURNING id
  `).then(r => r.rows);

  const entryId = entry.id as string;
  const absGap = Math.abs(gap);

  // Lines
  if (gap > 0) {
    // Bank got more than invoice → produit 758
    await db.execute(sql`
      INSERT INTO journal_lines (id, entry_id, account_id, debit, credit, label) VALUES
      (gen_random_uuid()::text, ${entryId}, ${bankAccountId}, ${absGap}, 0, ${entryDesc}),
      (gen_random_uuid()::text, ${entryId}, ${gapAccountId}, 0, ${absGap}, ${entryDesc})
    `);
  } else {
    // Bank got less → charge 658
    await db.execute(sql`
      INSERT INTO journal_lines (id, entry_id, account_id, debit, credit, label) VALUES
      (gen_random_uuid()::text, ${entryId}, ${gapAccountId}, ${absGap}, 0, ${entryDesc}),
      (gen_random_uuid()::text, ${entryId}, ${bankAccountId}, 0, ${absGap}, ${entryDesc})
    `);
  }

  // Update bank transaction
  await db.execute(sql`
    UPDATE bank_transactions SET
      status = 'matched',
      gap_amount = ${gap},
      gap_journal_entry_id = ${entryId},
      invoice_id = ${invoiceId ?? null},
      partner_id = ${partnerId ?? null},
      matched = true,
      matched_ref = ${ref}
    WHERE id = ${id}
  `);

  const [updated] = await db.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, id));
  res.json({ transaction: updated, gapEntry: entryId });
});

// ─── GET /api/bank/summary ────────────────────────────────────────────────────
router.get("/bank/summary", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      SUM(amount) AS total_amount,
      SUM(CASE WHEN status = 'matched' THEN amount ELSE 0 END) AS matched_amount,
      SUM(CASE WHEN status = 'suggested' THEN amount ELSE 0 END) AS suggested_amount,
      COUNT(CASE WHEN status = 'unmatched' THEN 1 END) AS unmatched_count,
      COUNT(CASE WHEN status = 'suggested' THEN 1 END) AS suggested_count,
      COUNT(CASE WHEN status = 'matched' THEN 1 END) AS matched_count
    FROM bank_transactions
  `);
  res.json(rows.rows[0] ?? {});
});

export default router;
