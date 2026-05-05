import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc, asc, inArray, or } from "drizzle-orm";
import {
  db, lotsTable, employeesTable, leavesTable,
  productionTasksTable, exportOrdersTable, taskAssignmentsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const CreateTaskBody = z.object({
  lotId:         z.string().nullish(),
  type:          z.string().min(1),
  startDate:     z.string().min(1),
  endDate:       z.string().min(1),
  requiredStaff: z.number().int().min(1).default(1),
  notes:         z.string().nullish(),
  assigneeIds:   z.array(z.string()).default([]),
});

const CreateOrderBody = z.object({
  reference:   z.string().min(1),
  clientName:  z.string().min(1),
  clientId:    z.string().nullish(),
  quantityKg:  z.number().positive(),
  priority:    z.number().int().min(1).max(3).default(2),
  deadline:    z.string().min(1),
  lotId:       z.string().nullish(),
  destination: z.string().nullish(),
  notes:       z.string().nullish(),
});

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTask(
  t: typeof productionTasksTable.$inferSelect,
  lot?: typeof lotsTable.$inferSelect | null,
  assignees?: { id: string; name: string }[],
) {
  return {
    id:            t.id,
    lotId:         t.lotId,
    type:          t.type,
    status:        t.status,
    startDate:     t.startDate.toISOString(),
    endDate:       t.endDate.toISOString(),
    requiredStaff: t.requiredStaff,
    notes:         t.notes,
    autoCreated:   t.autoCreated ?? "no",
    createdAt:     t.createdAt.toISOString(),
    lot:           lot ? {
      id: lot.id, code: lot.code, status: lot.status,
      weightCurrent: lot.weightCurrent, grade: lot.grade, region: lot.region,
    } : null,
    assignees: assignees ?? [],
  };
}

function fmtOrder(
  o: typeof exportOrdersTable.$inferSelect,
  lot?: typeof lotsTable.$inferSelect | null,
) {
  return {
    id:          o.id,
    reference:   o.reference,
    clientName:  o.clientName,
    clientId:    o.clientId,
    quantityKg:  o.quantityKg,
    status:      o.status,
    priority:    o.priority,
    deadline:    o.deadline.toISOString(),
    lotId:       o.lotId,
    destination: o.destination,
    notes:       o.notes,
    createdAt:   o.createdAt.toISOString(),
    lot:         lot ? {
      id: lot.id, code: lot.code, status: lot.status,
      weightCurrent: lot.weightCurrent, grade: lot.grade,
    } : null,
  };
}

async function getTaskWithDetails(id: string) {
  const [task] = await db.select().from(productionTasksTable).where(eq(productionTasksTable.id, id));
  if (!task) return null;

  const lot = task.lotId
    ? (await db.select().from(lotsTable).where(eq(lotsTable.id, task.lotId)))[0] ?? null
    : null;

  const assignments = await db
    .select({ taskId: taskAssignmentsTable.taskId, employeeId: taskAssignmentsTable.employeeId, name: employeesTable.name })
    .from(taskAssignmentsTable)
    .leftJoin(employeesTable, eq(taskAssignmentsTable.employeeId, employeesTable.id))
    .where(eq(taskAssignmentsTable.taskId, id));

  const assignees = assignments.map(a => ({ id: a.employeeId, name: a.name ?? "" }));
  return fmtTask(task, lot, assignees);
}

// ── GET /planning/stats ──────────────────────────────────────────────────────
router.get("/planning/stats", requireAuth, async (req, res): Promise<void> => {
  const [stockRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(weight_current), 0)` })
    .from(lotsTable)
    .where(inArray(lotsTable.status, ["READY", "AVAILABLE", "SORTING", "CURING", "raw", "drying", "ready"]));

  const orders = await db
    .select()
    .from(exportOrdersTable)
    .where(inArray(exportOrdersTable.status, ["pending", "preparing"]));

  const pendingOrdersKg = orders.reduce((s, o) => s + o.quantityKg, 0);
  const totalStockKg = Number(stockRow?.total ?? 0);

  const [activeTasksRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(productionTasksTable)
    .where(inArray(productionTasksTable.status, ["pending", "in_progress"]));

  const alerts: { level: string; message: string }[] = [];

  if (totalStockKg < pendingOrdersKg) {
    alerts.push({
      level: "error",
      message: `Production insuffisante : stock disponible ${totalStockKg.toFixed(1)} kg < commandes ${pendingOrdersKg.toFixed(1)} kg`,
    });
  }

  const now = new Date();
  const urgentOrders = orders.filter(o => {
    const daysUntilDeadline = (o.deadline.getTime() - now.getTime()) / 86400000;
    return daysUntilDeadline <= 7 && o.status === "pending";
  });
  urgentOrders.forEach(o => {
    alerts.push({
      level: "warning",
      message: `Commande urgente ${o.reference} (${o.clientName}) : deadline dans ${Math.ceil((o.deadline.getTime() - now.getTime()) / 86400000)} jour(s)`,
    });
  });

  const overdueTasks = await db
    .select()
    .from(productionTasksTable)
    .where(and(
      inArray(productionTasksTable.status, ["pending", "in_progress"]),
      lte(productionTasksTable.endDate, now),
    ));

  overdueTasks.forEach(t => {
    alerts.push({
      level: "warning",
      message: `Retard production : tâche "${t.type}" dépassée — risque retard export`,
    });
  });

  res.json({
    totalStockKg,
    pendingOrdersKg,
    stockAlert: totalStockKg < pendingOrdersKg,
    activeTasksCount: Number(activeTasksRow?.count ?? 0),
    pendingOrdersCount: orders.length,
    alerts,
  });
});

// ── GET /planning/calendar ────────────────────────────────────────────────────
router.get("/planning/calendar", requireAuth, async (req, res): Promise<void> => {
  const { month } = req.query as { month?: string };

  let start: Date, end: Date;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    start = new Date(y, m - 1, 1);
    end   = new Date(y, m, 0, 23, 59, 59);
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const [tasks, leaves, orders] = await Promise.all([
    db.select().from(productionTasksTable)
      .where(and(
        lte(productionTasksTable.startDate, end),
        gte(productionTasksTable.endDate, start),
      )),
    db.select({ leave: leavesTable, emp: employeesTable })
      .from(leavesTable)
      .leftJoin(employeesTable, eq(leavesTable.employeeId, employeesTable.id))
      .where(and(
        eq(leavesTable.status, "approved"),
        lte(leavesTable.startDate, end),
        gte(leavesTable.endDate, start),
      )),
    db.select().from(exportOrdersTable)
      .where(and(
        inArray(exportOrdersTable.status, ["pending", "preparing"]),
        gte(exportOrdersTable.deadline, start),
        lte(exportOrdersTable.deadline, end),
      )),
  ]);

  const TASK_COLORS: Record<string, string> = {
    drying:      "#3b82f6",
    sorting:     "#06b6d4",
    packaging:   "#8b5cf6",
    preparation: "#f59e0b",
    curing:      "#10b981",
  };

  const events = [
    ...tasks.map(t => ({
      id:    `task-${t.id}`,
      type:  "production",
      title: `🏭 ${t.type.charAt(0).toUpperCase() + t.type.slice(1)}`,
      start: t.startDate.toISOString(),
      end:   t.endDate.toISOString(),
      color: TASK_COLORS[t.type] ?? "#6b7280",
      meta:  { taskId: t.id, status: t.status, requiredStaff: t.requiredStaff },
    })),
    ...leaves.map(({ leave: l, emp: e }) => ({
      id:    `leave-${l.id}`,
      type:  "leave",
      title: `🏖️ ${e?.name ?? "Employé"} — ${l.type === "annual" ? "Congé annuel" : l.type === "sick" ? "Maladie" : "Sans solde"}`,
      start: l.startDate.toISOString(),
      end:   l.endDate.toISOString(),
      color: "#ef4444",
      meta:  { leaveId: l.id, employeeId: l.employeeId, type: l.type },
    })),
    ...orders.map(o => {
      const daysLeft = Math.ceil((o.deadline.getTime() - Date.now()) / 86400000);
      return {
        id:    `order-${o.id}`,
        type:  "order",
        title: `📦 ${o.reference} — ${o.clientName} (${o.quantityKg}kg)`,
        start: o.deadline.toISOString(),
        end:   o.deadline.toISOString(),
        color: daysLeft <= 3 ? "#dc2626" : "#7c3aed",
        meta:  { orderId: o.id, priority: o.priority, daysLeft },
      };
    }),
  ];

  res.json(events);
});

// ── GET /planning/tasks ───────────────────────────────────────────────────────
router.get("/planning/tasks", requireAuth, async (req, res): Promise<void> => {
  const { status, lotId } = req.query as { status?: string; lotId?: string };
  const filters = [];
  if (status) filters.push(eq(productionTasksTable.status, status));
  if (lotId)  filters.push(eq(productionTasksTable.lotId, lotId));

  const tasks = await db
    .select()
    .from(productionTasksTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(productionTasksTable.startDate));

  const lotIds = [...new Set(tasks.map(t => t.lotId).filter(Boolean) as string[])];
  const lots = lotIds.length
    ? await db.select().from(lotsTable).where(inArray(lotsTable.id, lotIds))
    : [];
  const lotMap = new Map(lots.map(l => [l.id, l]));

  const taskIds = tasks.map(t => t.id);
  const allAssignments = taskIds.length
    ? await db
        .select({ taskId: taskAssignmentsTable.taskId, employeeId: taskAssignmentsTable.employeeId, name: employeesTable.name })
        .from(taskAssignmentsTable)
        .leftJoin(employeesTable, eq(taskAssignmentsTable.employeeId, employeesTable.id))
        .where(inArray(taskAssignmentsTable.taskId, taskIds))
    : [];

  const assigneesByTask = new Map<string, { id: string; name: string }[]>();
  for (const a of allAssignments) {
    if (!assigneesByTask.has(a.taskId)) assigneesByTask.set(a.taskId, []);
    assigneesByTask.get(a.taskId)!.push({ id: a.employeeId, name: a.name ?? "" });
  }

  res.json(tasks.map(t => fmtTask(t, lotMap.get(t.lotId ?? "") ?? null, assigneesByTask.get(t.id) ?? [])));
});

// ── POST /planning/tasks ──────────────────────────────────────────────────────
router.post("/planning/tasks", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const id = crypto.randomUUID();

  await db.insert(productionTasksTable).values({
    id,
    lotId:         d.lotId || null,
    type:          d.type,
    startDate:     new Date(d.startDate),
    endDate:       new Date(d.endDate),
    requiredStaff: d.requiredStaff,
    notes:         d.notes || null,
    status:        "pending",
  });

  if (d.assigneeIds.length) {
    await db.insert(taskAssignmentsTable).values(
      d.assigneeIds.map(empId => ({
        id: crypto.randomUUID(), taskId: id, employeeId: empId,
      }))
    );
  }

  req.log.info({ taskId: id }, "Production task created");
  const result = await getTaskWithDetails(id);
  res.status(201).json(result);
});

// ── PUT /planning/tasks/:id ───────────────────────────────────────────────────
router.put("/planning/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  await db.update(productionTasksTable)
    .set({
      lotId:         d.lotId || null,
      type:          d.type,
      startDate:     new Date(d.startDate),
      endDate:       new Date(d.endDate),
      requiredStaff: d.requiredStaff,
      notes:         d.notes || null,
      updatedAt:     new Date(),
    })
    .where(eq(productionTasksTable.id, id));

  // Replace assignments
  await db.delete(taskAssignmentsTable).where(eq(taskAssignmentsTable.taskId, id));
  if (d.assigneeIds.length) {
    await db.insert(taskAssignmentsTable).values(
      d.assigneeIds.map(empId => ({ id: crypto.randomUUID(), taskId: id, employeeId: empId }))
    );
  }

  const result = await getTaskWithDetails(id);
  if (!result) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(result);
});

// ── DELETE /planning/tasks/:id ────────────────────────────────────────────────
router.delete("/planning/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(productionTasksTable).where(eq(productionTasksTable.id, req.params.id));
  res.status(204).send();
});

// ── GET /planning/orders ──────────────────────────────────────────────────────
router.get("/planning/orders", requireAuth, async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };
  const filters = status ? [eq(exportOrdersTable.status, status)] : [];

  const orders = await db
    .select()
    .from(exportOrdersTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(exportOrdersTable.priority), asc(exportOrdersTable.deadline));

  const lotIds = [...new Set(orders.map(o => o.lotId).filter(Boolean) as string[])];
  const lots = lotIds.length
    ? await db.select().from(lotsTable).where(inArray(lotsTable.id, lotIds))
    : [];
  const lotMap = new Map(lots.map(l => [l.id, l]));

  res.json(orders.map(o => fmtOrder(o, lotMap.get(o.lotId ?? "") ?? null)));
});

// ── POST /planning/orders ─────────────────────────────────────────────────────
router.post("/planning/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  // Check for duplicate reference
  const [existing] = await db.select({ id: exportOrdersTable.id })
    .from(exportOrdersTable).where(eq(exportOrdersTable.reference, d.reference));
  if (existing) {
    res.status(409).json({ error: `Référence "${d.reference}" déjà utilisée` });
    return;
  }

  const id = crypto.randomUUID();
  await db.insert(exportOrdersTable).values({
    id,
    reference:   d.reference,
    clientName:  d.clientName,
    clientId:    d.clientId || null,
    quantityKg:  d.quantityKg,
    priority:    d.priority ?? 2,
    deadline:    new Date(d.deadline),
    lotId:       d.lotId || null,
    destination: d.destination || null,
    notes:       d.notes || null,
    status:      "pending",
  });

  const [order] = await db.select().from(exportOrdersTable).where(eq(exportOrdersTable.id, id));
  req.log.info({ orderId: id }, "Export order created");
  res.status(201).json(fmtOrder(order));
});

// ── PUT /planning/orders/:id ──────────────────────────────────────────────────
router.put("/planning/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  // Ensure reference uniqueness (excluding self)
  const [conflict] = await db.select({ id: exportOrdersTable.id })
    .from(exportOrdersTable)
    .where(and(eq(exportOrdersTable.reference, d.reference)));
  if (conflict && conflict.id !== id) {
    res.status(409).json({ error: `Référence "${d.reference}" déjà utilisée` });
    return;
  }

  await db.update(exportOrdersTable).set({
    reference:   d.reference,
    clientName:  d.clientName,
    clientId:    d.clientId || null,
    quantityKg:  d.quantityKg,
    priority:    d.priority ?? 2,
    deadline:    new Date(d.deadline),
    lotId:       d.lotId || null,
    destination: d.destination || null,
    notes:       d.notes || null,
    updatedAt:   new Date(),
  }).where(eq(exportOrdersTable.id, id));

  const [order] = await db.select().from(exportOrdersTable).where(eq(exportOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }

  const lot = order.lotId
    ? (await db.select().from(lotsTable).where(eq(lotsTable.id, order.lotId)))[0] ?? null
    : null;

  res.json(fmtOrder(order, lot));
});

// ── DELETE /planning/orders/:id ───────────────────────────────────────────────
router.delete("/planning/orders/:id", requireAuth, async (req, res): Promise<void> => {
  await db.delete(exportOrdersTable).where(eq(exportOrdersTable.id, req.params.id));
  res.status(204).send();
});

// ── POST /planning/orders/:id/ship ────────────────────────────────────────────
router.post("/planning/orders/:id/ship", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const [order] = await db.select().from(exportOrdersTable).where(eq(exportOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  if (order.status === "shipped") { res.status(409).json({ error: "Already shipped" }); return; }

  // Deduct stock from assigned lot
  if (order.lotId) {
    const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, order.lotId));
    if (lot) {
      const newWeight = Math.max(0, lot.weightCurrent - order.quantityKg);
      await db.update(lotsTable).set({
        weightCurrent: newWeight,
        status: newWeight <= 0 ? "SHIPPED" : lot.status,
      }).where(eq(lotsTable.id, lot.id));
      req.log.info({ lotId: lot.id, deducted: order.quantityKg }, "Stock deducted for shipment");
    }
  }

  await db.update(exportOrdersTable)
    .set({ status: "shipped", updatedAt: new Date() })
    .where(eq(exportOrdersTable.id, id));

  const [updated] = await db.select().from(exportOrdersTable).where(eq(exportOrdersTable.id, id));
  req.log.info({ orderId: id }, "Export order shipped");
  res.json(fmtOrder(updated));
});

// ── POST /planning/auto-schedule ──────────────────────────────────────────────
router.post("/planning/auto-schedule", requireAuth, async (req, res): Promise<void> => {
  // 1. Get pending orders sorted by priority then deadline
  const pendingOrders = await db
    .select()
    .from(exportOrdersTable)
    .where(inArray(exportOrdersTable.status, ["pending"]))
    .orderBy(asc(exportOrdersTable.priority), asc(exportOrdersTable.deadline));

  // 2. Get available lots (READY or AVAILABLE)
  const availableLots = await db
    .select()
    .from(lotsTable)
    .where(and(
      inArray(lotsTable.status, ["READY", "AVAILABLE", "ready"]),
      eq(lotsTable.isBlocked, false),
    ))
    .orderBy(desc(lotsTable.weightCurrent));

  let tasksCreated = 0;
  let lotsLinked = 0;
  const results: { orderId: string; reference: string; action: string }[] = [];

  for (const order of pendingOrders) {
    // Find a lot with enough stock
    const lot = availableLots.find(l => l.weightCurrent >= order.quantityKg);

    if (lot && !order.lotId) {
      // Link lot to order
      await db.update(exportOrdersTable)
        .set({ lotId: lot.id, status: "preparing", updatedAt: new Date() })
        .where(eq(exportOrdersTable.id, order.id));

      // Mark lot as reserving
      lot.weightCurrent -= order.quantityKg;
      lotsLinked++;
      results.push({ orderId: order.id, reference: order.reference, action: `Lot ${lot.code} assigné` });
    } else if (!lot) {
      // Create a preparation task automatically
      const deadline = new Date(order.deadline);
      const taskStart = new Date(deadline);
      taskStart.setDate(taskStart.getDate() - 7); // Start 7 days before deadline
      const taskId = crypto.randomUUID();

      await db.insert(productionTasksTable).values({
        id:            taskId,
        lotId:         null,
        type:          "preparation",
        status:        "pending",
        startDate:     taskStart,
        endDate:       deadline,
        requiredStaff: Math.ceil(order.quantityKg / 100), // 1 staff per 100kg
        notes:         `Auto-planifié pour commande ${order.reference} (${order.quantityKg}kg)`,
        autoCreated:   "yes",
      });

      tasksCreated++;
      results.push({ orderId: order.id, reference: order.reference, action: `Tâche préparation créée (stock insuffisant)` });
    }
  }

  req.log.info({ tasksCreated, lotsLinked }, "Auto-schedule complete");
  res.json({ tasksCreated, lotsLinked, results });
});

// ── POST /planning/link-orders ────────────────────────────────────────────────
router.post("/planning/link-orders", requireAuth, async (req, res): Promise<void> => {
  const pendingOrders = await db
    .select()
    .from(exportOrdersTable)
    .where(and(
      inArray(exportOrdersTable.status, ["pending"]),
      sql`lot_id IS NULL`,
    ))
    .orderBy(asc(exportOrdersTable.priority), asc(exportOrdersTable.deadline));

  const readyLots = await db
    .select()
    .from(lotsTable)
    .where(and(
      inArray(lotsTable.status, ["READY", "AVAILABLE", "ready"]),
      eq(lotsTable.isBlocked, false),
    ))
    .orderBy(desc(lotsTable.weightCurrent));

  let linked = 0;
  const assignments: { orderId: string; lotId: string }[] = [];
  const usedCapacity = new Map<string, number>();

  for (const order of pendingOrders) {
    const availableWeight = (lot: typeof lotsTable.$inferSelect) =>
      lot.weightCurrent - (usedCapacity.get(lot.id) ?? 0);

    const lot = readyLots.find(l => availableWeight(l) >= order.quantityKg);
    if (lot) {
      usedCapacity.set(lot.id, (usedCapacity.get(lot.id) ?? 0) + order.quantityKg);
      await db.update(exportOrdersTable)
        .set({ lotId: lot.id, status: "preparing", updatedAt: new Date() })
        .where(eq(exportOrdersTable.id, order.id));
      assignments.push({ orderId: order.id, lotId: lot.id });
      linked++;
    }
  }

  req.log.info({ linked }, "Orders linked to lots");
  res.json({ linked, assignments });
});

export default router;
