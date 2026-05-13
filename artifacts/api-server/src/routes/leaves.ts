import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, count, inArray } from "drizzle-orm";
import { db, leavesTable, employeesTable, leaveBalancesTable } from "@workspace/db";
import { CreateLeaveBody, ApproveLeaveBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function calcDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function fmtEmp(e: typeof employeesTable.$inferSelect) {
  return {
    id: e.id, name: e.name, position: e.position,
    department: e.department, salary: e.salary,
    hireDate: e.hireDate?.toISOString() ?? null,
    isActive: e.isActive, phone: e.phone,
    createdAt: e.createdAt.toISOString(),
  };
}

function fmtLeave(
  l: typeof leavesTable.$inferSelect,
  e?: typeof employeesTable.$inferSelect | null,
) {
  return {
    ...l,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    createdAt: l.createdAt.toISOString(),
    employee: e ? fmtEmp(e) : undefined,
  };
}

function fmtBalance(
  b: typeof leaveBalancesTable.$inferSelect,
  e?: typeof employeesTable.$inferSelect | null,
) {
  return {
    ...b,
    remainingAnnual: Math.max(0, b.annualDays - b.usedAnnualDays),
    remainingSick: Math.max(0, b.sickDays - b.usedSickDays),
    updatedAt: b.updatedAt.toISOString(),
    employee: e ? fmtEmp(e) : undefined,
  };
}

// Compute accrued annual days for the current year based on hire date (2.5/month)
function accruedAnnualDays(hireDate: Date | null, year: number): number {
  const now = new Date();
  const yearStart = new Date(year, 0, 1);
  const start = hireDate && hireDate > yearStart ? hireDate : yearStart;
  const end = now.getFullYear() === year ? now : new Date(year, 11, 31);
  if (start > end) return 0;
  const months = (end.getFullYear() - start.getFullYear()) * 12
    + end.getMonth() - start.getMonth() + 1;
  return Math.min(30, Math.round(months * 2.5 * 10) / 10);
}

// Upsert a leave balance row for a given employee/year
async function ensureBalance(
  employeeId: string,
  year: number,
  emp: typeof employeesTable.$inferSelect,
): Promise<typeof leaveBalancesTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.year, year)));

  if (existing) return existing;

  const annualDays = accruedAnnualDays(emp.hireDate, year);
  const [created] = await db
    .insert(leaveBalancesTable)
    .values({
      id: crypto.randomUUID(),
      employeeId,
      year,
      annualDays,
      usedAnnualDays: 0,
      sickDays: 15,
      usedSickDays: 0,
    })
    .returning();
  return created;
}

// ── GET /leaves ───────────────────────────────────────────────────────────────
router.get("/leaves", requireAuth, async (req, res): Promise<void> => {
  const { employeeId, status, month } = req.query as Record<string, string>;

  const rows = await db
    .select()
    .from(leavesTable)
    .leftJoin(employeesTable, eq(leavesTable.employeeId, employeesTable.id))
    .orderBy(leavesTable.startDate);

  let leaves = rows.map(({ leaves: l, employees: e }) => fmtLeave(l, e));

  if (employeeId) leaves = leaves.filter(l => l.employeeId === employeeId);
  if (status && status !== "all") leaves = leaves.filter(l => l.status === status);
  if (month) {
    leaves = leaves.filter(l => l.startDate.slice(0, 7) === month || l.endDate.slice(0, 7) === month);
  }

  res.json(leaves);
});

// ── GET /leaves/stats ─────────────────────────────────────────────────────────
router.get("/leaves/stats", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  const [pending] = await db.select({ count: count() }).from(leavesTable).where(eq(leavesTable.status, "pending"));
  const [approved] = await db.select({ count: count() }).from(leavesTable).where(eq(leavesTable.status, "approved"));
  const absent = await db.select({ count: count() }).from(leavesTable).where(
    and(
      eq(leavesTable.status, "approved"),
      lte(leavesTable.startDate, tomorrow),
      gte(leavesTable.endDate, today),
    ),
  );
  const thisMonth = await db.select({ count: count() }).from(leavesTable).where(
    and(
      gte(leavesTable.startDate, monthStart),
      lte(leavesTable.startDate, monthEnd),
    ),
  );

  const allLeaves = await db.select().from(leavesTable);
  const byType: Record<string, number> = {};
  for (const l of allLeaves) {
    byType[l.type] = (byType[l.type] ?? 0) + 1;
  }

  res.json({
    pendingCount: Number(pending?.count ?? 0),
    approvedCount: Number(approved?.count ?? 0),
    absentToday: Number(absent[0]?.count ?? 0),
    totalThisMonth: Number(thisMonth[0]?.count ?? 0),
    byType,
  });
});

// ── GET /leaves/balances ──────────────────────────────────────────────────────
router.get("/leaves/balances", requireAuth, async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const emps = await db.select().from(employeesTable).where(eq(employeesTable.isActive, true));

  const rows: ReturnType<typeof fmtBalance>[] = [];
  for (const emp of emps) {
    const bal = await ensureBalance(emp.id, year, emp);
    rows.push(fmtBalance(bal, emp));
  }

  res.json(rows);
});

// ── GET /leaves/balances/:employeeId ─────────────────────────────────────────
router.get("/leaves/balances/:employeeId", requireAuth, async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const { employeeId } = req.params as Record<string, string>;

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "Employé introuvable" }); return; }

  const bal = await ensureBalance(emp.id, year, emp);
  res.json(fmtBalance(bal, emp));
});

// ── POST /leaves ──────────────────────────────────────────────────────────────
router.post("/leaves", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateLeaveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { employeeId, type, startDate, endDate, reason } = parsed.data;

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emp) { res.status(404).json({ error: "Employé introuvable" }); return; }

  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end < start) { res.status(400).json({ error: "Date fin avant date début" }); return; }

  const days = calcDays(start, end);

  // Check balance for annual / sick (not unpaid)
  if (type !== "unpaid") {
    const year = start.getFullYear();
    const bal = await ensureBalance(employeeId, year, emp);
    if (type === "annual" && days > (bal.annualDays - bal.usedAnnualDays)) {
      res.status(400).json({ error: `Solde insuffisant (${Math.max(0, bal.annualDays - bal.usedAnnualDays).toFixed(1)}j restants)` });
      return;
    }
    if (type === "sick" && days > (bal.sickDays - bal.usedSickDays)) {
      res.status(400).json({ error: `Solde maladie insuffisant (${Math.max(0, bal.sickDays - bal.usedSickDays).toFixed(1)}j restants)` });
      return;
    }
  }

  // Check overlap
  const overlap = await db.select().from(leavesTable).where(
    and(
      eq(leavesTable.employeeId, employeeId),
      inArray(leavesTable.status, ["pending", "approved"]),
      lte(leavesTable.startDate, end),
      gte(leavesTable.endDate, start),
    ),
  );
  if (overlap.length > 0) {
    res.status(400).json({ error: "Chevauchement avec un congé existant" });
    return;
  }

  const [leave] = await db
    .insert(leavesTable)
    .values({ employeeId, type, startDate: start, endDate: end, days, status: "pending", reason: reason ?? null })
    .returning();

  req.log.info({ leaveId: leave.id, employee: emp.name, type, days }, "Leave request created");
  res.status(201).json(fmtLeave(leave, emp));
});

// ── DELETE /leaves/:id ────────────────────────────────────────────────────────
router.delete("/leaves/:id", requireAuth, async (req, res): Promise<void> => {
  const [leave] = await db.select().from(leavesTable).where(eq(leavesTable.id, String(req.params.id)));
  if (!leave) { res.status(404).json({ error: "Congé introuvable" }); return; }

  // If was approved, restore balance
  if (leave.status === "approved" && leave.type !== "unpaid") {
    const year = leave.startDate.getFullYear();
    await db.update(leaveBalancesTable)
      .set(leave.type === "annual"
        ? { usedAnnualDays: sql`used_annual_days - ${leave.days}`, updatedAt: new Date() }
        : { usedSickDays: sql`used_sick_days - ${leave.days}`, updatedAt: new Date() })
      .where(and(eq(leaveBalancesTable.employeeId, leave.employeeId), eq(leaveBalancesTable.year, year)));
  }

  const [deleted] = await db.delete(leavesTable).where(eq(leavesTable.id, String(req.params.id))).returning();
  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, leave.employeeId));
  res.json(fmtLeave(deleted, emp));
});

// ── PUT /leaves/:id/approve ───────────────────────────────────────────────────
router.put("/leaves/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const parsed = ApproveLeaveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!["approved", "rejected"].includes(parsed.data.status)) {
    res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    return;
  }

  const [existing] = await db.select().from(leavesTable).where(eq(leavesTable.id, String(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Congé introuvable" }); return; }

  const [leave] = await db
    .update(leavesTable)
    .set({ status: parsed.data.status, approvedBy: (req as any).session?.userId ?? null })
    .where(eq(leavesTable.id, String(req.params.id)))
    .returning();

  // Update balance when approving/rejecting annual or sick leave
  if (existing.type !== "unpaid") {
    const year = existing.startDate.getFullYear();
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, existing.employeeId));
    if (emp) {
      const bal = await ensureBalance(existing.employeeId, year, emp);

      if (parsed.data.status === "approved" && existing.status !== "approved") {
        const update = existing.type === "annual"
          ? { usedAnnualDays: Math.min(bal.annualDays, bal.usedAnnualDays + existing.days), updatedAt: new Date() }
          : { usedSickDays: Math.min(bal.sickDays, bal.usedSickDays + existing.days), updatedAt: new Date() };
        await db.update(leaveBalancesTable).set(update)
          .where(and(eq(leaveBalancesTable.employeeId, existing.employeeId), eq(leaveBalancesTable.year, year)));
      } else if (parsed.data.status === "rejected" && existing.status === "approved") {
        const update = existing.type === "annual"
          ? { usedAnnualDays: Math.max(0, bal.usedAnnualDays - existing.days), updatedAt: new Date() }
          : { usedSickDays: Math.max(0, bal.usedSickDays - existing.days), updatedAt: new Date() };
        await db.update(leaveBalancesTable).set(update)
          .where(and(eq(leaveBalancesTable.employeeId, existing.employeeId), eq(leaveBalancesTable.year, year)));
      }
    }
  }

  const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, leave.employeeId));
  req.log.info({ leaveId: leave.id, status: leave.status }, "Leave approved/rejected");
  res.json(fmtLeave(leave, emp));
});

export default router;
