/**
 * Operations module routes
 *
 *   GET    /api/operations/dashboard           — KPIs + alerts
 *   GET    /api/operations/reports             — list reports (recent)
 *   GET    /api/operations/reports/today       — today's report (upsert)
 *   GET    /api/operations/reports/:id         — report with lot statuses + usages
 *   POST   /api/operations/reports             — create report
 *   PATCH  /api/operations/reports/:id         — update report fields
 *   PUT    /api/operations/reports/:id/lot-status      — upsert lot status row
 *   DELETE /api/operations/reports/:id/lot-status/:lotId — remove lot row
 *   PUT    /api/operations/reports/:id/consumable-usage — upsert consumable usage
 *
 *   GET    /api/operations/consumables         — list consumables
 *   POST   /api/operations/consumables         — create consumable
 *   PATCH  /api/operations/consumables/:id     — update stock / fields
 *   DELETE /api/operations/consumables/:id     — delete consumable
 */
import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  operationReportsTable,
  operationLotStatusesTable,
  consumablesTable,
  consumableUsagesTable,
  lotsTable,
} from "@workspace/db";
import { loadUser } from "../middlewares/roles";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────────────────
const fmtReport = (r: typeof operationReportsTable.$inferSelect) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt?.toISOString() ?? r.createdAt.toISOString(),
});

function todayDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── GET /operations/dashboard ─────────────────────────────────────────────────
router.get("/operations/dashboard", loadUser, async (req, res): Promise<void> => {
  // Kg per operational status — aggregate from lot_statuses today
  const today = todayDateStr();
  const todayReport = await db.select()
    .from(operationReportsTable).where(eq(operationReportsTable.date, today));
  const todayId = todayReport[0]?.id;

  // Lot quality breakdown (from all operation_lot_statuses today)
  let lotStats: Record<string, number> = { processing: 0, phenole: 0, moldy: 0, ready: 0, preparing: 0 };
  if (todayId) {
    const statuses = await db.select().from(operationLotStatusesTable)
      .where(eq(operationLotStatusesTable.reportId, todayId));
    for (const s of statuses) {
      lotStats[s.status] = (lotStats[s.status] ?? 0) + (s.quantityKg ?? 0);
    }
  }

  // Consumable usage today
  let consumableToday: { name: string; unit: string; used: number }[] = [];
  if (todayId) {
    const usages = await db.select({
      name: consumablesTable.name,
      unit: consumablesTable.unit,
      used: consumableUsagesTable.quantityUsed,
    }).from(consumableUsagesTable)
      .innerJoin(consumablesTable, eq(consumableUsagesTable.consumableId, consumablesTable.id))
      .where(eq(consumableUsagesTable.reportId, todayId));
    consumableToday = usages.map(u => ({ name: u.name, unit: u.unit, used: u.used ?? 0 }));
  }

  // Low-stock alerts
  const allConsumables = await db.select().from(consumablesTable);
  const lowStock = allConsumables.filter(c => (c.stock ?? 0) <= (c.minStock ?? 0));

  // Moldy alert
  const moldyAlert = (lotStats.moldy ?? 0) > 50;

  // Recent reports (last 7)
  const recentReports = await db.select().from(operationReportsTable)
    .orderBy(desc(operationReportsTable.date)).limit(7);

  res.json({
    lotStats,
    consumableToday,
    lowStockAlerts: lowStock.map(c => ({ id: c.id, name: c.name, stock: c.stock, minStock: c.minStock, unit: c.unit })),
    moldyAlert,
    todayReport: todayReport[0] ? fmtReport(todayReport[0]) : null,
    recentReports: recentReports.map(fmtReport),
  });
});

// ── GET /operations/reports ─────────────────────────────────────────────────────
// Returns reports with computed lot-status totals (for history page)
router.get("/operations/reports", loadUser, async (_req, res): Promise<void> => {
  const reports = await db.select().from(operationReportsTable)
    .orderBy(desc(operationReportsTable.date)).limit(60);

  // For each report, aggregate lot statuses in one query
  const reportIds = reports.map(r => r.id);
  let lotAgg: { reportId: string; status: string; total: number }[] = [];
  if (reportIds.length > 0) {
    lotAgg = await db
      .select({
        reportId: operationLotStatusesTable.reportId,
        status:   operationLotStatusesTable.status,
        total:    sql<number>`COALESCE(SUM(${operationLotStatusesTable.quantityKg}), 0)`,
      })
      .from(operationLotStatusesTable)
      .where(sql`${operationLotStatusesTable.reportId} = ANY(ARRAY[${sql.raw(reportIds.map(id => `'${id}'`).join(","))}])`)
      .groupBy(operationLotStatusesTable.reportId, operationLotStatusesTable.status);
  }

  // Pivot lot aggregates per report
  const lotMap: Record<string, Record<string, number>> = {};
  for (const r of lotAgg) {
    if (!lotMap[r.reportId]) lotMap[r.reportId] = {};
    lotMap[r.reportId][r.status] = r.total;
  }

  // Also get consumable usage count per report
  let usageAgg: { reportId: string; count: number }[] = [];
  if (reportIds.length > 0) {
    usageAgg = await db
      .select({
        reportId: consumableUsagesTable.reportId,
        count: sql<number>`COUNT(*)`,
      })
      .from(consumableUsagesTable)
      .where(sql`${consumableUsagesTable.reportId} = ANY(ARRAY[${sql.raw(reportIds.map(id => `'${id}'`).join(","))}])`)
      .groupBy(consumableUsagesTable.reportId);
  }
  const usageMap: Record<string, number> = {};
  for (const u of usageAgg) usageMap[u.reportId] = u.count;

  res.json(reports.map(r => ({
    ...fmtReport(r),
    lotTotals: {
      processing: lotMap[r.id]?.processing ?? 0,
      phenole:    lotMap[r.id]?.phenole    ?? 0,
      moldy:      lotMap[r.id]?.moldy      ?? 0,
      ready:      lotMap[r.id]?.ready      ?? 0,
      preparing:  lotMap[r.id]?.preparing  ?? 0,
    },
    consumableCount: usageMap[r.id] ?? 0,
  })));
});

// ── GET /operations/reports/today ─────────────────────────────────────────────
router.get("/operations/reports/today", loadUser, async (req, res): Promise<void> => {
  const today = todayDateStr();
  let [report] = await db.select().from(operationReportsTable)
    .where(eq(operationReportsTable.date, today));

  if (!report) {
    [report] = await db.insert(operationReportsTable).values({
      id: crypto.randomUUID(), date: today,
      employeeId: req.currentUser?.id ?? null,
      quantityReceivedKg: 0, quantityPreparedKg: 0, notes: null,
    }).returning();
  }

  // Load children
  const lotStatuses = await db.select({
    id: operationLotStatusesTable.id,
    reportId: operationLotStatusesTable.reportId,
    lotId: operationLotStatusesTable.lotId,
    status: operationLotStatusesTable.status,
    quantityKg: operationLotStatusesTable.quantityKg,
    lotCode: lotsTable.code,
    lotWeightCurrent: lotsTable.weightCurrent,
    lotStatus: lotsTable.status,
  }).from(operationLotStatusesTable)
    .innerJoin(lotsTable, eq(operationLotStatusesTable.lotId, lotsTable.id))
    .where(eq(operationLotStatusesTable.reportId, report.id));

  const usages = await db.select({
    id: consumableUsagesTable.id,
    consumableId: consumableUsagesTable.consumableId,
    quantityUsed: consumableUsagesTable.quantityUsed,
    name: consumablesTable.name,
    unit: consumablesTable.unit,
    stock: consumablesTable.stock,
    minStock: consumablesTable.minStock,
  }).from(consumableUsagesTable)
    .innerJoin(consumablesTable, eq(consumableUsagesTable.consumableId, consumablesTable.id))
    .where(eq(consumableUsagesTable.reportId, report.id));

  // Active lots for selection
  const activeLots = await db.select({ id: lotsTable.id, code: lotsTable.code, weightCurrent: lotsTable.weightCurrent, status: lotsTable.status })
    .from(lotsTable)
    .where(sql`${lotsTable.status} NOT IN ('sold','SHIPPED','DOWNGRADED')`)
    .orderBy(lotsTable.code);

  res.json({ report: fmtReport(report), lotStatuses, usages, activeLots });
});

// ── GET /operations/reports/:id ───────────────────────────────────────────────
router.get("/operations/reports/:id", loadUser, async (req, res): Promise<void> => {
  const [report] = await db.select().from(operationReportsTable)
    .where(eq(operationReportsTable.id, String(req.params.id)));
  if (!report) { res.status(404).json({ error: "Rapport introuvable" }); return; }

  const lotStatuses = await db.select({
    id: operationLotStatusesTable.id,
    reportId: operationLotStatusesTable.reportId,
    lotId: operationLotStatusesTable.lotId,
    status: operationLotStatusesTable.status,
    quantityKg: operationLotStatusesTable.quantityKg,
    lotCode: lotsTable.code,
    lotWeightCurrent: lotsTable.weightCurrent,
    lotStatus: lotsTable.status,
  }).from(operationLotStatusesTable)
    .innerJoin(lotsTable, eq(operationLotStatusesTable.lotId, lotsTable.id))
    .where(eq(operationLotStatusesTable.reportId, report.id));

  const usages = await db.select({
    id: consumableUsagesTable.id,
    consumableId: consumableUsagesTable.consumableId,
    quantityUsed: consumableUsagesTable.quantityUsed,
    name: consumablesTable.name,
    unit: consumablesTable.unit,
    stock: consumablesTable.stock,
    minStock: consumablesTable.minStock,
  }).from(consumableUsagesTable)
    .innerJoin(consumablesTable, eq(consumableUsagesTable.consumableId, consumablesTable.id))
    .where(eq(consumableUsagesTable.reportId, report.id));

  res.json({ report: fmtReport(report), lotStatuses, usages });
});

// ── POST /operations/reports ──────────────────────────────────────────────────
router.post("/operations/reports", loadUser, async (req, res): Promise<void> => {
  const { date } = req.body as { date?: string };
  const d = date ?? todayDateStr();
  const [existing] = await db.select().from(operationReportsTable)
    .where(eq(operationReportsTable.date, d));
  if (existing) { res.json(fmtReport(existing)); return; }
  const [report] = await db.insert(operationReportsTable).values({
    id: crypto.randomUUID(), date: d,
    employeeId: req.currentUser?.id ?? null,
    quantityReceivedKg: 0, quantityPreparedKg: 0, notes: null,
  }).returning();
  req.log.info({ date: d }, "Operation report created");
  res.status(201).json(fmtReport(report));
});

// ── PATCH /operations/reports/:id ─────────────────────────────────────────────
const ReportUpdateBody = z.object({
  quantityReceivedKg: z.number().min(0).optional(),
  quantityPreparedKg: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});
router.patch("/operations/reports/:id", loadUser, async (req, res): Promise<void> => {
  const p = ReportUpdateBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const updates: Partial<typeof operationReportsTable.$inferInsert> = { updatedAt: new Date() };
  if (p.data.quantityReceivedKg !== undefined) updates.quantityReceivedKg = p.data.quantityReceivedKg;
  if (p.data.quantityPreparedKg !== undefined) updates.quantityPreparedKg = p.data.quantityPreparedKg;
  if (p.data.notes !== undefined) updates.notes = p.data.notes;
  const [row] = await db.update(operationReportsTable).set(updates)
    .where(eq(operationReportsTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Rapport introuvable" }); return; }
  res.json(fmtReport(row));
});

// ── PUT /operations/reports/:id/lot-status ────────────────────────────────────
const LotStatusBody = z.object({
  lotId: z.string().min(1),
  status: z.enum(["processing", "phenole", "moldy", "ready", "preparing"]),
  quantityKg: z.number().min(0),
});
router.put("/operations/reports/:id/lot-status", loadUser, async (req, res): Promise<void> => {
  const p = LotStatusBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const { lotId, status, quantityKg } = p.data;

  // Check report exists
  const [report] = await db.select().from(operationReportsTable)
    .where(eq(operationReportsTable.id, String(req.params.id)));
  if (!report) { res.status(404).json({ error: "Rapport introuvable" }); return; }

  // Upsert lot status
  const existing = await db.select().from(operationLotStatusesTable)
    .where(and(eq(operationLotStatusesTable.reportId, String(req.params.id)), eq(operationLotStatusesTable.lotId, lotId)));

  let row;
  if (existing.length > 0) {
    [row] = await db.update(operationLotStatusesTable)
      .set({ status, quantityKg })
      .where(and(eq(operationLotStatusesTable.reportId, String(req.params.id)), eq(operationLotStatusesTable.lotId, lotId)))
      .returning();
  } else {
    [row] = await db.insert(operationLotStatusesTable).values({
      id: crypto.randomUUID(), reportId: String(req.params.id), lotId, status, quantityKg,
    }).returning();
  }
  res.json(row);
});

// ── DELETE /operations/reports/:id/lot-status/:lotId ──────────────────────────
router.delete("/operations/reports/:id/lot-status/:lotId", loadUser, async (req, res): Promise<void> => {
  await db.delete(operationLotStatusesTable)
    .where(and(
      eq(operationLotStatusesTable.reportId, String(req.params.id)),
      eq(operationLotStatusesTable.lotId, String(req.params.lotId)),
    ));
  res.json({ ok: true });
});

// ── PUT /operations/reports/:id/consumable-usage ──────────────────────────────
const UsageBody = z.object({
  consumableId: z.string().min(1),
  quantityUsed: z.number().min(0),
});
router.put("/operations/reports/:id/consumable-usage", loadUser, async (req, res): Promise<void> => {
  const p = UsageBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const { consumableId, quantityUsed } = p.data;

  const [report] = await db.select().from(operationReportsTable)
    .where(eq(operationReportsTable.id, String(req.params.id)));
  if (!report) { res.status(404).json({ error: "Rapport introuvable" }); return; }

  // Get previous usage to compute stock diff
  const [prevUsage] = await db.select().from(consumableUsagesTable)
    .where(and(eq(consumableUsagesTable.reportId, String(req.params.id)), eq(consumableUsagesTable.consumableId, consumableId)));
  const prevQty = prevUsage?.quantityUsed ?? 0;
  const diff = quantityUsed - prevQty;

  let row;
  if (prevUsage) {
    [row] = await db.update(consumableUsagesTable).set({ quantityUsed })
      .where(and(eq(consumableUsagesTable.reportId, String(req.params.id)), eq(consumableUsagesTable.consumableId, consumableId)))
      .returning();
  } else {
    [row] = await db.insert(consumableUsagesTable).values({
      id: crypto.randomUUID(), reportId: String(req.params.id), consumableId, quantityUsed,
    }).returning();
  }

  // Adjust consumable stock
  if (diff !== 0) {
    await db.update(consumablesTable)
      .set({ stock: sql`GREATEST(0, ${consumablesTable.stock} - ${diff})` })
      .where(eq(consumablesTable.id, consumableId));
  }

  // Return updated consumable for live feedback
  const [cons] = await db.select().from(consumablesTable).where(eq(consumablesTable.id, consumableId));
  res.json({ usage: row, consumable: cons });
});

// ── GET /operations/consumables ───────────────────────────────────────────────
router.get("/operations/consumables", loadUser, async (_req, res): Promise<void> => {
  const rows = await db.select().from(consumablesTable).orderBy(consumablesTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// ── POST /operations/consumables ──────────────────────────────────────────────
const ConsumableBody = z.object({
  name:     z.string().min(1),
  unit:     z.string().default("unité"),
  stock:    z.number().min(0).default(0),
  minStock: z.number().min(0).default(0),
});
router.post("/operations/consumables", loadUser, async (req, res): Promise<void> => {
  const p = ConsumableBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [row] = await db.insert(consumablesTable).values({ id: crypto.randomUUID(), ...p.data }).returning();
  req.log.info({ id: row.id, name: row.name }, "Consumable created");
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

// ── PATCH /operations/consumables/:id ─────────────────────────────────────────
const ConsumableUpdateBody = z.object({
  name:     z.string().min(1).optional(),
  unit:     z.string().optional(),
  stock:    z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  addStock: z.number().optional(), // convenience: adds to existing stock
});
router.patch("/operations/consumables/:id", loadUser, async (req, res): Promise<void> => {
  const p = ConsumableUpdateBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const d = p.data;
  const [current] = await db.select().from(consumablesTable).where(eq(consumablesTable.id, String(req.params.id)));
  if (!current) { res.status(404).json({ error: "Consommable introuvable" }); return; }

  const updates: Partial<typeof consumablesTable.$inferInsert> = {};
  if (d.name     !== undefined) updates.name     = d.name;
  if (d.unit     !== undefined) updates.unit     = d.unit;
  if (d.minStock !== undefined) updates.minStock = d.minStock;
  if (d.addStock !== undefined) updates.stock = Math.max(0, (current.stock ?? 0) + d.addStock);
  else if (d.stock !== undefined) updates.stock = d.stock;

  const [row] = await db.update(consumablesTable).set(updates)
    .where(eq(consumablesTable.id, String(req.params.id))).returning();
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

// ── DELETE /operations/consumables/:id ────────────────────────────────────────
router.delete("/operations/consumables/:id", loadUser, async (req, res): Promise<void> => {
  const [row] = await db.delete(consumablesTable).where(eq(consumablesTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Consommable introuvable" }); return; }
  res.json({ ok: true });
});

// ── GET /operations/lots (active lots for dropdown) ───────────────────────────
router.get("/operations/lots", loadUser, async (_req, res): Promise<void> => {
  const rows = await db.select({ id: lotsTable.id, code: lotsTable.code, weightCurrent: lotsTable.weightCurrent, status: lotsTable.status })
    .from(lotsTable)
    .where(sql`${lotsTable.status} NOT IN ('sold','SHIPPED','DOWNGRADED')`)
    .orderBy(lotsTable.code);
  res.json(rows);
});

export default router;
