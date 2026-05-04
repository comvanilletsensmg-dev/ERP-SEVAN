/**
 * Employees routes — CRUD + CSV export.
 * Now supports: matricule, sexe, dateNaissance, email, typeContrat, cnapsNumber, ostieNumber, statut.
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatEmployee(e: typeof employeesTable.$inferSelect) {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    hireDate: e.hireDate?.toISOString() ?? null,
    dateNaissance: e.dateNaissance?.toISOString() ?? null,
  };
}

function parseBody(body: Record<string, unknown>) {
  return {
    matricule: (body.matricule as string | null) || null,
    name: body.name as string,
    sexe: (body.sexe as string | null) || null,
    dateNaissance: body.dateNaissance ? new Date(body.dateNaissance as string) : null,
    email: (body.email as string | null) || null,
    position: body.position as string,
    department: (body.department as string | null) || null,
    salary: body.salary != null ? Number(body.salary) : null,
    hireDate: body.hireDate ? new Date(body.hireDate as string) : null,
    typeContrat: (body.typeContrat as string | null) || "CDI",
    cnapsNumber: (body.cnapsNumber as string | null) || null,
    ostieNumber: (body.ostieNumber as string | null) || null,
    statut: (body.statut as string | null) || "actif",
    isActive: ((body.statut as string | null) || "actif") === "actif",
    phone: (body.phone as string | null) || null,
  };
}

router.get("/employees", requireAuth, async (_req, res): Promise<void> => {
  const employees = await db.select().from(employeesTable).orderBy(employeesTable.createdAt);
  res.json(employees.map(formatEmployee));
});

router.get("/employees/export/csv", requireAuth, async (_req, res): Promise<void> => {
  const employees = await db.select().from(employeesTable).orderBy(employeesTable.name);
  const headers = ["Matricule", "Nom", "Poste", "Département", "Type Contrat", "Salaire (MGA)", "Téléphone", "Email", "CNAPS", "OSTIE", "Statut", "Date embauche"];
  const csvEsc = (v: unknown) => { const s = String(v ?? ""); return s.includes(",") ? `"${s}"` : s; };
  const rows = employees.map((e) => [
    e.matricule ?? "", e.name, e.position, e.department ?? "",
    e.typeContrat ?? "CDI", e.salary?.toString() ?? "", e.phone ?? "", e.email ?? "",
    e.cnapsNumber ?? "", e.ostieNumber ?? "", e.statut,
    e.hireDate?.toISOString().slice(0, 10) ?? "",
  ].map(csvEsc));
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=employes.csv");
  res.send("\uFEFF" + csv);
});

router.get("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const [e] = await db.select().from(employeesTable).where(eq(employeesTable.id, req.params.id));
  if (!e) { res.status(404).json({ error: "Employé introuvable" }); return; }
  res.json(formatEmployee(e));
});

router.post("/employees", requireAuth, async (req, res): Promise<void> => {
  if (!req.body.name || !req.body.position) {
    res.status(400).json({ error: "name et position sont obligatoires" });
    return;
  }
  const [employee] = await db.insert(employeesTable).values(parseBody(req.body)).returning();
  res.status(201).json(formatEmployee(employee));
});

router.put("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  if (!req.body.name || !req.body.position) {
    res.status(400).json({ error: "name et position sont obligatoires" });
    return;
  }
  const [employee] = await db.update(employeesTable)
    .set(parseBody(req.body))
    .where(eq(employeesTable.id, req.params.id))
    .returning();
  if (!employee) { res.status(404).json({ error: "Employé introuvable" }); return; }
  res.json(formatEmployee(employee));
});

export default router;
