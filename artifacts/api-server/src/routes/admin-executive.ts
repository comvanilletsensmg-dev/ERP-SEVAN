import { Router, type IRouter } from "express";
import {
  db, lotsTable, purchasesTable, exportOrdersTable, accountingInvoicesTable,
  bankTransactionsTable, leavesTable, hrRequestsTable, employeesTable,
  suppliersTable, clientsTable, consumablesTable, accountsTable,
  journalLinesTable, salesTable, stockMovementsTable,
} from "@workspace/db";
import { sql, count, sum, eq, ne, desc, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "DG", "DGA"];

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (!ADMIN_ROLES.includes(req.currentUser?.role)) {
    res.status(403).json({ error: "Accès réservé aux administrateurs" });
    return;
  }
  next();
}

router.get("/admin/executive", requireAuth, loadUser, requireAdmin, async (req, res): Promise<void> => {

  // ── Accounting ──────────────────────────────────────────────────────────────
  const accounts  = await db.select().from(accountsTable);
  const lines     = await db.select({
    accountId: journalLinesTable.accountId,
    totalDebit:  sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
    totalCredit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
  }).from(journalLinesTable).groupBy(journalLinesTable.accountId);
  const lineMap   = new Map(lines.map(l => [l.accountId, l]));

  let revenue = 0, charges = 0, bankBalance = 0;
  for (const a of accounts) {
    const l = lineMap.get(a.id);
    if (!l) continue;
    if (a.type === "revenue") revenue  += Number(l.totalCredit) - Number(l.totalDebit);
    if (a.type === "expense") charges  += Number(l.totalDebit)  - Number(l.totalCredit);
    if (["512", "53"].includes(a.code)) bankBalance += Number(l.totalDebit) - Number(l.totalCredit);
  }

  const invoices = await db.select().from(accountingInvoicesTable);
  const pendingInvoices    = invoices.filter(i => i.status === "validated").length;
  const totalValidatedTTC  = invoices.filter(i => i.status !== "draft").reduce((s, i) => s + i.amountTTC, 0);
  const [unmatchedBank]    = await db.select({ count: count() }).from(bankTransactionsTable).where(eq(bankTransactionsTable.matched, false));

  // ── Logistics ───────────────────────────────────────────────────────────────
  const [supplierCount] = await db.select({ count: count() }).from(suppliersTable);
  const [clientCount]   = await db.select({ count: count() }).from(clientsTable);
  const activeLots      = await db.select().from(lotsTable).where(ne(lotsTable.status, "sold"));
  const totalStockKg    = activeLots.reduce((s, l) => s + Number(l.weightCurrent ?? 0), 0);
  const avgYieldPct     = activeLots.length > 0
    ? Math.round(activeLots.reduce((s, l) => s + (Number(l.weightInitial) > 0 ? (Number(l.weightCurrent) / Number(l.weightInitial)) * 100 : 0), 0) / activeLots.length)
    : 0;
  const highRiskLots    = activeLots.filter(l => l.riskLevel === "HIGH").length;
  const mediumRiskLots  = activeLots.filter(l => l.riskLevel === "MEDIUM").length;
  const highHumidityLots = activeLots.filter(l => Number(l.humidity ?? 0) > 38).length;
  const lotStatusMap: Record<string, { count: number; totalKg: number }> = {};
  for (const l of activeLots) {
    if (!lotStatusMap[l.status]) lotStatusMap[l.status] = { count: 0, totalKg: 0 };
    lotStatusMap[l.status].count++;
    lotStatusMap[l.status].totalKg += Number(l.weightCurrent ?? 0);
  }
  const lotStatusBreakdown = Object.entries(lotStatusMap).map(([status, v]) => ({ status, ...v }));

  // ── Purchases ───────────────────────────────────────────────────────────────
  const [salesResult]    = await db.select({ total: sum(salesTable.totalAmount) }).from(salesTable).where(sql`${salesTable.currency} = 'USD'`);
  const [pendingPurch]   = await db.select({ count: count() }).from(purchasesTable).where(eq(purchasesTable.status, "valide"));
  const [totalPurchMga]  = await db.select({ total: sum(purchasesTable.totalAmount) }).from(purchasesTable);

  // ── Export orders ───────────────────────────────────────────────────────────
  const exportOrders     = await db.select().from(exportOrdersTable).orderBy(desc(exportOrdersTable.createdAt));
  const activeExportOrders = exportOrders.filter(e => e.status !== "delivered").length;
  const exportByStatus   = exportOrders.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const exportOrdersList = exportOrders.slice(0, 8).map(e => ({
    id: e.id, reference: e.reference, clientName: e.clientName,
    quantityKg: Number(e.quantityKg ?? 0), status: e.status,
    priority: e.priority, deadline: e.deadline,
    destination: e.destination, createdAt: e.createdAt.toISOString(),
  }));

  // ── HR ──────────────────────────────────────────────────────────────────────
  const [empCount]        = await db.select({ count: count() }).from(employeesTable);
  const [activeEmpCount]  = await db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.isActive, true));
  const [pendingLeaves]   = await db.select({ count: count() }).from(leavesTable).where(eq(leavesTable.status, "pending"));
  const [pendingHrReqs]   = await db.select({ count: count() }).from(hrRequestsTable).where(eq(hrRequestsTable.status, "pending"));

  // ── Consumables ─────────────────────────────────────────────────────────────
  const [criticalConsumables] = await db.select({ count: count() }).from(consumablesTable).where(sql`${consumablesTable.stock} <= ${consumablesTable.minStock}`);

  // ── Monthly revenue trend (6 months) ────────────────────────────────────────
  const monthlyTrend = await db.execute(sql`
    SELECT TO_CHAR(DATE_TRUNC('month', je.date), 'Mon YY') AS label,
           EXTRACT(MONTH FROM je.date) AS month_num,
           EXTRACT(YEAR FROM je.date) AS year_num,
           COALESCE(SUM(CASE WHEN a.type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END), 0) AS charges
    FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id
    WHERE je.date >= NOW() - INTERVAL '6 months'
      AND je.status = 'validated'
    GROUP BY DATE_TRUNC('month', je.date), month_num, year_num
    ORDER BY year_num, month_num
  `);

  // ── Recent movements ────────────────────────────────────────────────────────
  const recentMovements = await db.select().from(stockMovementsTable)
    .orderBy(desc(stockMovementsTable.createdAt)).limit(5);

  res.json({
    // Executive KPIs
    totalSalesUsd:        Number(salesResult?.total ?? 0),
    bankBalance,
    revenue,
    charges,
    resultat:             revenue - charges,
    totalStockKg,
    avgYieldPct,
    totalEmployees:       Number(empCount?.count ?? 0),
    activeEmployees:      Number(activeEmpCount?.count ?? 0),
    totalPurchasesMga:    Number(totalPurchMga?.total ?? 0),
    // Accounting
    pendingInvoices,
    totalValidatedTTC,
    unmatchedBankTransactions: Number(unmatchedBank?.count ?? 0),
    // Logistics
    activeLotsCount:      activeLots.length,
    suppliersCount:       Number(supplierCount?.count ?? 0),
    clientsCount:         Number(clientCount?.count ?? 0),
    highRiskLots,
    mediumRiskLots,
    highHumidityLots,
    lotStatusBreakdown,
    // HR
    pendingLeaves:        Number(pendingLeaves?.count ?? 0),
    pendingRequests:      Number(pendingHrReqs?.count ?? 0),
    // Workflows
    workflows: {
      pendingPurchases:   Number(pendingPurch?.count ?? 0),
      pendingInvoices,
      pendingLeaves:      Number(pendingLeaves?.count ?? 0),
      pendingHrRequests:  Number(pendingHrReqs?.count ?? 0),
      pendingExportOrders: exportOrders.filter(e => e.status === "pending").length,
    },
    // Export
    activeExportOrders,
    exportOrdersByStatus: Object.entries(exportByStatus).map(([status, count]) => ({ status, count })),
    exportOrdersList,
    // Consumables
    criticalConsumablesCount: Number(criticalConsumables?.count ?? 0),
    // Trends
    monthlyRevenueTrend: (monthlyTrend.rows as any[]).map(r => ({
      label: r.label, revenue: Number(r.revenue), charges: Number(r.charges),
    })),
    // Movements
    recentMovements: recentMovements.map(m => ({
      id: m.id, type: m.type, quantity: Number(m.quantity ?? 0),
      note: m.note, createdAt: m.createdAt.toISOString(),
    })),
  });
});

export default router;
