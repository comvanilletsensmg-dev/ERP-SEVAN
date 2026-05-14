/**
 * Stock Consommables & Équipements — routes
 *
 * GET    /api/stock/dashboard           — KPIs + alerts
 * GET    /api/stock/items               — list items (filter: category, status, search)
 * POST   /api/stock/items               — create item
 * PUT    /api/stock/items/:id           — update item
 * DELETE /api/stock/items/:id           — delete item
 * GET    /api/stock/movements           — list movements (filter: itemId)
 * POST   /api/stock/movements           — manual movement (IN/OUT/ADJUSTMENT/LOSS)
 * GET    /api/stock/assignments         — list assignments (filter: active)
 * POST   /api/stock/assignments         — assign equipment to employee
 * PUT    /api/stock/assignments/:id/return — return equipment
 * GET    /api/stock/requests            — list internal requests
 * POST   /api/stock/requests            — create internal request
 * PUT    /api/stock/requests/:id/approve — approve request
 * PUT    /api/stock/requests/:id/reject  — reject request
 * PUT    /api/stock/requests/:id/deliver — mark as delivered
 * GET    /api/stock/maintenance          — list maintenance records (filter: itemId)
 * POST   /api/stock/maintenance          — create maintenance record
 * PUT    /api/stock/maintenance/:id      — update maintenance record
 * GET    /api/stock/alerts               — low stock + overdue maintenance
 */
import { Router, type IRouter } from "express";
import { eq, desc, sql, and, lte, isNull, or, lt } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  stockItemsTable,
  stockItemMovementsTable,
  equipmentAssignmentsTable,
  internalRequestsTable,
  equipmentMaintenanceTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { loadUser } from "../middlewares/roles";

const router: IRouter = Router();

// ── Role guard: logistics_manager | DSI | SUPER_ADMIN | HR_MANAGER ─────────────
function canManageStock(req: any, res: any, next: any) {
  const role = req.currentUser?.role;
  const allowed = ["SUPER_ADMIN", "LOGISTICS_MANAGER", "DSI", "HR_MANAGER", "DG", "DGA"];
  if (!allowed.includes(role)) {
    res.status(403).json({ error: "Accès refusé" });
    return;
  }
  next();
}

// ── Dashboard KPIs ─────────────────────────────────────────────────────────────
router.get("/stock/dashboard", requireAuth, loadUser, async (req, res): Promise<void> => {
  try {
    const items = await db.select().from(stockItemsTable).where(eq(stockItemsTable.status, "active"));

    const totalItems     = items.length;
    const totalValue     = items.reduce((s, i) => s + (i.quantity ?? 0) * (i.unitPrice ?? 0), 0);
    const criticalItems  = items.filter(i => (i.quantity ?? 0) <= (i.minQuantity ?? 0) && i.minQuantity > 0);
    const immobilizations = items.filter(i => i.isImmobilization);
    const byCategory     = items.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Active assignments
    const activeAssignments = await db.select().from(equipmentAssignmentsTable)
      .where(isNull(equipmentAssignmentsTable.returnedAt));

    // Pending requests
    const pendingRequests = await db.select().from(internalRequestsTable)
      .where(eq(internalRequestsTable.status, "pending"));

    // Overdue maintenance
    const now = new Date();
    const overdueMaintenance = await db.select().from(equipmentMaintenanceTable)
      .where(and(
        eq(equipmentMaintenanceTable.state, "planned"),
        lt(equipmentMaintenanceTable.scheduledAt, now),
      ));

    // Recent movements (last 10)
    const recentMovements = await db.select({
      id: stockItemMovementsTable.id,
      type: stockItemMovementsTable.type,
      quantity: stockItemMovementsTable.quantity,
      reason: stockItemMovementsTable.reason,
      date: stockItemMovementsTable.date,
      itemName: stockItemsTable.name,
      itemRef: stockItemsTable.reference,
    })
      .from(stockItemMovementsTable)
      .innerJoin(stockItemsTable, eq(stockItemMovementsTable.itemId, stockItemsTable.id))
      .orderBy(desc(stockItemMovementsTable.date))
      .limit(10);

    res.json({
      kpis: {
        totalItems,
        totalValue,
        criticalCount: criticalItems.length,
        immobilizationCount: immobilizations.length,
        activeAssignments: activeAssignments.length,
        pendingRequests: pendingRequests.length,
        overdueMaintenanceCount: overdueMaintenance.length,
      },
      byCategory,
      criticalItems: criticalItems.slice(0, 8),
      recentMovements,
      overdueMaintenance: overdueMaintenance.slice(0, 5),
    });
  } catch (err: any) {
    req.log.error({ err }, "stock dashboard error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET /stock/items ────────────────────────────────────────────────────────────
router.get("/stock/items", requireAuth, loadUser, async (req, res): Promise<void> => {
  try {
    const { category, status, search } = req.query as Record<string, string>;
    let rows = await db.select().from(stockItemsTable).orderBy(stockItemsTable.category, stockItemsTable.name);

    if (category) rows = rows.filter(r => r.category === category);
    if (status)   rows = rows.filter(r => r.status === status);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
      );
    }

    res.json(rows);
  } catch (err: any) {
    req.log.error({ err }, "list stock items error");
    res.status(500).json({ error: err.message });
  }
});

// ── POST /stock/items ───────────────────────────────────────────────────────────
const itemBodySchema = z.object({
  reference:       z.string().min(1),
  name:            z.string().min(1),
  category:        z.string().default("BUREAU"),
  description:     z.string().optional(),
  unit:            z.string().default("unité"),
  quantity:        z.number().min(0).default(0),
  minQuantity:     z.number().min(0).default(0),
  location:        z.string().optional(),
  unitPrice:       z.number().min(0).default(0),
  currency:        z.string().default("MGA"),
  supplierId:      z.string().optional(),
  serialNumber:    z.string().optional(),
  isImmobilization: z.boolean().default(false),
  warrantyExpiry:  z.string().optional(),
  status:          z.string().default("active"),
  notes:           z.string().optional(),
});

router.post("/stock/items", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const parsed = itemBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const data = parsed.data;
    const [item] = await db.insert(stockItemsTable).values({
      ...data,
      warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : undefined,
      updatedAt: new Date(),
    }).returning();

    // If initial qty > 0, record an IN movement
    if ((data.quantity ?? 0) > 0) {
      await db.insert(stockItemMovementsTable).values({
        itemId: item.id,
        type: "IN",
        quantity: data.quantity,
        reason: "Stock initial",
        performedBy: req.currentUser?.id,
      });
    }

    req.log.info({ itemId: item.id, by: req.currentUser?.id }, "stock item created");
    res.status(201).json(item);
  } catch (err: any) {
    req.log.error({ err }, "create stock item error");
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /stock/items/:id ────────────────────────────────────────────────────────
router.put("/stock/items/:id", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const parsed = itemBodySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const { warrantyExpiry, ...rest } = parsed.data;
    const [item] = await db.update(stockItemsTable)
      .set({
        ...rest as any,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : undefined,
        updatedAt: new Date(),
      } as any)
      .where(eq(stockItemsTable.id, id))
      .returning();

    if (!item) { res.status(404).json({ error: "Article introuvable" }); return; }
    req.log.info({ itemId: id, by: req.currentUser?.id }, "stock item updated");
    res.json(item);
  } catch (err: any) {
    req.log.error({ err }, "update stock item error");
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /stock/items/:id ─────────────────────────────────────────────────────
router.delete("/stock/items/:id", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  try {
    await db.update(stockItemsTable)
      .set({ status: "disposed", updatedAt: new Date() })
      .where(eq(stockItemsTable.id, id));
    req.log.info({ itemId: id, by: req.currentUser?.id }, "stock item disposed");
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "delete stock item error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET /stock/movements ────────────────────────────────────────────────────────
router.get("/stock/movements", requireAuth, loadUser, async (req, res): Promise<void> => {
  try {
    const { itemId } = req.query as Record<string, string>;
    const rows = await db.select({
      id: stockItemMovementsTable.id,
      type: stockItemMovementsTable.type,
      quantity: stockItemMovementsTable.quantity,
      reason: stockItemMovementsTable.reason,
      referenceDoc: stockItemMovementsTable.referenceDoc,
      performedBy: stockItemMovementsTable.performedBy,
      date: stockItemMovementsTable.date,
      itemId: stockItemsTable.id,
      itemName: stockItemsTable.name,
      itemRef: stockItemsTable.reference,
      unit: stockItemsTable.unit,
    })
      .from(stockItemMovementsTable)
      .innerJoin(stockItemsTable, eq(stockItemMovementsTable.itemId, stockItemsTable.id))
      .where(itemId ? eq(stockItemMovementsTable.itemId, itemId) : undefined as any)
      .orderBy(desc(stockItemMovementsTable.date))
      .limit(200);
    res.json(rows);
  } catch (err: any) {
    req.log.error({ err }, "list movements error");
    res.status(500).json({ error: err.message });
  }
});

// ── POST /stock/movements ───────────────────────────────────────────────────────
const movementBodySchema = z.object({
  itemId:       z.string().min(1),
  type:         z.enum(["IN", "OUT", "ADJUSTMENT", "LOSS"]),
  quantity:     z.number().positive(),
  reason:       z.string().optional(),
  referenceDoc: z.string().optional(),
});

router.post("/stock/movements", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const parsed = movementBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { itemId, type, quantity, reason, referenceDoc } = parsed.data;
  try {
    const [item] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, itemId));
    if (!item) { res.status(404).json({ error: "Article introuvable" }); return; }

    // Update stock
    let newQty = item.quantity ?? 0;
    if (type === "IN")          newQty += quantity;
    else if (type === "OUT")    newQty = Math.max(0, newQty - quantity);
    else if (type === "LOSS")   newQty = Math.max(0, newQty - quantity);
    else if (type === "ADJUSTMENT") newQty = quantity; // set absolute

    await db.update(stockItemsTable)
      .set({ quantity: newQty, updatedAt: new Date() })
      .where(eq(stockItemsTable.id, itemId));

    const [movement] = await db.insert(stockItemMovementsTable).values({
      itemId, type, quantity, reason, referenceDoc,
      performedBy: req.currentUser?.id,
    }).returning();

    req.log.info({ itemId, type, quantity, by: req.currentUser?.id }, "stock movement created");
    res.status(201).json({ movement, newQuantity: newQty });
  } catch (err: any) {
    req.log.error({ err }, "create movement error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET /stock/assignments ──────────────────────────────────────────────────────
router.get("/stock/assignments", requireAuth, loadUser, async (req, res): Promise<void> => {
  try {
    const { active } = req.query as Record<string, string>;
    let rows = await db.select({
      id: equipmentAssignmentsTable.id,
      itemId: stockItemsTable.id,
      itemName: stockItemsTable.name,
      itemRef: stockItemsTable.reference,
      itemCategory: stockItemsTable.category,
      employeeId: equipmentAssignmentsTable.employeeId,
      employeeName: equipmentAssignmentsTable.employeeName,
      department: equipmentAssignmentsTable.department,
      assignedAt: equipmentAssignmentsTable.assignedAt,
      returnedAt: equipmentAssignmentsTable.returnedAt,
      state: equipmentAssignmentsTable.state,
      notes: equipmentAssignmentsTable.notes,
      assignedBy: equipmentAssignmentsTable.assignedBy,
    })
      .from(equipmentAssignmentsTable)
      .innerJoin(stockItemsTable, eq(equipmentAssignmentsTable.itemId, stockItemsTable.id))
      .orderBy(desc(equipmentAssignmentsTable.assignedAt));

    if (active === "true") rows = rows.filter(r => !r.returnedAt);
    res.json(rows);
  } catch (err: any) {
    req.log.error({ err }, "list assignments error");
    res.status(500).json({ error: err.message });
  }
});

// ── POST /stock/assignments ─────────────────────────────────────────────────────
const assignmentBodySchema = z.object({
  itemId:       z.string().min(1),
  employeeId:   z.string().min(1),
  employeeName: z.string().min(1),
  department:   z.string().optional(),
  state:        z.string().default("good"),
  notes:        z.string().optional(),
});

router.post("/stock/assignments", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const parsed = assignmentBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [item] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, parsed.data.itemId));
    if (!item) { res.status(404).json({ error: "Article introuvable" }); return; }
    if ((item.quantity ?? 0) < 1) { res.status(400).json({ error: "Stock insuffisant pour attribuer" }); return; }

    // Deduct 1 from stock
    await db.update(stockItemsTable)
      .set({ quantity: (item.quantity ?? 0) - 1, updatedAt: new Date() })
      .where(eq(stockItemsTable.id, parsed.data.itemId));

    // Record movement
    await db.insert(stockItemMovementsTable).values({
      itemId: parsed.data.itemId,
      type: "OUT",
      quantity: 1,
      reason: `Attribution à ${parsed.data.employeeName}`,
      performedBy: req.currentUser?.id,
    });

    const [assignment] = await db.insert(equipmentAssignmentsTable).values({
      ...parsed.data,
      assignedBy: req.currentUser?.id,
    }).returning();

    req.log.info({ assignmentId: assignment.id, by: req.currentUser?.id }, "equipment assigned");
    res.status(201).json(assignment);
  } catch (err: any) {
    req.log.error({ err }, "create assignment error");
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /stock/assignments/:id/return ──────────────────────────────────────────
router.put("/stock/assignments/:id/return", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { state, notes } = req.body;
  try {
    const [a] = await db.select().from(equipmentAssignmentsTable).where(eq(equipmentAssignmentsTable.id, id));
    if (!a) { res.status(404).json({ error: "Attribution introuvable" }); return; }

    await db.update(equipmentAssignmentsTable)
      .set({ returnedAt: new Date(), state: state ?? a.state, notes: notes ?? a.notes })
      .where(eq(equipmentAssignmentsTable.id, id));

    // Add 1 back to stock if not lost/damaged beyond repair
    if (state !== "lost") {
      await db.update(stockItemsTable)
        .set({ quantity: sql`quantity + 1`, updatedAt: new Date() })
        .where(eq(stockItemsTable.id, a.itemId));
      await db.insert(stockItemMovementsTable).values({
        itemId: a.itemId, type: "IN", quantity: 1,
        reason: `Retour de ${a.employeeName}`,
        performedBy: req.currentUser?.id,
      });
    }

    req.log.info({ assignmentId: id, by: req.currentUser?.id }, "equipment returned");
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "return assignment error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET /stock/requests ────────────────────────────────────────────────────────
router.get("/stock/requests", requireAuth, loadUser, async (req, res): Promise<void> => {
  try {
    const { status } = req.query as Record<string, string>;
    let rows = await db.select().from(internalRequestsTable).orderBy(desc(internalRequestsTable.createdAt));
    if (status) rows = rows.filter(r => r.status === status);
    res.json(rows);
  } catch (err: any) {
    req.log.error({ err }, "list requests error");
    res.status(500).json({ error: err.message });
  }
});

// ── POST /stock/requests ───────────────────────────────────────────────────────
const requestBodySchema = z.object({
  itemId:        z.string().optional(),
  itemName:      z.string().min(1),
  quantity:      z.number().positive().default(1),
  requesterName: z.string().min(1),
  department:    z.string().optional(),
  reason:        z.string().optional(),
  urgency:       z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

router.post("/stock/requests", requireAuth, loadUser, async (req, res): Promise<void> => {
  const parsed = requestBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [request] = await db.insert(internalRequestsTable).values({
      ...parsed.data,
      requesterId: req.currentUser?.id ?? "unknown",
    }).returning();
    req.log.info({ requestId: request.id, by: req.currentUser?.id }, "internal request created");
    res.status(201).json(request);
  } catch (err: any) {
    req.log.error({ err }, "create request error");
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /stock/requests/:id/approve ────────────────────────────────────────────
router.put("/stock/requests/:id/approve", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  try {
    const [req_] = await db.select().from(internalRequestsTable).where(eq(internalRequestsTable.id, id));
    if (!req_) { res.status(404).json({ error: "Demande introuvable" }); return; }
    if (req_.status !== "pending") { res.status(400).json({ error: "Demande déjà traitée" }); return; }

    await db.update(internalRequestsTable)
      .set({ status: "approved", validatedBy: req.currentUser?.id, validatedAt: new Date(), updatedAt: new Date() })
      .where(eq(internalRequestsTable.id, id));

    req.log.info({ requestId: id, by: req.currentUser?.id }, "request approved");
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "approve request error");
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /stock/requests/:id/reject ─────────────────────────────────────────────
router.put("/stock/requests/:id/reject", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { rejectionReason } = req.body;
  try {
    await db.update(internalRequestsTable)
      .set({ status: "rejected", validatedBy: req.currentUser?.id, validatedAt: new Date(), rejectionReason, updatedAt: new Date() })
      .where(eq(internalRequestsTable.id, id));
    req.log.info({ requestId: id, by: req.currentUser?.id }, "request rejected");
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "reject request error");
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /stock/requests/:id/deliver ────────────────────────────────────────────
router.put("/stock/requests/:id/deliver", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  try {
    const [req_] = await db.select().from(internalRequestsTable).where(eq(internalRequestsTable.id, id));
    if (!req_) { res.status(404).json({ error: "Demande introuvable" }); return; }
    if (req_.status !== "approved") { res.status(400).json({ error: "La demande doit être approuvée avant livraison" }); return; }

    // Deduct stock if itemId is linked
    if (req_.itemId) {
      const [item] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, req_.itemId));
      if (item && (item.quantity ?? 0) >= (req_.quantity ?? 1)) {
        await db.update(stockItemsTable)
          .set({ quantity: (item.quantity ?? 0) - (req_.quantity ?? 1), updatedAt: new Date() })
          .where(eq(stockItemsTable.id, req_.itemId));
        await db.insert(stockItemMovementsTable).values({
          itemId: req_.itemId, type: "OUT",
          quantity: req_.quantity ?? 1,
          reason: `Demande interne — ${req_.requesterName}`,
          referenceDoc: req_.id,
          performedBy: req.currentUser?.id,
        });
      }
    }

    await db.update(internalRequestsTable)
      .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(internalRequestsTable.id, id));

    req.log.info({ requestId: id, by: req.currentUser?.id }, "request delivered");
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "deliver request error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET /stock/maintenance ──────────────────────────────────────────────────────
router.get("/stock/maintenance", requireAuth, loadUser, async (req, res): Promise<void> => {
  try {
    const { itemId } = req.query as Record<string, string>;
    const rows = await db.select({
      id: equipmentMaintenanceTable.id,
      type: equipmentMaintenanceTable.type,
      description: equipmentMaintenanceTable.description,
      scheduledAt: equipmentMaintenanceTable.scheduledAt,
      doneAt: equipmentMaintenanceTable.doneAt,
      provider: equipmentMaintenanceTable.provider,
      cost: equipmentMaintenanceTable.cost,
      currency: equipmentMaintenanceTable.currency,
      warrantyExpiry: equipmentMaintenanceTable.warrantyExpiry,
      state: equipmentMaintenanceTable.state,
      notes: equipmentMaintenanceTable.notes,
      nextDueAt: equipmentMaintenanceTable.nextDueAt,
      createdAt: equipmentMaintenanceTable.createdAt,
      itemId: stockItemsTable.id,
      itemName: stockItemsTable.name,
      itemRef: stockItemsTable.reference,
      itemCategory: stockItemsTable.category,
    })
      .from(equipmentMaintenanceTable)
      .innerJoin(stockItemsTable, eq(equipmentMaintenanceTable.itemId, stockItemsTable.id))
      .where(itemId ? eq(equipmentMaintenanceTable.itemId, itemId) : sql`1=1`)
      .orderBy(desc(equipmentMaintenanceTable.createdAt));
    res.json(rows);
  } catch (err: any) {
    req.log.error({ err }, "list maintenance error");
    res.status(500).json({ error: err.message });
  }
});

// ── POST /stock/maintenance ─────────────────────────────────────────────────────
const maintenanceBodySchema = z.object({
  itemId:         z.string().min(1),
  type:           z.string().default("preventive"),
  description:    z.string().optional(),
  scheduledAt:    z.string().optional(),
  doneAt:         z.string().optional(),
  provider:       z.string().optional(),
  cost:           z.number().min(0).default(0),
  currency:       z.string().default("MGA"),
  warrantyExpiry: z.string().optional(),
  state:          z.string().default("planned"),
  notes:          z.string().optional(),
  nextDueAt:      z.string().optional(),
});

router.post("/stock/maintenance", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const parsed = maintenanceBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const d = parsed.data;
    const [record] = await db.insert(equipmentMaintenanceTable).values({
      ...d,
      scheduledAt:    d.scheduledAt    ? new Date(d.scheduledAt)    : undefined,
      doneAt:         d.doneAt         ? new Date(d.doneAt)         : undefined,
      warrantyExpiry: d.warrantyExpiry ? new Date(d.warrantyExpiry) : undefined,
      nextDueAt:      d.nextDueAt      ? new Date(d.nextDueAt)      : undefined,
    }).returning();
    req.log.info({ maintenanceId: record.id, by: req.currentUser?.id }, "maintenance record created");
    res.status(201).json(record);
  } catch (err: any) {
    req.log.error({ err }, "create maintenance error");
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /stock/maintenance/:id ──────────────────────────────────────────────────
router.put("/stock/maintenance/:id", requireAuth, loadUser, canManageStock, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const parsed = maintenanceBodySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const { scheduledAt, doneAt, warrantyExpiry: wExp, nextDueAt, ...rest } = parsed.data;
    const [record] = await db.update(equipmentMaintenanceTable)
      .set({
        ...rest as any,
        scheduledAt:    scheduledAt    ? new Date(scheduledAt)    : undefined,
        doneAt:         doneAt         ? new Date(doneAt)         : undefined,
        warrantyExpiry: wExp           ? new Date(wExp)           : undefined,
        nextDueAt:      nextDueAt      ? new Date(nextDueAt)      : undefined,
      } as any)
      .where(eq(equipmentMaintenanceTable.id, id))
      .returning();
    if (!record) { res.status(404).json({ error: "Maintenance introuvable" }); return; }
    req.log.info({ maintenanceId: id, by: req.currentUser?.id }, "maintenance record updated");
    res.json(record);
  } catch (err: any) {
    req.log.error({ err }, "update maintenance error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET /stock/alerts ───────────────────────────────────────────────────────────
router.get("/stock/alerts", requireAuth, loadUser, async (req, res): Promise<void> => {
  try {
    const items = await db.select().from(stockItemsTable).where(eq(stockItemsTable.status, "active"));
    const lowStock = items.filter(i => (i.quantity ?? 0) <= (i.minQuantity ?? 0) && i.minQuantity > 0);
    const outOfStock = items.filter(i => (i.quantity ?? 0) === 0);

    const now = new Date();
    const overdueMaintenance = await db.select({
      id: equipmentMaintenanceTable.id,
      itemName: stockItemsTable.name,
      type: equipmentMaintenanceTable.type,
      scheduledAt: equipmentMaintenanceTable.scheduledAt,
      state: equipmentMaintenanceTable.state,
    })
      .from(equipmentMaintenanceTable)
      .innerJoin(stockItemsTable, eq(equipmentMaintenanceTable.itemId, stockItemsTable.id))
      .where(and(eq(equipmentMaintenanceTable.state, "planned"), lt(equipmentMaintenanceTable.scheduledAt, now)));

    const expiringWarranty = items.filter(i =>
      i.warrantyExpiry &&
      new Date(i.warrantyExpiry).getTime() - now.getTime() < 30 * 24 * 3600 * 1000 &&
      new Date(i.warrantyExpiry).getTime() > now.getTime(),
    );

    res.json({ lowStock, outOfStock, overdueMaintenance, expiringWarranty });
  } catch (err: any) {
    req.log.error({ err }, "alerts error");
    res.status(500).json({ error: err.message });
  }
});

export default router;
