import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, onboardingTasksTable, employeesTable } from "@workspace/db";
import { CreateOnboardingTaskBody, UpdateOnboardingTaskBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatTask(task: typeof onboardingTasksTable.$inferSelect, employee?: typeof employeesTable.$inferSelect | null) {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    employee: employee ? { ...employee, createdAt: employee.createdAt.toISOString(), hireDate: employee.hireDate?.toISOString() ?? null } : undefined,
  };
}

router.get("/onboarding", requireAuth, async (req, res): Promise<void> => {
  const { employeeId } = req.query as { employeeId?: string };

  const rows = await db
    .select()
    .from(onboardingTasksTable)
    .leftJoin(employeesTable, eq(onboardingTasksTable.employeeId, employeesTable.id))
    .orderBy(onboardingTasksTable.createdAt);

  let result = rows.map(({ onboarding_tasks: t, employees: e }) => formatTask(t, e));
  if (employeeId) result = result.filter((r) => r.employeeId === employeeId);

  res.json(result);
});

router.post("/onboarding", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOnboardingTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, parsed.data.employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const [task] = await db.insert(onboardingTasksTable).values(parsed.data).returning();
  console.log(`[ONBOARDING] Tâche créée pour ${employee.name}: "${task.title}"`);
  res.status(201).json(formatTask(task, employee));
});

router.put("/onboarding/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateOnboardingTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db
    .update(onboardingTasksTable)
    .set({ status: parsed.data.status })
    .where(eq(onboardingTasksTable.id, req.params.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Tâche introuvable" });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, task.employeeId));
  res.json(formatTask(task, employee));
});

export default router;
