import { Router, type IRouter } from "express";
import { db, suppliersTable, clientsTable, lotsTable, salesTable, purchasesTable, employeesTable, leavesTable, attendanceTable, hrRequestsTable } from "@workspace/db";
import { sql, count, sum, eq, gte, lt, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const [supplierCount] = await db.select({ count: count() }).from(suppliersTable);
  const [clientCount] = await db.select({ count: count() }).from(clientsTable);
  const [lotCount] = await db
    .select({ count: count() })
    .from(lotsTable)
    .where(sql`${lotsTable.status} != 'sold'`);
  const [stockResult] = await db
    .select({ total: sum(lotsTable.weightCurrent) })
    .from(lotsTable)
    .where(sql`${lotsTable.status} != 'sold'`);
  const [salesResult] = await db
    .select({ total: sum(salesTable.totalAmount) })
    .from(salesTable)
    .where(sql`${salesTable.currency} = 'USD'`);
  const [purchasesResult] = await db
    .select({ total: sum(purchasesTable.totalAmount) })
    .from(purchasesTable);

  res.json({
    totalStockKg: Number(stockResult?.total ?? 0),
    totalSalesUsd: Number(salesResult?.total ?? 0),
    totalPurchasesMga: Number(purchasesResult?.total ?? 0),
    activeLotsCount: Number(lotCount?.count ?? 0),
    suppliersCount: Number(supplierCount?.count ?? 0),
    clientsCount: Number(clientCount?.count ?? 0),
  });
});

router.get("/dashboard/recent-activity", requireAuth, async (_req, res): Promise<void> => {
  const recentSales = await db
    .select()
    .from(salesTable)
    .orderBy(sql`${salesTable.createdAt} DESC`)
    .limit(5);

  const recentPurchases = await db
    .select()
    .from(purchasesTable)
    .orderBy(sql`${purchasesTable.createdAt} DESC`)
    .limit(5);

  const activities = [
    ...recentSales.map((s) => ({
      id: s.id,
      type: "sale",
      description: `Vente exportée — ${s.incoterm}`,
      amount: s.totalAmount,
      currency: s.currency,
      createdAt: s.createdAt.toISOString(),
    })),
    ...recentPurchases.map((p) => ({
      id: p.id,
      type: "purchase",
      description: `Achat — ${p.paymentMethod}`,
      amount: p.totalAmount,
      currency: "MGA",
      createdAt: p.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(activities.slice(0, 8));
});

router.get("/dashboard/lot-status", requireAuth, async (_req, res): Promise<void> => {
  const result = await db
    .select({
      status: lotsTable.status,
      count: count(),
      totalKg: sum(lotsTable.weightCurrent),
    })
    .from(lotsTable)
    .groupBy(lotsTable.status);

  res.json(
    result.map((r) => ({
      status: r.status,
      count: Number(r.count),
      totalKg: Number(r.totalKg ?? 0),
    }))
  );
});

router.get("/dashboard/hr-summary", requireAuth, async (_req, res): Promise<void> => {
  const [empCount] = await db.select({ count: count() }).from(employeesTable);

  const [pendingLeaves] = await db
    .select({ count: count() })
    .from(leavesTable)
    .where(eq(leavesTable.status, "pending"));

  // Employees absent today = who have an approved leave covering today
  const today = new Date();
  const [absentToday] = await db
    .select({ count: count() })
    .from(leavesTable)
    .where(
      and(
        eq(leavesTable.status, "approved"),
        sql`${leavesTable.startDate} <= ${today}`,
        sql`${leavesTable.endDate} >= ${today}`
      )
    );

  // Pending HR requests
  const [pendingRequests] = await db
    .select({ count: count() })
    .from(hrRequestsTable)
    .where(eq(hrRequestsTable.status, "pending"));

  res.json({
    totalEmployees: Number(empCount?.count ?? 0),
    absentToday: Number(absentToday?.count ?? 0),
    pendingLeaves: Number(pendingLeaves?.count ?? 0),
    pendingRequests: Number(pendingRequests?.count ?? 0),
  });
});

export default router;
