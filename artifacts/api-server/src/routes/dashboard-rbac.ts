import { Router, type IRouter } from "express";
import { db, suppliersTable, clientsTable, lotsTable, salesTable, purchasesTable, employeesTable, leavesTable, attendanceTable, hrRequestsTable, payrollTable, bonusesTable, accountsTable, journalLinesTable, accountingInvoicesTable, bankTransactionsTable, stockMovementsTable } from "@workspace/db";
import { sql, count, sum, eq, and, gte, lt, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const router: IRouter = Router();

async function getLogisticsData() {
  const [supplierCount] = await db.select({ count: count() }).from(suppliersTable);
  const [clientCount] = await db.select({ count: count() }).from(clientsTable);
  const [lotCount] = await db.select({ count: count() }).from(lotsTable).where(sql`${lotsTable.status} != 'sold'`);
  const [stockResult] = await db.select({ total: sum(lotsTable.weightCurrent) }).from(lotsTable).where(sql`${lotsTable.status} != 'sold'`);
  const [salesResult] = await db.select({ total: sum(salesTable.totalAmount) }).from(salesTable).where(sql`${salesTable.currency} = 'USD'`);
  const [purchasesResult] = await db.select({ total: sum(purchasesTable.totalAmount) }).from(purchasesTable);
  const lotStatus = await db.select({ status: lotsTable.status, count: count(), totalKg: sum(lotsTable.weightCurrent) }).from(lotsTable).groupBy(lotsTable.status);
  const recentMovements = await db.select().from(stockMovementsTable).orderBy(desc(stockMovementsTable.createdAt)).limit(5);

  return {
    totalStockKg: Number(stockResult?.total ?? 0),
    totalSalesUsd: Number(salesResult?.total ?? 0),
    totalPurchasesMga: Number(purchasesResult?.total ?? 0),
    activeLotsCount: Number(lotCount?.count ?? 0),
    suppliersCount: Number(supplierCount?.count ?? 0),
    clientsCount: Number(clientCount?.count ?? 0),
    lotStatusBreakdown: lotStatus.map(r => ({ status: r.status, count: Number(r.count), totalKg: Number(r.totalKg ?? 0) })),
    recentMovements: recentMovements.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })),
  };
}

async function getHrData() {
  const today = new Date();
  const currentMonth = today.toISOString().slice(0, 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const [empCount] = await db.select({ count: count() }).from(employeesTable);
  const [activeEmpCount] = await db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.isActive, true));
  const [pendingLeaves] = await db.select({ count: count() }).from(leavesTable).where(eq(leavesTable.status, "pending"));
  const [absentToday] = await db.select({ count: count() }).from(leavesTable).where(and(eq(leavesTable.status, "approved"), sql`${leavesTable.startDate} <= ${today}`, sql`${leavesTable.endDate} >= ${today}`));
  const [pendingRequests] = await db.select({ count: count() }).from(hrRequestsTable).where(eq(hrRequestsTable.status, "pending"));
  const [totalSalaries] = await db.select({ total: sum(payrollTable.netSalary) }).from(payrollTable).where(eq(payrollTable.month, currentMonth));
  const [totalBonuses] = await db.select({ total: sum(bonusesTable.amount) }).from(bonusesTable).where(and(gte(bonusesTable.createdAt, monthStart), lt(bonusesTable.createdAt, monthEnd)));

  return {
    totalEmployees: Number(empCount?.count ?? 0),
    activeEmployees: Number(activeEmpCount?.count ?? 0),
    absentToday: Number(absentToday?.count ?? 0),
    pendingLeaves: Number(pendingLeaves?.count ?? 0),
    pendingRequests: Number(pendingRequests?.count ?? 0),
    totalSalariesMga: Number(totalSalaries?.total ?? 0),
    totalBonusesMga: Number(totalBonuses?.total ?? 0),
  };
}

async function getAccountingData() {
  const accounts = await db.select().from(accountsTable);
  const lines = await db.select({ accountId: journalLinesTable.accountId, totalDebit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`, totalCredit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)` }).from(journalLinesTable).groupBy(journalLinesTable.accountId);
  const lineMap = new Map(lines.map(l => [l.accountId, l]));

  let revenue = 0, charges = 0, bankBalance = 0;
  for (const a of accounts) {
    const l = lineMap.get(a.id);
    if (!l) continue;
    if (a.type === "revenue") revenue += Number(l.totalCredit) - Number(l.totalDebit);
    if (a.type === "expense") charges += Number(l.totalDebit) - Number(l.totalCredit);
    if (["512", "53"].includes(a.code)) bankBalance += Number(l.totalDebit) - Number(l.totalCredit);
  }

  const invoices = await db.select().from(accountingInvoicesTable);
  const pendingInvoices = invoices.filter(i => i.status === "validated").length;
  const totalValidatedTTC = invoices.filter(i => i.status !== "draft").reduce((s, i) => s + i.amountTTC, 0);
  const [unmatchedBank] = await db.select({ count: count() }).from(bankTransactionsTable).where(eq(bankTransactionsTable.matched, false));

  return {
    revenue,
    charges,
    resultat: revenue - charges,
    bankBalance,
    pendingInvoices,
    totalValidatedTTC,
    unmatchedBankTransactions: Number(unmatchedBank?.count ?? 0),
  };
}

// Single role-based dashboard endpoint
router.get("/dashboard/me", requireAuth, loadUser, async (req, res): Promise<void> => {
  const role = req.currentUser!.role;
  let data: any = { role };

  if (role === "SUPER_ADMIN") {
    const [logistics, hr, accounting] = await Promise.all([getLogisticsData(), getHrData(), getAccountingData()]);
    data = { role, logistics, hr, accounting };
  } else if (role === "LOGISTICS_MANAGER") {
    data = { role, ...(await getLogisticsData()) };
  } else if (role === "HR_MANAGER") {
    data = { role, ...(await getHrData()) };
  } else if (role === "ACCOUNTANT") {
    data = { role, ...(await getAccountingData()) };
  }

  res.json(data);
});

export default router;
