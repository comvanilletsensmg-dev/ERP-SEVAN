import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import { CreateEmployeeBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/employees", requireAuth, async (_req, res): Promise<void> => {
  const employees = await db.select().from(employeesTable).orderBy(employeesTable.createdAt);
  res.json(employees.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })));
});

router.get("/employees/export/csv", requireAuth, async (_req, res): Promise<void> => {
  const employees = await db.select().from(employeesTable).orderBy(employeesTable.name);
  const headers = ["ID", "Nom", "Poste", "Département", "Salaire (MGA)", "Téléphone", "Date embauche"];
  const rows = employees.map((e) => [
    e.id,
    `"${e.name}"`,
    `"${e.position}"`,
    `"${e.department || ""}"`,
    e.salary?.toString() || "",
    `"${e.phone || ""}"`,
    e.createdAt.toISOString().slice(0, 10),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=employes.csv");
  res.send(csv);
});

router.post("/employees", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [employee] = await db.insert(employeesTable).values(parsed.data).returning();
  console.log(`[HR] Created employee: ${employee.name} — ${employee.position}`);
  res.status(201).json({ ...employee, createdAt: employee.createdAt.toISOString() });
});

router.put("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [employee] = await db
    .update(employeesTable)
    .set(parsed.data)
    .where(eq(employeesTable.id, req.params.id))
    .returning();
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }
  res.json({ ...employee, createdAt: employee.createdAt.toISOString() });
});

export default router;
