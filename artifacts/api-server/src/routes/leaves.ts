import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, leavesTable, employeesTable } from "@workspace/db";
import { CreateLeaveBody, ApproveLeaveBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatLeave(leave: typeof leavesTable.$inferSelect, employee?: typeof employeesTable.$inferSelect | null) {
  return {
    ...leave,
    startDate: leave.startDate.toISOString(),
    endDate: leave.endDate.toISOString(),
    createdAt: leave.createdAt.toISOString(),
    employee: employee ? { ...employee, createdAt: employee.createdAt.toISOString() } : undefined,
  };
}

router.get("/leaves", requireAuth, async (_req, res): Promise<void> => {
  const leaves = await db
    .select()
    .from(leavesTable)
    .leftJoin(employeesTable, eq(leavesTable.employeeId, employeesTable.id))
    .orderBy(leavesTable.createdAt);

  res.json(leaves.map(({ leaves: l, employees: e }) => formatLeave(l, e)));
});

router.post("/leaves", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateLeaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, parsed.data.employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const [leave] = await db
    .insert(leavesTable)
    .values({
      employeeId: parsed.data.employeeId,
      type: parsed.data.type,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      status: "pending",
    })
    .returning();

  console.log(`[HR] Leave request: ${employee.name} — ${parsed.data.type} (${parsed.data.startDate} → ${parsed.data.endDate})`);
  res.status(201).json(formatLeave(leave, employee));
});

router.put("/leaves/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const parsed = ApproveLeaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!["approved", "rejected"].includes(parsed.data.status)) {
    res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    return;
  }

  const [leave] = await db
    .update(leavesTable)
    .set({ status: parsed.data.status })
    .where(eq(leavesTable.id, req.params.id))
    .returning();

  if (!leave) {
    res.status(404).json({ error: "Demande de congé introuvable" });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, leave.employeeId));
  console.log(`[HR] Leave ${leave.id} → ${parsed.data.status} for ${employee?.name}`);
  res.json(formatLeave(leave, employee));
});

export default router;
