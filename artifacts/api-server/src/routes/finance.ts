/**
 * Finance Dashboard API
 *
 *   GET /api/finance/dashboard?dateFrom=&dateTo=&currency=MGA
 *
 * Aggregates journal data into KPIs, charts, income statement,
 * balance sheet, lot analysis, and smart alerts — PCG 2005 compliant.
 */
import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { db } from "@workspace/db";

const router: IRouter = Router();

// ── Currency conversion (MGA base) ────────────────────────────────────────────
const RATES: Record<string, number> = { MGA: 1, USD: 1 / 4500, EUR: 1 / 4900 };
function convert(amountMga: number, currency: string): number {
  return amountMga * (RATES[currency] ?? 1);
}

// ── Typed helper: execute raw SQL and get rows array ─────────────────────────
async function query<T>(statement: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(statement);
  return result.rows as T[];
}

// ── Aggregate by account ──────────────────────────────────────────────────────
type AccRow = { code: string; name: string; type: string; total_debit: string; total_credit: string };

async function aggByAccount(dateFrom: string | undefined, dateTo: string | undefined) {
  const rows = await query<AccRow>(sql`
    SELECT a.code, a.name, a.type,
           COALESCE(SUM(jl.debit),  0) AS total_debit,
           COALESCE(SUM(jl.credit), 0) AS total_credit
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.entry_id
    WHERE (${dateFrom ? sql`je.date >= ${new Date(dateFrom)}` : sql`TRUE`})
      AND (${dateTo   ? sql`je.date <= ${new Date(dateTo + "T23:59:59")}` : sql`TRUE`})
    GROUP BY a.code, a.name, a.type
    ORDER BY a.code
  `);
  return rows.map(r => ({
    code:        r.code,
    name:        r.name,
    type:        r.type,
    totalDebit:  parseFloat(String(r.total_debit  ?? 0)),
    totalCredit: parseFloat(String(r.total_credit ?? 0)),
    balance:     parseFloat(String(r.total_debit  ?? 0)) - parseFloat(String(r.total_credit ?? 0)),
  }));
}

// ── Monthly aggregation ───────────────────────────────────────────────────────
type MonthRow = { month: string; family: string; total_debit: string; total_credit: string };

async function monthlyData(dateFrom: string | undefined, dateTo: string | undefined) {
  return query<MonthRow>(sql`
    SELECT TO_CHAR(je.date, 'YYYY-MM') AS month,
           SUBSTRING(a.code, 1, 2)    AS family,
           COALESCE(SUM(jl.debit),  0) AS total_debit,
           COALESCE(SUM(jl.credit), 0) AS total_credit
    FROM journal_entries je
    JOIN journal_lines jl ON jl.entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id
    WHERE (${dateFrom ? sql`je.date >= ${new Date(dateFrom)}` : sql`TRUE`})
      AND (${dateTo   ? sql`je.date <= ${new Date(dateTo + "T23:59:59")}` : sql`TRUE`})
    GROUP BY TO_CHAR(je.date, 'YYYY-MM'), SUBSTRING(a.code, 1, 2)
    ORDER BY month
  `);
}

// ── Lot analysis ──────────────────────────────────────────────────────────────
type LotRow = {
  code: string; grade: string; status: string;
  weight_initial: string; weight_current: string;
  purchase_cost: string; process_cost: string; transport_cost: string; total_cost: string;
};

async function lotAnalysis() {
  const rows = await query<LotRow>(sql`
    SELECT l.code, l.grade, l.status,
           l.weight_initial, l.weight_current,
           COALESCE(lc.purchase_cost,  0) AS purchase_cost,
           COALESCE(lc.process_cost,   0) AS process_cost,
           COALESCE(lc.transport_cost, 0) AS transport_cost,
           COALESCE(lc.total_cost,     0) AS total_cost
    FROM lots l
    LEFT JOIN lot_costs lc ON lc.lot_id = l.id
    ORDER BY lc.total_cost DESC NULLS LAST
    LIMIT 20
  `);
  return rows.map(r => ({
    code:          r.code,
    grade:         r.grade,
    status:        r.status,
    weightInitial: parseFloat(String(r.weight_initial  ?? 0)),
    weightCurrent: parseFloat(String(r.weight_current  ?? 0)),
    purchaseCost:  parseFloat(String(r.purchase_cost   ?? 0)),
    processCost:   parseFloat(String(r.process_cost    ?? 0)),
    transportCost: parseFloat(String(r.transport_cost  ?? 0)),
    totalCost:     parseFloat(String(r.total_cost      ?? 0)),
  }));
}

// ── GET /finance/dashboard ────────────────────────────────────────────────────
router.get("/finance/dashboard", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, currency = "MGA" } = req.query as Record<string, string | undefined>;
  const cur = String(currency ?? "MGA");

  const [accounts, monthly, lots, salesRows] = await Promise.all([
    aggByAccount(dateFrom, dateTo),
    monthlyData(dateFrom, dateTo),
    lotAnalysis(),
    query<{ total_amount: string; currency: string }>(
      sql`SELECT COALESCE(SUM(total_amount), 0) AS total_amount, currency FROM sales GROUP BY currency`
    ),
  ]);

  // ── KPI aggregations ────────────────────────────────────────────────────────
  const sum = (prefix: string, field: "totalDebit" | "totalCredit") =>
    accounts.filter(a => a.code.startsWith(prefix)).reduce((s, a) => s + a[field], 0);

  const revenueMGA    = sum("70", "totalCredit");
  const expensesMGA   = sum("6",  "totalDebit");
  const netMGA        = revenueMGA - expensesMGA;
  const cashMGA       = accounts
    .filter(a => a.code === "512" || a.code.startsWith("512") || a.code === "53" || a.code.startsWith("53"))
    .reduce((s, a) => s + a.balance, 0);
  const receivablesMGA = accounts.filter(a => a.code.startsWith("41")).reduce((s, a) => s + a.balance, 0);
  const payablesMGA    = accounts.filter(a => a.code.startsWith("40")).reduce((s, a) => s + Math.abs(a.balance), 0);
  const stockMGA       = accounts.filter(a => a.code.startsWith("3")).reduce((s, a) => s + a.balance, 0);
  const grossMarginPct = revenueMGA > 0 ? ((revenueMGA - expensesMGA) / revenueMGA) * 100 : 0;

  // ── Monthly chart data ──────────────────────────────────────────────────────
  const monthMap: Record<string, { month: string; revenue: number; expenses: number; cash: number }> = {};
  for (const row of monthly) {
    if (!monthMap[row.month]) monthMap[row.month] = { month: row.month, revenue: 0, expenses: 0, cash: 0 };
    const debit  = parseFloat(String(row.total_debit  ?? 0));
    const credit = parseFloat(String(row.total_credit ?? 0));
    if (row.family?.startsWith("70")) monthMap[row.month].revenue  += credit;
    if (row.family?.startsWith("6"))  monthMap[row.month].expenses += debit;
    if (row.family === "51" || row.family === "53") monthMap[row.month].cash += debit - credit;
  }
  const chartMonthly = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

  let cumCash = 0;
  const chartCashFlow = chartMonthly.map(m => {
    cumCash += m.cash;
    return { month: m.month, cashFlow: cumCash };
  });

  // ── Expense breakdown for pie ───────────────────────────────────────────────
  const expenseBreakdown = accounts
    .filter(a => a.code.startsWith("6") && a.totalDebit > 0)
    .map(a => ({ name: `${a.code} – ${a.name}`, value: a.totalDebit, code: a.code }))
    .sort((a, b) => b.value - a.value);

  // ── Compte de résultat ──────────────────────────────────────────────────────
  const produits = accounts
    .filter(a => /^7/.test(a.code))
    .map(a => ({ code: a.code, name: a.name, amount: a.totalCredit - a.totalDebit }))
    .filter(r => r.amount !== 0);

  const charges = accounts
    .filter(a => /^6/.test(a.code))
    .map(a => ({ code: a.code, name: a.name, amount: a.totalDebit - a.totalCredit }))
    .filter(r => r.amount !== 0);

  const totalProduits = produits.reduce((s, r) => s + r.amount, 0);
  const totalCharges  = charges.reduce((s,  r) => s + r.amount, 0);

  // ── Bilan simplifié ────────────────────────────────────────────────────────
  const actifItems = [
    { label: "Immobilisations nettes", code: "2x",   amount: Math.max(0, accounts.filter(a => /^2/.test(a.code)).reduce((s, a) => s + a.balance, 0)) },
    { label: "Stocks (31x)",           code: "3x",   amount: Math.max(0, stockMGA) },
    { label: "Créances clients (41x)", code: "41x",  amount: Math.max(0, receivablesMGA) },
    { label: "Trésorerie (512/53)",    code: "5x",   amount: Math.max(0, cashMGA) },
    { label: "TVA déductible (44566)", code: "44566",amount: Math.max(0, accounts.filter(a => a.code === "44566").reduce((s, a) => s + a.balance, 0)) },
  ].filter(r => r.amount > 0);

  const passifItems = [
    { label: "Capitaux propres (10x)",    code: "10x",  amount: Math.abs(accounts.filter(a => /^10/.test(a.code)).reduce((s, a) => s + a.balance, 0)) },
    { label: "Dettes fournisseurs (40x)", code: "40x",  amount: payablesMGA },
    { label: "TVA collectée (44571)",     code: "44571",amount: Math.abs(accounts.filter(a => a.code === "44571").reduce((s, a) => s + a.balance, 0)) },
    { label: "Résultat de l'exercice",   code: "RI",   amount: netMGA },
  ].filter(r => r.amount > 0);

  const totalActif  = actifItems.reduce( (s, r) => s + r.amount, 0);
  const totalPassif = passifItems.reduce((s, r) => s + r.amount, 0);

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const alerts: { level: "danger" | "warning" | "info"; message: string }[] = [];
  if (cashMGA < 500_000)        alerts.push({ level: "danger",  message: `Trésorerie critique : ${(cashMGA / 1e6).toFixed(2)} M MGA — risque de liquidité immédiat` });
  else if (cashMGA < 2_000_000) alerts.push({ level: "warning", message: `Trésorerie faible : ${(cashMGA / 1e6).toFixed(2)} M MGA` });
  if (grossMarginPct < 0)       alerts.push({ level: "danger",  message: `Marge négative : ${grossMarginPct.toFixed(1)} % — pertes en cours` });
  else if (grossMarginPct < 10 && revenueMGA > 0) alerts.push({ level: "warning", message: `Marge faible : ${grossMarginPct.toFixed(1)} %` });
  if (stockMGA > revenueMGA * 2 && revenueMGA > 0)
    alerts.push({ level: "warning", message: `Stock élevé vs CA : ${(stockMGA / 1e6).toFixed(1)} M MGA — écoulement lent` });
  if (payablesMGA > cashMGA * 2 && cashMGA > 0)
    alerts.push({ level: "warning", message: `Dettes fournisseurs (${(payablesMGA / 1e6).toFixed(1)} M MGA) élevées vs trésorerie` });

  // ── Convert to requested currency ──────────────────────────────────────────
  const c = (v: number) => convert(v, cur);

  res.json({
    kpis: {
      revenue:       c(revenueMGA),
      expenses:      c(expensesMGA),
      netResult:     c(netMGA),
      cashBalance:   c(cashMGA),
      receivables:   c(receivablesMGA),
      payables:      c(payablesMGA),
      stockValue:    c(stockMGA),
      grossMarginPct,
      currency:      cur,
    },
    chartMonthly:     chartMonthly.map(m => ({ ...m, revenue: c(m.revenue), expenses: c(m.expenses) })),
    chartCashFlow:    chartCashFlow.map(m => ({ ...m, cashFlow: c(m.cashFlow) })),
    expenseBreakdown: expenseBreakdown.map(e => ({ ...e, value: c(e.value) })),
    incomeStatement: {
      produits:      produits.map(r => ({ ...r, amount: c(r.amount) })),
      charges:       charges.map(r =>  ({ ...r, amount: c(r.amount) })),
      totalProduits: c(totalProduits),
      totalCharges:  c(totalCharges),
      result:        c(totalProduits - totalCharges),
    },
    balanceSheet: {
      actif:      actifItems.map( r => ({ ...r, amount: c(r.amount) })),
      passif:     passifItems.map(r => ({ ...r, amount: c(r.amount) })),
      totalActif:  c(totalActif),
      totalPassif: c(totalPassif),
    },
    lotAnalysis: lots.map(l => ({
      ...l,
      totalCost:     c(l.totalCost),
      purchaseCost:  c(l.purchaseCost),
      processCost:   c(l.processCost),
      transportCost: c(l.transportCost),
    })),
    salesTotal: salesRows.map(s => ({
      currency: s.currency,
      amount:   parseFloat(String(s.total_amount ?? 0)),
    })),
    alerts,
    period: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
  });
});

export default router;
