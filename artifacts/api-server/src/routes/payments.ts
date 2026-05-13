import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db, paymentsTable, salesTable, clientsTable,
  journalEntriesTable, journalLinesTable, accountsTable,
  purchasesTable, suppliersTable,
} from "@workspace/db";
import { CreatePaymentBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/roles";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── GET /payments/analytics ──────────────────────────────────────────────────
router.get("/payments/analytics", requireAuth, async (_req, res): Promise<void> => {
  const monthly = (await db.execute(sql`
    SELECT
      TO_CHAR(je.date, 'YYYY-MM')                                                      AS month,
      COALESCE(SUM(CASE WHEN jl.credit > 0 AND a.code IN ('512','53') THEN jl.credit ELSE 0 END), 0) AS encaisse,
      COALESCE(SUM(CASE WHEN jl.debit  > 0 AND a.code IN ('512','53') THEN jl.debit  ELSE 0 END), 0) AS paye
    FROM journal_entries je
    JOIN journal_lines jl ON jl.entry_id = je.id
    JOIN accounts      a  ON a.id = jl.account_id
    WHERE je.date >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(je.date, 'YYYY-MM')
    ORDER BY month
  `)).rows;

  const byMethod = (await db.execute(sql`
    SELECT method, COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
    FROM payments
    GROUP BY method
    ORDER BY total DESC
  `)).rows;

  res.json({ monthly, byMethod });
});

// ─── GET /payments ─────────────────────────────────────────────────────────────
router.get("/payments", requireAuth, async (_req, res): Promise<void> => {
  const [kpiRow] = (await db.execute(sql`
    SELECT
      COALESCE((SELECT SUM(amount) FROM payments), 0)::float                       AS total_encaisse,
      COALESCE((SELECT ABS(SUM(amount)) FROM bank_transactions WHERE reference LIKE 'PAY-FRN-%' AND amount < 0), 0)::float AS total_paye_fournisseurs,
      COALESCE((SELECT SUM(amount) FROM invoice_payments), 0)::float               AS invoice_payments_total,
      COALESCE((SELECT COUNT(*) FROM accounting_invoices WHERE status = 'validated')::int, 0) AS factures_attente,
      COALESCE((SELECT COUNT(*) FROM accounting_invoices WHERE due_date < NOW() AND status NOT IN ('paid','draft'))::int, 0) AS overdue_count
  `)).rows as any[];

  const clientPayments = (await db.execute(sql`
    SELECT p.id, p.amount, p.method, p.created_at,
      s.id AS sale_id, s.total_amount, s.currency,
      c.name AS client_name, c.id AS client_id
    FROM payments p
    LEFT JOIN sales   s ON s.id = p.sale_id
    LEFT JOIN clients c ON c.id = s.client_id
    ORDER BY p.created_at DESC
    LIMIT 100
  `)).rows;

  const supplierPayments = (await db.execute(sql`
    SELECT bt.id, ABS(bt.amount) AS amount, bt.description, bt.reference, bt.date AS created_at,
      bt.status, bt.journal_entry_id
    FROM bank_transactions bt
    WHERE bt.reference LIKE 'PAY-FRN-%'
    ORDER BY bt.date DESC
    LIMIT 100
  `)).rows;

  const invoicePayments = (await db.execute(sql`
    SELECT ip.id, ip.amount, ip.method, ip.provider, ip.reference, ip.proof_url, ip.notes, ip.created_at,
      inv.invoice_number, inv.type AS invoice_type, inv.status AS invoice_status, inv.amount_ttc,
      ap.name AS partner_name, ap.type AS partner_type
    FROM invoice_payments ip
    JOIN accounting_invoices  inv ON inv.id = ip.invoice_id
    JOIN accounting_partners  ap  ON ap.id  = inv.partner_id
    ORDER BY ip.created_at DESC
    LIMIT 100
  `)).rows;

  const pendingInvoices = (await db.execute(sql`
    SELECT inv.id, inv.invoice_number, inv.type, inv.status, inv.amount_ttc, inv.due_date,
      ap.name AS partner_name, ap.type AS partner_type,
      COALESCE(SUM(ip.amount), 0)                      AS paid_amount,
      inv.amount_ttc - COALESCE(SUM(ip.amount), 0)     AS remaining
    FROM accounting_invoices inv
    JOIN accounting_partners ap  ON ap.id  = inv.partner_id
    LEFT JOIN invoice_payments ip ON ip.invoice_id = inv.id
    WHERE inv.status NOT IN ('draft')
    GROUP BY inv.id, inv.invoice_number, inv.type, inv.status, inv.amount_ttc, inv.due_date, ap.name, ap.type
    ORDER BY inv.due_date ASC NULLS LAST
  `)).rows;

  const totalEncaisse           = Number(kpiRow?.total_encaisse            ?? 0);
  const totalPayeFournisseurs   = Number(kpiRow?.total_paye_fournisseurs   ?? 0);
  const invoicePaymentsTotal    = Number(kpiRow?.invoice_payments_total    ?? 0);

  res.json({
    clientPayments,
    supplierPayments,
    invoicePayments,
    pendingInvoices,
    kpis: {
      totalEncaisse,
      totalPayeFournisseurs,
      invoicePaymentsTotal,
      cashflowNet:      totalEncaisse - totalPayeFournisseurs,
      facturesAttente:  Number(kpiRow?.factures_attente ?? 0),
      overdueCount:     Number(kpiRow?.overdue_count    ?? 0),
    },
  });
});

// ─── POST /payments  (encaissement client → D512/C411) ────────────────────────
router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { saleId, amount, method } = parsed.data;
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, saleId));
  if (!sale) { res.status(404).json({ error: "Vente introuvable" }); return; }

  const [payment] = await db.insert(paymentsTable).values({ saleId, amount, method }).returning();

  const [bankAcc]   = await db.select().from(accountsTable).where(eq(accountsTable.code, "512"));
  const [clientAcc] = await db.select().from(accountsTable).where(eq(accountsTable.code, "411"));

  if (bankAcc && clientAcc) {
    const [entry] = await db.insert(journalEntriesTable).values({
      date:        new Date(),
      reference:   `PAIEMENT-${payment.id.slice(0, 8).toUpperCase()}`,
      description: `Encaissement client — vente ${saleId.slice(0, 8).toUpperCase()}`,
    }).returning();
    await db.insert(journalLinesTable).values([
      { entryId: entry.id, accountId: bankAcc.id,   debit: amount, credit: 0,      label: "Encaissement banque" },
      { entryId: entry.id, accountId: clientAcc.id, debit: 0,      credit: amount, label: "Solde client" },
    ]);
  }

  const [client] = sale.clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, sale.clientId))
    : [undefined];

  req.log.info({ paymentId: payment.id, amount, method }, "Encaissement client enregistré");
  res.status(201).json({
    ...payment,
    createdAt: payment.createdAt.toISOString(),
    sale: { ...sale, createdAt: sale.createdAt.toISOString(), client },
  });
});

// ─── POST /payments/purchase  (paiement fournisseur → D401/C512 ou C53) ──────
const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  purchaseId: z.string().optional(),
  amount:     z.number().positive(),
  method:     z.string().min(1),
  provider:   z.string().optional(),
  reference:  z.string().optional(),
  note:       z.string().optional(),
});

router.post("/payments/purchase", requireAuth, async (req, res): Promise<void> => {
  const parsed = supplierPaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Données invalides" }); return; }

  const { supplierId, purchaseId, amount, method, provider, reference, note } = parsed.data;

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!supplier) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  const [supplierAcc] = await db.select().from(accountsTable).where(eq(accountsTable.code, "401"));
  const bankCode      = method === "cash" ? "53" : "512";
  const [bankAcc]     = await db.select().from(accountsTable).where(eq(accountsTable.code, bankCode));

  let journalEntryId: string | null = null;

  if (supplierAcc && bankAcc) {
    const txRef = `PAY-FRN-${Date.now().toString(36).toUpperCase()}`;
    const desc  = `Paiement fournisseur ${supplier.name}${purchaseId ? " — achat " + purchaseId.slice(0, 8).toUpperCase() : ""}${reference ? " — réf " + reference : ""}`;

    const [entry] = await db.insert(journalEntriesTable).values({
      date: new Date(), reference: txRef, description: desc,
    }).returning();

    await db.insert(journalLinesTable).values([
      { entryId: entry.id, accountId: supplierAcc.id, debit: amount, credit: 0,      label: `Paiement ${supplier.name}` },
      { entryId: entry.id, accountId: bankAcc.id,     debit: 0,      credit: amount, label: method === "cash" ? "Sortie caisse" : "Sortie banque" },
    ]);
    journalEntryId = entry.id;

    // Track in bank_transactions (outflow = negative amount)
    await db.execute(sql`
      INSERT INTO bank_transactions (id, date, description, amount, currency, reference, status, journal_entry_id)
      VALUES (
        gen_random_uuid()::text, NOW(),
        ${`Paiement fournisseur — ${supplier.name}${note ? " — " + note : ""}`},
        ${-amount}, 'MGA', ${txRef}, 'matched', ${journalEntryId}
      )
    `);
  }

  req.log.info({ supplierId, amount, method, reference }, "Paiement fournisseur enregistré");
  res.status(201).json({
    success: true,
    supplier: { id: supplier.id, name: supplier.name },
    amount, method, provider, reference, note, journalEntryId,
    createdAt: new Date().toISOString(),
  });
});

// ─── DELETE /payments/:id  (client payment) ───────────────────────────────────
router.delete("/payments/:id", requireAuth, requireRole("SUPER_ADMIN", "ACCOUNTANT"), async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Paiement introuvable" }); return; }

  // Delete associated journal entry if any
  const entryRow = (await db.execute(sql`
    SELECT id FROM journal_entries WHERE reference = ${'PAIEMENT-' + id.slice(0, 8).toUpperCase()} LIMIT 1
  `)).rows[0] as any;

  await db.delete(paymentsTable).where(eq(paymentsTable.id, id));

  if (entryRow?.id) {
    await db.execute(sql`DELETE FROM journal_lines WHERE entry_id = ${entryRow.id}`);
    await db.execute(sql`DELETE FROM journal_entries WHERE id = ${entryRow.id}`);
  }

  req.log.info({ paymentId: id }, "Encaissement client supprimé");
  res.json({ success: true });
});

// ─── DELETE /payments/purchase/:id  (supplier payment / bank_transaction) ─────
router.delete("/payments/purchase/:id", requireAuth, requireRole("SUPER_ADMIN", "ACCOUNTANT"), async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;

  const txRow = (await db.execute(sql`
    SELECT id, journal_entry_id FROM bank_transactions WHERE id = ${id} AND reference LIKE 'PAY-FRN-%' LIMIT 1
  `)).rows[0] as any;

  if (!txRow) { res.status(404).json({ error: "Paiement fournisseur introuvable" }); return; }

  await db.execute(sql`DELETE FROM bank_transactions WHERE id = ${id}`);

  if (txRow.journal_entry_id) {
    await db.execute(sql`DELETE FROM journal_lines WHERE entry_id = ${txRow.journal_entry_id}`);
    await db.execute(sql`DELETE FROM journal_entries WHERE id = ${txRow.journal_entry_id}`);
  }

  req.log.info({ txId: id }, "Paiement fournisseur supprimé");
  res.json({ success: true });
});

export default router;
