import { Router, type IRouter } from "express";
import { db, accountsTable, journalLinesTable, journalEntriesTable } from "@workspace/db";
import { eq, sql, inArray, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Period helper ────────────────────────────────────────────────────────────
function getPeriodDates(from?: string, to?: string) {
  const now = new Date();
  const fromDate = from ? new Date(from) : new Date(now.getFullYear(), 0, 1);
  const toDate = to ? new Date(to) : now;
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

// ─── 1. Compte de résultat ────────────────────────────────────────────────────
router.get("/reports/income", requireAuth, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.code);

  // Period-filtered aggregation
  const lines = await db.execute(sql`
    SELECT jl.account_id,
           COALESCE(SUM(jl.debit), 0)  as total_debit,
           COALESCE(SUM(jl.credit), 0) as total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.date >= ${fromDate} AND je.date <= ${toDate}
    GROUP BY jl.account_id
  `);

  const lineMap = new Map((lines.rows as any[]).map(l => [l.account_id, l]));

  let totalRevenue = 0;
  let totalCharges = 0;
  const revenues: any[] = [];
  const charges: any[] = [];

  for (const a of accounts) {
    const l = lineMap.get(a.id) as any;
    if (!l) continue;
    const debit = Number(l.total_debit);
    const credit = Number(l.total_credit);
    if (a.type === "revenue") {
      const amount = credit - debit;
      if (amount !== 0) { revenues.push({ ...a, amount, debit, credit }); totalRevenue += amount; }
    } else if (a.type === "expense") {
      const amount = debit - credit;
      if (amount !== 0) { charges.push({ ...a, amount, debit, credit }); totalCharges += amount; }
    }
  }

  // Monthly chart data
  const monthly = await db.execute(sql`
    SELECT
      TO_CHAR(je.date, 'YYYY-MM') as month,
      COALESCE(SUM(CASE WHEN a.type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END), 0) as revenues,
      COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END), 0) as charges
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN accounts a ON a.id = jl.account_id
    WHERE a.type IN ('revenue', 'expense')
      AND je.date >= ${new Date(new Date().getFullYear(), 0, 1)}
    GROUP BY TO_CHAR(je.date, 'YYYY-MM')
    ORDER BY month
  `);

  const margeNette = totalRevenue > 0 ? ((totalRevenue - totalCharges) / totalRevenue) * 100 : 0;

  res.json({
    revenues, charges, totalRevenue, totalCharges,
    resultat: totalRevenue - totalCharges,
    margeNette,
    monthlyChart: (monthly.rows as any[]).map(r => ({
      month: r.month as string,
      revenues: Number(r.revenues),
      charges: Number(r.charges),
      resultat: Number(r.revenues) - Number(r.charges),
    })),
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
  });
});

// ─── 2. Balance générale ───────────────────────────────────────────────────────
router.get("/reports/balance", requireAuth, async (req, res): Promise<void> => {
  const { from, to, q } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.code);

  const lines = await db.execute(sql`
    SELECT jl.account_id,
           COALESCE(SUM(jl.debit), 0)  as total_debit,
           COALESCE(SUM(jl.credit), 0) as total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.date >= ${fromDate} AND je.date <= ${toDate}
    GROUP BY jl.account_id
  `);

  const lineMap = new Map((lines.rows as any[]).map(l => [l.account_id, l]));

  let rows = accounts.map(a => {
    const l = lineMap.get(a.id) as any;
    const debit = l ? Number(l.total_debit) : 0;
    const credit = l ? Number(l.total_credit) : 0;
    const solde = debit - credit;
    return { ...a, debit, credit, solde };
  }).filter(a => a.debit !== 0 || a.credit !== 0);

  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(r => r.code.toLowerCase().includes(lower) || r.name.toLowerCase().includes(lower));
  }

  const totals = {
    debit: rows.reduce((s, r) => s + r.debit, 0),
    credit: rows.reduce((s, r) => s + r.credit, 0),
    solde: rows.reduce((s, r) => s + r.solde, 0),
  };

  // Anomaly detection
  const anomalies: string[] = [];
  if (Math.abs(totals.debit - totals.credit) > 0.01) {
    anomalies.push(`Balance déséquilibrée : Débit ${totals.debit.toFixed(2)} ≠ Crédit ${totals.credit.toFixed(2)}`);
  }
  rows.forEach(r => {
    if ((r.type === "asset" || r.type === "expense") && r.solde < -1) {
      anomalies.push(`Solde créditeur anormal : ${r.code} ${r.name} (${r.solde.toFixed(2)})`);
    }
    if ((r.type === "liability" || r.type === "revenue") && r.solde > 1) {
      anomalies.push(`Solde débiteur anormal : ${r.code} ${r.name} (${r.solde.toFixed(2)})`);
    }
  });

  res.json({ rows, totals, anomalies, period: { from: fromDate.toISOString(), to: toDate.toISOString() } });
});

// ─── 3. Grand livre ────────────────────────────────────────────────────────────
router.get("/reports/ledger/:accountCode", requireAuth, async (req, res): Promise<void> => {
  const { accountCode } = req.params as Record<string, string>;
  const { from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.code, accountCode));
  if (!account) { res.status(404).json({ error: "Compte non trouvé" }); return; }

  const rows = await db.execute(sql`
    SELECT
      je.id    as entry_id,
      je.date,
      je.reference,
      je.description,
      je.status,
      jl.debit,
      jl.credit,
      jl.label,
      SUM(jl.debit - jl.credit) OVER (
        ORDER BY je.date ASC, je.id ASC
      ) as running_balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ${account.id}
      AND je.date >= ${fromDate}
      AND je.date <= ${toDate}
    ORDER BY je.date ASC, je.id ASC
  `);

  const lines = (rows.rows as any[]).map(r => ({
    entryId: r.entry_id,
    date: r.date,
    reference: r.reference,
    description: r.description ?? "",
    status: r.status,
    label: r.label ?? "",
    debit: Number(r.debit),
    credit: Number(r.credit),
    runningBalance: Number(r.running_balance),
  }));

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  res.json({ account, lines, totalDebit, totalCredit, solde: totalDebit - totalCredit });
});

// ─── 4. Journal comptable ─────────────────────────────────────────────────────
router.get("/reports/journal", requireAuth, async (req, res): Promise<void> => {
  const { from, to, type } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const entries = await db.execute(sql`
    SELECT
      je.id, je.date, je.reference, je.description, je.status,
      json_agg(
        json_build_object(
          'accountCode', a.code,
          'accountName', a.name,
          'accountType', a.type,
          'debit',       jl.debit,
          'credit',      jl.credit,
          'label',       jl.label
        ) ORDER BY jl.id
      ) as lines,
      SUM(jl.debit)  as total_debit,
      SUM(jl.credit) as total_credit
    FROM journal_entries je
    JOIN journal_lines jl ON jl.entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id
    WHERE je.date >= ${fromDate} AND je.date <= ${toDate}
    GROUP BY je.id
    ORDER BY je.date DESC, je.id DESC
  `);

  let rows = (entries.rows as any[]).map(r => ({
    id: r.id,
    date: r.date,
    reference: r.reference as string,
    description: r.description ?? "",
    status: r.status,
    lines: r.lines as any[],
    totalDebit: Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    isBalanced: Math.abs(Number(r.total_debit) - Number(r.total_credit)) < 0.01,
    // Journal type from reference prefix
    journalType: classifyEntry(r.reference as string, r.lines as any[]),
  }));

  if (type && type !== "all") {
    rows = rows.filter(r => r.journalType === type);
  }

  // Group by journal type
  const byType: Record<string, any[]> = {};
  for (const r of rows) {
    if (!byType[r.journalType]) byType[r.journalType] = [];
    byType[r.journalType].push(r);
  }

  const totals = {
    debit: rows.reduce((s, r) => s + r.totalDebit, 0),
    credit: rows.reduce((s, r) => s + r.totalCredit, 0),
  };

  res.json({ entries: rows, byType, totals, period: { from: fromDate.toISOString(), to: toDate.toISOString() } });
});

function classifyEntry(reference: string, lines: any[]): string {
  const ref = (reference ?? "").toUpperCase();
  if (ref.startsWith("VENTE") || ref.startsWith("VTE") || ref.startsWith("FAC")) return "ventes";
  if (ref.startsWith("ACHAT") || ref.startsWith("ACH") || ref.startsWith("PUR")) return "achats";
  if (ref.startsWith("PAY") || ref.startsWith("BNK") || ref.startsWith("BANK")) return "banque";
  if (ref.startsWith("AMORT") || ref.startsWith("CESS")) return "od";
  if (ref.startsWith("ECART")) return "od";
  // Check accounts used
  const codes = (lines ?? []).map((l: any) => String(l.accountCode ?? ""));
  if (codes.some(c => c.startsWith("70"))) return "ventes";
  if (codes.some(c => c.startsWith("60"))) return "achats";
  if (codes.some(c => c.startsWith("51"))) return "banque";
  return "od";
}

// ─── 5. TVA & fiscalité ───────────────────────────────────────────────────────
router.get("/reports/tva", requireAuth, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const accounts = await db.select().from(accountsTable);
  const tvaAccounts = accounts.filter(a => ["445", "44566", "44571"].includes(a.code));

  if (!tvaAccounts.length) {
    res.json({ tvaCollectee: 0, tvaDeduite: 0, solde: 0, fromJournal: {}, fromInvoices: {}, period: {} });
    return;
  }

  const tvaIds = tvaAccounts.map(a => a.id);
  const lines = await db.execute(sql`
    SELECT jl.account_id,
           COALESCE(SUM(jl.debit), 0)  as total_debit,
           COALESCE(SUM(jl.credit), 0) as total_credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ANY(${sql.raw("ARRAY['" + tvaIds.join("','") + "']::text[]")})
      AND je.date >= ${fromDate} AND je.date <= ${toDate}
    GROUP BY jl.account_id
  `);

  let tvaCollectee = 0;
  let tvaDeduite = 0;

  for (const l of lines.rows as any[]) {
    const acc = tvaAccounts.find(a => a.id === l.account_id);
    if (!acc) continue;
    const debit = Number(l.total_debit);
    const credit = Number(l.total_credit);
    if (acc.code === "44566") tvaDeduite += debit - credit;
    else if (acc.code === "44571") tvaCollectee += credit - debit;
    else { tvaCollectee += credit; tvaDeduite += debit; }
  }

  // Sales totals (ventes HT from 701)
  const salesAcc = accounts.find(a => a.code === "701");
  const salesLines = salesAcc ? await db.execute(sql`
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as ht
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ${salesAcc.id}
      AND je.date >= ${fromDate} AND je.date <= ${toDate}
  `) : { rows: [{ ht: 0 }] };

  const ventesHT = Number((salesLines.rows[0] as any)?.ht ?? 0);
  const exportVentes = ventesHT; // all vanilla exports are 0% TVA

  res.json({
    tvaCollectee, tvaDeduite, solde: tvaCollectee - tvaDeduite,
    ventesHT, exportVentes, ventesLocales: 0,
    tauxTVA: 20,
    fromJournal: { tvaCollectee, tvaDeduite },
    fromInvoices: {},
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
  });
});

// ─── 6. Trésorerie ────────────────────────────────────────────────────────────
router.get("/reports/treasury", requireAuth, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const accounts = await db.select().from(accountsTable);
  const bankAcc = accounts.find(a => a.code === "512");
  const cashAcc = accounts.find(a => a.code === "53");
  const treasuryIds = [bankAcc?.id, cashAcc?.id].filter(Boolean) as string[];

  if (!treasuryIds.length) {
    res.json({ bank: 0, cash: 0, total: 0, inflows: 0, outflows: 0, monthly: [] });
    return;
  }

  // Current balances (cumulative, not period-filtered)
  const balances = await db.execute(sql`
    SELECT jl.account_id,
           COALESCE(SUM(jl.debit), 0)  as total_debit,
           COALESCE(SUM(jl.credit), 0) as total_credit
    FROM journal_lines jl
    WHERE jl.account_id = ANY(${sql.raw("ARRAY['" + treasuryIds.join("','") + "']::text[]")})
    GROUP BY jl.account_id
  `);

  let bank = 0;
  let cash = 0;
  for (const b of balances.rows as any[]) {
    const solde = Number(b.total_debit) - Number(b.total_credit);
    if (b.account_id === bankAcc?.id) bank = solde;
    if (b.account_id === cashAcc?.id) cash = solde;
  }

  // Period flows
  const flows = await db.execute(sql`
    SELECT jl.account_id,
           COALESCE(SUM(jl.debit), 0)  as inflow,
           COALESCE(SUM(jl.credit), 0) as outflow
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ANY(${sql.raw("ARRAY['" + treasuryIds.join("','") + "']::text[]")})
      AND je.date >= ${fromDate} AND je.date <= ${toDate}
    GROUP BY jl.account_id
  `);

  let inflows = 0;
  let outflows = 0;
  for (const f of flows.rows as any[]) {
    inflows += Number(f.inflow);
    outflows += Number(f.outflow);
  }

  // Monthly cash flow (current year)
  const monthly = await db.execute(sql`
    SELECT
      TO_CHAR(je.date, 'YYYY-MM') as month,
      COALESCE(SUM(jl.debit), 0)  as inflow,
      COALESCE(SUM(jl.credit), 0) as outflow,
      COALESCE(SUM(jl.debit - jl.credit), 0) as net
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ANY(${sql.raw("ARRAY['" + treasuryIds.join("','") + "']::text[]")})
      AND je.date >= ${new Date(new Date().getFullYear(), 0, 1)}
    GROUP BY TO_CHAR(je.date, 'YYYY-MM')
    ORDER BY month
  `);

  res.json({
    bank, cash, total: bank + cash, inflows, outflows,
    net: inflows - outflows,
    monthly: (monthly.rows as any[]).map(r => ({
      month: r.month, inflow: Number(r.inflow), outflow: Number(r.outflow), net: Number(r.net),
    })),
  });
});

// ─── 7. Balance auxiliaire clients (compte 411) ───────────────────────────────
router.get("/reports/auxiliaire/clients", requireAuth, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const accounts = await db.select().from(accountsTable);
  const clientsAcc = accounts.find(a => a.code === "411");

  if (!clientsAcc) { res.json({ entries: [], totals: {}, aging: {} }); return; }

  // All movements on account 411
  const rows = await db.execute(sql`
    SELECT
      je.id as entry_id, je.date, je.reference, je.description, je.status,
      jl.debit, jl.credit,
      jl.debit - jl.credit as solde
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ${clientsAcc.id}
      AND je.date >= ${fromDate} AND je.date <= ${toDate}
    ORDER BY je.date DESC
  `);

  const entries = (rows.rows as any[]).map(r => ({
    entryId: r.entry_id, date: r.date, reference: r.reference,
    description: r.description ?? "", status: r.status,
    debit: Number(r.debit), credit: Number(r.credit), solde: Number(r.solde),
    daysOld: Math.floor((Date.now() - new Date(r.date).getTime()) / 86400000),
  }));

  const now = Date.now();
  const aging = {
    current: entries.filter(e => e.daysOld <= 30).reduce((s, e) => s + e.credit, 0),
    days30_60: entries.filter(e => e.daysOld > 30 && e.daysOld <= 60).reduce((s, e) => s + e.credit, 0),
    days60plus: entries.filter(e => e.daysOld > 60).reduce((s, e) => s + e.credit, 0),
  };

  const totals = {
    debit: entries.reduce((s, e) => s + e.debit, 0),
    credit: entries.reduce((s, e) => s + e.credit, 0),
    solde: entries.reduce((s, e) => s + e.solde, 0),
  };

  // Client sales from sales table (separate enrichment)
  const sales = await db.execute(sql`
    SELECT s.client_id, c.name, SUM(s.total_amount) as total_sales
    FROM sales s
    JOIN clients c ON c.id = s.client_id
    GROUP BY s.client_id, c.name
    ORDER BY total_sales DESC
  `).catch(() => ({ rows: [] }));

  res.json({ entries, totals, aging, clientSales: sales.rows });
});

// ─── 8. Balance auxiliaire fournisseurs (compte 401) ─────────────────────────
router.get("/reports/auxiliaire/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const { fromDate, toDate } = getPeriodDates(from, to);

  const accounts = await db.select().from(accountsTable);
  const suppliersAcc = accounts.find(a => a.code === "401");

  if (!suppliersAcc) { res.json({ entries: [], totals: {}, aging: {} }); return; }

  const rows = await db.execute(sql`
    SELECT
      je.id as entry_id, je.date, je.reference, je.description, je.status,
      jl.debit, jl.credit,
      jl.credit - jl.debit as solde_dette
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ${suppliersAcc.id}
      AND je.date >= ${fromDate} AND je.date <= ${toDate}
    ORDER BY je.date DESC
  `);

  const entries = (rows.rows as any[]).map(r => ({
    entryId: r.entry_id, date: r.date, reference: r.reference,
    description: r.description ?? "", status: r.status,
    debit: Number(r.debit), credit: Number(r.credit),
    soldeDette: Number(r.solde_dette),
    daysOld: Math.floor((Date.now() - new Date(r.date).getTime()) / 86400000),
  }));

  const aging = {
    current: entries.filter(e => e.daysOld <= 30).reduce((s, e) => s + e.credit, 0),
    days30_60: entries.filter(e => e.daysOld > 30 && e.daysOld <= 60).reduce((s, e) => s + e.credit, 0),
    days60plus: entries.filter(e => e.daysOld > 60).reduce((s, e) => s + e.credit, 0),
  };

  const totals = {
    debit: entries.reduce((s, e) => s + e.debit, 0),
    credit: entries.reduce((s, e) => s + e.credit, 0),
    soldeDette: entries.reduce((s, e) => s + e.soldeDette, 0),
  };

  // Purchases by supplier
  const purchases = await db.execute(sql`
    SELECT p.supplier_id, s.name, COUNT(*) as nb_purchases,
           SUM(p.total_amount) as total_achats, SUM(p.weight) as total_kg
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    GROUP BY p.supplier_id, s.name
    ORDER BY total_achats DESC
  `).catch(() => ({ rows: [] }));

  res.json({ entries, totals, aging, supplierPurchases: purchases.rows });
});

// ─── 9. Alertes comptables ────────────────────────────────────────────────────
router.get("/reports/alerts", requireAuth, async (req, res): Promise<void> => {
  const alerts: { type: string; severity: string; message: string; data?: any }[] = [];

  // 1. Unbalanced entries
  const unbalanced = await db.execute(sql`
    SELECT je.id, je.reference, je.date, je.status,
           ROUND(SUM(jl.debit)::numeric, 2)  as total_debit,
           ROUND(SUM(jl.credit)::numeric, 2) as total_credit
    FROM journal_entries je
    JOIN journal_lines jl ON jl.entry_id = je.id
    GROUP BY je.id
    HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.01
  `);

  for (const e of unbalanced.rows as any[]) {
    alerts.push({
      type: "unbalanced_entry", severity: "error",
      message: `Écriture déséquilibrée : ${e.reference} (Débit ${Number(e.total_debit).toFixed(2)} ≠ Crédit ${Number(e.total_credit).toFixed(2)})`,
      data: e,
    });
  }

  // 2. Old draft entries (>30 days)
  const oldDrafts = await db.execute(sql`
    SELECT id, reference, date, description FROM journal_entries
    WHERE status = 'draft' AND date < NOW() - INTERVAL '30 days'
    ORDER BY date ASC
  `);

  for (const d of oldDrafts.rows as any[]) {
    alerts.push({
      type: "old_draft", severity: "warning",
      message: `Brouillon non validé depuis ${Math.floor((Date.now() - new Date(d.date).getTime()) / 86400000)} jours : ${d.reference}`,
      data: d,
    });
  }

  // 3. All current draft entries
  const allDrafts = await db.execute(sql`
    SELECT COUNT(*) as count, MIN(date) as oldest FROM journal_entries WHERE status = 'draft'
  `);
  const draftCount = Number((allDrafts.rows[0] as any)?.count ?? 0);
  if (draftCount > 0) {
    alerts.push({
      type: "drafts_pending", severity: "info",
      message: `${draftCount} écriture(s) en brouillon non encore validées`,
      data: { count: draftCount },
    });
  }

  // 4. Check TVA balance
  const accounts = await db.select().from(accountsTable);
  const tva44571 = accounts.find(a => a.code === "44571");
  const tva44566 = accounts.find(a => a.code === "44566");
  if (tva44571 && tva44566) {
    const tvaCheck = await db.execute(sql`
      SELECT jl.account_id, COALESCE(SUM(jl.credit - jl.debit), 0) as net
      FROM journal_lines jl
      WHERE jl.account_id IN (${tva44571.id}, ${tva44566.id})
      GROUP BY jl.account_id
    `).catch(() => ({ rows: [] }));
    if (tvaCheck.rows.length) {
      alerts.push({ type: "tva_info", severity: "info", message: "TVA : vérifiez la déclaration mensuelle sur l'onglet TVA" });
    }
  }

  res.json({
    alerts,
    summary: {
      errors: alerts.filter(a => a.severity === "error").length,
      warnings: alerts.filter(a => a.severity === "warning").length,
      infos: alerts.filter(a => a.severity === "info").length,
    },
  });
});

export default router;
