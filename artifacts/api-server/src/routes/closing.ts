/**
 * Clôture Mensuelle — Monthly Accounting Close
 *
 *   GET    /api/accounting/periods              — list all periods
 *   POST   /api/accounting/periods              — create period (idempotent)
 *   GET    /api/accounting/periods/:id/checklist — run pre-close checklist
 *   POST   /api/accounting/periods/:id/close    — generate entries + close (ACCOUNTANT|SUPER_ADMIN)
 *   POST   /api/accounting/periods/:id/reopen   — reopen (SUPER_ADMIN only)
 *   GET    /api/accounting/periods/:id/logs     — closing history
 *   GET    /api/accounting/periods/:id/snapshot/excel — Excel balance download
 *   GET    /api/accounting/periods/:id/snapshot/pdf   — HTML for print-to-PDF
 */
import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import * as XLSX from "xlsx";
import {
  db,
  accountingPeriodsTable,
  closingLogsTable,
  journalEntriesTable,
  journalLinesTable,
  accountsTable,
  fixedAssetsTable,
  payrollTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { loadUser, requireRole, ROLES } from "../middlewares/roles";

const router: IRouter = Router();

// ── Raw-SQL helper ────────────────────────────────────────────────────────────
async function query<T>(stmt: ReturnType<typeof sql>): Promise<T[]> {
  const r = await db.execute(stmt);
  return r.rows as T[];
}

// ── Log helper ────────────────────────────────────────────────────────────────
async function addLog(
  periodId: string,
  action: string,
  details: object,
  userEmail: string | null,
) {
  await db.insert(closingLogsTable).values({
    id: crypto.randomUUID(),
    periodId,
    action,
    details,
    userEmail: userEmail ?? "system",
  });
}

// ── Account lookup ────────────────────────────────────────────────────────────
async function findAccount(code: string) {
  const rows = await db.select().from(accountsTable).where(eq(accountsTable.code, code));
  return rows[0] ?? null;
}

// ── GET /accounting/periods ───────────────────────────────────────────────────
router.get("/accounting/periods", requireAuth, async (_req, res): Promise<void> => {
  const periods = await db
    .select()
    .from(accountingPeriodsTable)
    .orderBy(desc(accountingPeriodsTable.year), desc(accountingPeriodsTable.month));
  res.json(periods);
});

// ── POST /accounting/periods ──────────────────────────────────────────────────
router.post("/accounting/periods", requireAuth, loadUser, async (req, res): Promise<void> => {
  const { year, month } = req.body as { year: string; month: string };
  if (!year || !month) {
    res.status(400).json({ error: "year et month requis (ex: '2025', '06')" });
    return;
  }
  const existing = await db
    .select()
    .from(accountingPeriodsTable)
    .where(and(eq(accountingPeriodsTable.year, String(year)), eq(accountingPeriodsTable.month, String(month).padStart(2, "0"))));
  if (existing.length > 0) {
    res.json(existing[0]);
    return;
  }
  const [period] = await db
    .insert(accountingPeriodsTable)
    .values({ year: String(year), month: String(month).padStart(2, "0") })
    .returning();
  res.status(201).json(period);
});

// ── Pre-close checklist ───────────────────────────────────────────────────────
async function runChecklist(year: string, month: string) {
  const checks: { id: string; label: string; ok: boolean; detail: string }[] = [];

  // Date range for the period
  const monthNum  = parseInt(month);
  const yearNum   = parseInt(year);
  const dateFrom  = new Date(yearNum, monthNum - 1, 1);
  const dateTo    = new Date(yearNum, monthNum, 0, 23, 59, 59);

  // 1. Écritures déséquilibrées (debit ≠ credit per entry)
  type UnbalRow = { entry_id: string; diff: string };
  const unbalanced = await query<UnbalRow>(sql`
    SELECT jl.entry_id,
           ABS(SUM(jl.debit) - SUM(jl.credit)) AS diff
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.date >= ${dateFrom} AND je.date <= ${dateTo}
    GROUP BY jl.entry_id
    HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.01
  `);
  checks.push({
    id: "balanced",
    label: "Écritures équilibrées (débit = crédit)",
    ok: unbalanced.length === 0,
    detail: unbalanced.length === 0
      ? "Toutes les écritures sont équilibrées"
      : `${unbalanced.length} écriture(s) déséquilibrée(s) détectée(s)`,
  });

  // 2. Écritures en brouillon (non validées)
  type DraftRow = { cnt: string };
  const drafts = await query<DraftRow>(sql`
    SELECT COUNT(*) AS cnt
    FROM journal_entries
    WHERE status = 'draft'
      AND date >= ${dateFrom} AND date <= ${dateTo}
  `);
  const draftCount = parseInt(String(drafts[0]?.cnt ?? "0"));
  checks.push({
    id: "no_drafts",
    label: "Aucune écriture en brouillon",
    ok: draftCount === 0,
    detail: draftCount === 0
      ? "Toutes les écritures sont validées ou verrouillées"
      : `${draftCount} écriture(s) encore en brouillon — à valider avant clôture`,
  });

  // 3. Paie générée pour la période
  const payrollMonth = `${year}-${month.padStart(2, "0")}`;
  const payrollRows = await db
    .select()
    .from(payrollTable)
    .where(eq(payrollTable.month, payrollMonth));
  checks.push({
    id: "payroll",
    label: `Paie générée pour ${month}/${year}`,
    ok: payrollRows.length > 0,
    detail: payrollRows.length > 0
      ? `${payrollRows.length} fiche(s) de paie générée(s)`
      : `Aucune fiche de paie trouvée pour ${payrollMonth} — vérifier le module RH`,
  });

  // 4. Immobilisations actives (amortissements disponibles)
  const assets = await db
    .select()
    .from(fixedAssetsTable)
    .where(eq(fixedAssetsTable.status, "active"));
  checks.push({
    id: "assets",
    label: "Immobilisations enregistrées",
    ok: assets.length > 0,
    detail: assets.length > 0
      ? `${assets.length} immobilisation(s) active(s) — amortissements à générer`
      : "Aucune immobilisation active (les amortissements seront sautés)",
  });

  // 5. Compte 681 et 28x existent (pré-requis amortissement)
  const acc681 = await findAccount("681000");
  const acc28  = (await db.select().from(accountsTable)).filter(a => a.code.startsWith("28"));
  checks.push({
    id: "amort_accounts",
    label: "Comptes amortissement (681, 28x) configurés",
    ok: acc681 !== null && acc28.length > 0,
    detail: acc681 !== null && acc28.length > 0
      ? `Compte 681 et ${acc28.length} compte(s) 28x prêts`
      : "Comptes 681000 ou 28x manquants — à créer dans le plan comptable",
  });

  // 6. Rapprochement bancaire (vérifier transactions non rapprochées)
  type ReconRow = { cnt: string };
  const unrecon = await query<ReconRow>(sql`
    SELECT COUNT(*) AS cnt FROM bank_transactions
    WHERE matched = false
      AND date >= ${dateFrom} AND date <= ${dateTo}
  `);
  const unreconCount = parseInt(String(unrecon[0]?.cnt ?? "0"));
  checks.push({
    id: "bank_reconciliation",
    label: "Rapprochement bancaire",
    ok: unreconCount === 0,
    detail: unreconCount === 0
      ? "Toutes les transactions bancaires sont rapprochées"
      : `${unreconCount} transaction(s) bancaire(s) non rapprochée(s) — à vérifier`,
  });

  const valid = checks.every(c => c.ok || c.id === "payroll" || c.id === "bank_reconciliation" || c.id === "amort_accounts" || c.id === "assets");
  const errors = checks.filter(c => !c.ok).map(c => c.label);
  const blocking = checks.filter(c => !c.ok && (c.id === "balanced" || c.id === "no_drafts"));

  return { valid: blocking.length === 0, checks, errors, blockingErrors: blocking.map(c => c.label) };
}

// ── GET /accounting/periods/:id/checklist ─────────────────────────────────────
router.get("/accounting/periods/:id/checklist", requireAuth, loadUser, async (req, res): Promise<void> => {
  const [period] = await db
    .select()
    .from(accountingPeriodsTable)
    .where(eq(accountingPeriodsTable.id, String(req.params.id)));
  if (!period) { res.status(404).json({ error: "Période introuvable" }); return; }

  const result = await runChecklist(period.year, period.month);

  await addLog(period.id, "check", result, req.currentUser?.email ?? null);

  res.json(result);
});

// ── POST /accounting/periods/:id/close ───────────────────────────────────────
router.post(
  "/accounting/periods/:id/close",
  requireAuth,
  loadUser,
  requireRole(ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT),
  async (req, res): Promise<void> => {
    const [period] = await db
      .select()
      .from(accountingPeriodsTable)
      .where(eq(accountingPeriodsTable.id, String(req.params.id)));
    if (!period) { res.status(404).json({ error: "Période introuvable" }); return; }
    if (period.status === "closed") {
      res.status(400).json({ error: "Période déjà clôturée" });
      return;
    }

    // ── Run checklist — block on critical errors ──────────────────────────────
    const checklist = await runChecklist(period.year, period.month);
    if (!checklist.valid) {
      res.status(422).json({
        error: "Clôture bloquée — erreurs critiques à corriger",
        blockingErrors: checklist.blockingErrors,
        checklist: checklist.checks,
      });
      return;
    }

    // ── Mark period as closing ────────────────────────────────────────────────
    await db
      .update(accountingPeriodsTable)
      .set({ status: "closing" })
      .where(eq(accountingPeriodsTable.id, period.id));

    const monthNum = parseInt(period.month);
    const yearNum  = parseInt(period.year);
    const dateFrom = new Date(yearNum, monthNum - 1, 1);
    const dateTo   = new Date(yearNum, monthNum, 0, 23, 59, 59);
    const closingDate = new Date(yearNum, monthNum, 0); // last day of month
    const ref = `CLOTURE-${period.year}-${period.month}`;
    const generatedEntries: string[] = [];
    const userEmail = req.currentUser?.email ?? "system";

    // ── A. Amortissements (681 → 28x) ────────────────────────────────────────
    const assets = await db
      .select()
      .from(fixedAssetsTable)
      .where(eq(fixedAssetsTable.status, "active"));

    const acc681 = await findAccount("681000");
    if (acc681 && assets.length > 0) {
      for (const asset of assets) {
        const annualDep = (asset.value - (asset.residualValue ?? 0)) / (asset.durationMonths / 12);
        const monthlyDep = annualDep / 12;
        if (monthlyDep <= 0) continue;

        // Find matching 28x account (simplified: use 281000 or create note)
        const amortCode = "281000";
        let acc28 = await findAccount(amortCode);
        if (!acc28) {
          const [created] = await db.insert(accountsTable).values({
            id: crypto.randomUUID(), code: amortCode,
            name: "Amortissements immobilisations corporelles", type: "asset",
          }).returning();
          acc28 = created;
        }

        const [entry] = await db.insert(journalEntriesTable).values({
          id: crypto.randomUUID(),
          date: closingDate,
          reference: `${ref}-AMORT-${asset.id.slice(0, 6)}`,
          description: `Dotation amortissement — ${asset.name} (${period.month}/${period.year})`,
          status: "locked",
        }).returning();

        await db.insert(journalLinesTable).values([
          { id: crypto.randomUUID(), entryId: entry.id, accountId: acc681.id, debit: monthlyDep, credit: 0, label: `Dotation ${asset.name}` },
          { id: crypto.randomUUID(), entryId: entry.id, accountId: acc28.id,  debit: 0, credit: monthlyDep, label: `Amort. ${asset.name}` },
        ]);

        // Update asset accumulated depreciation
        await db
          .update(fixedAssetsTable)
          .set({ accumulatedDepreciation: (asset.accumulatedDepreciation ?? 0) + monthlyDep })
          .where(eq(fixedAssetsTable.id, asset.id));

        generatedEntries.push(`Amortissement ${asset.name}: ${monthlyDep.toFixed(2)} MGA`);
      }
    }

    // ── B. Lock all journal entries for this period ───────────────────────────
    await db
      .update(journalEntriesTable)
      .set({ status: "locked" })
      .where(
        and(
          eq(journalEntriesTable.status, "validated"),
          sql`${journalEntriesTable.date} >= ${dateFrom}`,
          sql`${journalEntriesTable.date} <= ${dateTo}`,
        ),
      );

    // ── C. Build financial snapshot ───────────────────────────────────────────
    type AccRow = { code: string; name: string; total_debit: string; total_credit: string };
    const accRows = await query<AccRow>(sql`
      SELECT a.code, a.name,
             COALESCE(SUM(jl.debit),  0) AS total_debit,
             COALESCE(SUM(jl.credit), 0) AS total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.entry_id
      WHERE je.date >= ${dateFrom} AND je.date <= ${dateTo}
      GROUP BY a.code, a.name
      ORDER BY a.code
    `);

    const snapshot = {
      period:    `${period.month}/${period.year}`,
      closedAt:  new Date().toISOString(),
      closedBy:  userEmail,
      accounts:  accRows.map(r => ({
        code:        r.code,
        name:        r.name,
        totalDebit:  parseFloat(String(r.total_debit)),
        totalCredit: parseFloat(String(r.total_credit)),
        balance:     parseFloat(String(r.total_debit)) - parseFloat(String(r.total_credit)),
      })),
      generatedEntries,
    };

    // ── D. Save snapshot & mark closed ───────────────────────────────────────
    await db
      .update(accountingPeriodsTable)
      .set({
        status:       "closed",
        closedAt:     new Date(),
        closedBy:     userEmail,
        snapshotData: snapshot,
      })
      .where(eq(accountingPeriodsTable.id, period.id));

    await addLog(period.id, "close", { generatedEntries, checklistSummary: checklist.checks.map(c => ({ id: c.id, ok: c.ok })) }, userEmail);

    res.json({
      success: true,
      message: `Période ${period.month}/${period.year} clôturée avec succès`,
      generatedEntries,
      entriesLocked: true,
    });
  },
);

// ── POST /accounting/periods/:id/reopen ──────────────────────────────────────
router.post(
  "/accounting/periods/:id/reopen",
  requireAuth,
  loadUser,
  requireRole(ROLES.SUPER_ADMIN),
  async (req, res): Promise<void> => {
    const [period] = await db
      .select()
      .from(accountingPeriodsTable)
      .where(eq(accountingPeriodsTable.id, String(req.params.id)));
    if (!period) { res.status(404).json({ error: "Période introuvable" }); return; }
    if (period.status !== "closed") {
      res.status(400).json({ error: "La période n'est pas clôturée" });
      return;
    }

    const { reason } = req.body as { reason?: string };
    const userEmail = req.currentUser?.email ?? "system";

    await db
      .update(accountingPeriodsTable)
      .set({ status: "open", closedAt: null, closedBy: null })
      .where(eq(accountingPeriodsTable.id, period.id));

    await addLog(period.id, "reopen", { reason: reason ?? "Non précisée", reopenedBy: userEmail }, userEmail);

    res.json({ success: true, message: `Période ${period.month}/${period.year} réouverte` });
  },
);

// ── GET /accounting/periods/:id/logs ─────────────────────────────────────────
router.get("/accounting/periods/:id/logs", requireAuth, async (req, res): Promise<void> => {
  const logs = await db
    .select()
    .from(closingLogsTable)
    .where(eq(closingLogsTable.periodId, String(req.params.id)))
    .orderBy(desc(closingLogsTable.createdAt));
  res.json(logs);
});

// ── GET /accounting/periods/:id/snapshot/excel ────────────────────────────────
router.get("/accounting/periods/:id/snapshot/excel", requireAuth, async (req, res): Promise<void> => {
  const [period] = await db
    .select()
    .from(accountingPeriodsTable)
    .where(eq(accountingPeriodsTable.id, String(req.params.id)));
  if (!period) { res.status(404).json({ error: "Période introuvable" }); return; }

  const snap = period.snapshotData as { accounts?: { code: string; name: string; totalDebit: number; totalCredit: number; balance: number }[] } | null;
  const rows = snap?.accounts ?? [];

  const wsData = [
    ["Code", "Intitulé", "Débit total", "Crédit total", "Solde"],
    ...rows.map(r => [r.code, r.name, r.totalDebit, r.totalCredit, r.balance]),
    [],
    ["TOTAL DÉBIT", "", rows.reduce((s, r) => s + r.totalDebit, 0), "", ""],
    ["TOTAL CRÉDIT", "", "", rows.reduce((s, r) => s + r.totalCredit, 0), ""],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, `Balance ${period.month}-${period.year}`);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="balance-${period.year}-${period.month}.xlsx"`);
  res.send(buf);
});

// ── GET /accounting/periods/:id/snapshot/pdf ─────────────────────────────────
router.get("/accounting/periods/:id/snapshot/pdf", requireAuth, async (req, res): Promise<void> => {
  const [period] = await db
    .select()
    .from(accountingPeriodsTable)
    .where(eq(accountingPeriodsTable.id, String(req.params.id)));
  if (!period) { res.status(404).json({ error: "Période introuvable" }); return; }

  const snap = period.snapshotData as {
    accounts?: { code: string; name: string; totalDebit: number; totalCredit: number; balance: number }[];
    closedAt?: string; closedBy?: string;
  } | null;
  const rows = snap?.accounts ?? [];
  const fmt = (n: number) => n.toLocaleString("fr-MG", { minimumFractionDigits: 0 }) + " Ar";

  const produits = rows.filter(r => r.code.startsWith("7"));
  const charges  = rows.filter(r => r.code.startsWith("6"));
  const totalP   = produits.reduce((s, r) => s + (r.totalCredit - r.totalDebit), 0);
  const totalC   = charges.reduce( (s, r) => s + (r.totalDebit  - r.totalCredit), 0);
  const result   = totalP - totalC;

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>Clôture ${period.month}/${period.year}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }
  h1 { text-align: center; color: #1e3a5f; font-size: 18px; margin-bottom: 4px; }
  .sub { text-align: center; color: #666; margin-bottom: 20px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #1e3a5f; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f8fafc; }
  .total-row { background: #e0f2fe !important; font-weight: bold; }
  .result-row { background: ${result >= 0 ? "#d1fae5" : "#fee2e2"} !important; font-weight: bold; }
  .text-right { text-align: right; }
  h2 { color: #1e3a5f; font-size: 13px; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; margin-top: 24px; }
  @media print { @page { size: A4; margin: 15mm; } }
</style>
</head><body onload="window.print()">
<h1>CLÔTURE MENSUELLE — ${period.month}/${period.year}</h1>
<p class="sub">Clôturé le ${snap?.closedAt ? new Date(snap.closedAt).toLocaleDateString("fr-FR") : "—"} par ${snap?.closedBy ?? "—"}</p>

<h2>Balance Générale</h2>
<table>
  <thead><tr><th>Code</th><th>Intitulé</th><th class="text-right">Débit</th><th class="text-right">Crédit</th><th class="text-right">Solde</th></tr></thead>
  <tbody>
    ${rows.map(r => `<tr>
      <td>${r.code}</td>
      <td>${r.name}</td>
      <td class="text-right">${fmt(r.totalDebit)}</td>
      <td class="text-right">${fmt(r.totalCredit)}</td>
      <td class="text-right" style="color:${r.balance >= 0 ? "#047857" : "#dc2626"}">${fmt(r.balance)}</td>
    </tr>`).join("")}
    <tr class="total-row">
      <td colspan="2">TOTAUX</td>
      <td class="text-right">${fmt(rows.reduce((s, r) => s + r.totalDebit, 0))}</td>
      <td class="text-right">${fmt(rows.reduce((s, r) => s + r.totalCredit, 0))}</td>
      <td></td>
    </tr>
  </tbody>
</table>

<h2>Compte de Résultat</h2>
<table>
  <thead><tr><th>Code</th><th>Intitulé</th><th class="text-right">Montant</th></tr></thead>
  <tbody>
    <tr><td colspan="3" style="background:#f0fdf4;font-weight:bold;padding:6px 8px">PRODUITS (7x)</td></tr>
    ${produits.map(r => `<tr><td>${r.code}</td><td>${r.name}</td><td class="text-right">${fmt(r.totalCredit - r.totalDebit)}</td></tr>`).join("")}
    <tr class="total-row"><td colspan="2">Total Produits</td><td class="text-right">${fmt(totalP)}</td></tr>
    <tr><td colspan="3" style="background:#fef2f2;font-weight:bold;padding:6px 8px">CHARGES (6x)</td></tr>
    ${charges.map(r => `<tr><td>${r.code}</td><td>${r.name}</td><td class="text-right">${fmt(r.totalDebit - r.totalCredit)}</td></tr>`).join("")}
    <tr class="total-row"><td colspan="2">Total Charges</td><td class="text-right">${fmt(totalC)}</td></tr>
    <tr class="result-row"><td colspan="2">Résultat de l'exercice</td><td class="text-right">${fmt(result)}</td></tr>
  </tbody>
</table>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
