import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, hrRequestsTable, employeesTable } from "@workspace/db";
import { CreateHrRequestBody, UpdateHrRequestBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatRequest(req: typeof hrRequestsTable.$inferSelect, employee?: typeof employeesTable.$inferSelect | null) {
  return {
    ...req,
    createdAt: req.createdAt.toISOString(),
    employee: employee ? { ...employee, createdAt: employee.createdAt.toISOString() } : undefined,
  };
}

router.get("/hr-requests", requireAuth, async (_req, res): Promise<void> => {
  const requests = await db
    .select()
    .from(hrRequestsTable)
    .leftJoin(employeesTable, eq(hrRequestsTable.employeeId, employeesTable.id))
    .orderBy(hrRequestsTable.createdAt);

  res.json(requests.map(({ hr_requests: r, employees: e }) => formatRequest(r, e)));
});

router.post("/hr-requests", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateHrRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, parsed.data.employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const [request] = await db
    .insert(hrRequestsTable)
    .values({ ...parsed.data, status: "pending" })
    .returning();

  console.log(`[HR] Request: ${employee.name} — ${parsed.data.type}: "${parsed.data.description.slice(0, 50)}"`);
  res.status(201).json(formatRequest(request, employee));
});

router.put("/hr-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateHrRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [request] = await db
    .update(hrRequestsTable)
    .set(parsed.data)
    .where(eq(hrRequestsTable.id, req.params.id))
    .returning();

  if (!request) {
    res.status(404).json({ error: "Demande introuvable" });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, request.employeeId));
  res.json(formatRequest(request, employee));
});

export default router;
