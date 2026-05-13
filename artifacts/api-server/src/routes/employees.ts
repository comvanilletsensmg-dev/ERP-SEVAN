/**
 * Employees routes — CRUD + CSV export + auto-matricule + user creation.
 *
 *   GET  /api/employees               — list all
 *   GET  /api/employees/export/csv    — CSV export
 *   GET  /api/employees/:id           — single
 *   POST /api/employees               — create (auto-matricule, optional user)
 *   PUT  /api/employees/:id           — update
 *   PUT  /api/employees/:id/status    — update statut only
 */
import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, employeesTable, departmentsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { generateMatricule } from "../lib/matricule";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Postes that get a system account */
const POSTE_ROLE_MAP: Record<string, string> = {
  "Directeur Général": ROLES.SUPER_ADMIN,
  "Directeur Adjoint": ROLES.SUPER_ADMIN,
  "Business Developer": ROLES.COMMERCIAL,
  "Commercial": ROLES.COMMERCIAL,
  "Responsable Logistique": ROLES.LOGISTICS_MANAGER,
  "Agent Logistique": ROLES.LOGISTICS_MANAGER,
  "RH": ROLES.HR_MANAGER,
  "Responsable RH": ROLES.HR_MANAGER,
  "Comptable": ROLES.ACCOUNTANT,
};

function formatEmployee(e: typeof employeesTable.$inferSelect & { deptName?: string }) {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    hireDate: e.hireDate?.toISOString() ?? null,
    dateNaissance: e.dateNaissance?.toISOString() ?? null,
  };
}

function parseBody(body: Record<string, unknown>) {
  const nom = (body.nom as string | null) || null;
  const prenom = (body.prenom as string | null) || null;
  const nameFromParts = nom && prenom ? `${prenom} ${nom}` : nom || prenom || null;
  const name = (body.name as string | null) || nameFromParts || "";

  return {
    matricule: (body.matricule as string | null) || null,
    name,
    nom,
    prenom,
    sexe: (body.sexe as string | null) || null,
    dateNaissance: body.dateNaissance ? new Date(body.dateNaissance as string) : null,
    email: (body.email as string | null) || null,
    position: (body.position as string) || (body.poste as string) || "",
    department: (body.department as string | null) || null,
    departmentId: (body.departmentId as string | null) || null,
    salary: body.salary != null && body.salary !== "" ? Number(body.salary) : null,
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
  const employees = await db
    .select({
      employee: employeesTable,
      deptName: departmentsTable.name,
    })
    .from(employeesTable)
    .leftJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id))
    .orderBy(employeesTable.createdAt);

  res.json(employees.map(({ employee: e, deptName }) =>
    formatEmployee({ ...e, department: deptName ?? e.department ?? null })
  ));
});

router.get("/employees/export/csv", requireAuth, async (_req, res): Promise<void> => {
  const employees = await db
    .select({ employee: employeesTable, deptName: departmentsTable.name })
    .from(employeesTable)
    .leftJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id))
    .orderBy(employeesTable.name);

  const headers = ["Matricule", "Nom", "Prénom", "Poste", "Département", "Type Contrat", "Salaire (MGA)", "Téléphone", "Email", "Statut", "Compte", "Date embauche"];
  const csvEsc = (v: unknown) => { const s = String(v ?? ""); return s.includes(",") ? `"${s}"` : s; };
  const rows = employees.map(({ employee: e, deptName }) => [
    e.matricule ?? "",
    e.nom ?? e.name,
    e.prenom ?? "",
    e.position,
    deptName ?? e.department ?? "",
    e.typeContrat ?? "CDI",
    e.salary?.toString() ?? "",
    e.phone ?? "",
    e.email ?? "",
    e.statut,
    e.hasAccount ? "Oui" : "Non",
    e.hireDate?.toISOString().slice(0, 10) ?? "",
  ].map(csvEsc));
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=employes.csv");
  res.send("\uFEFF" + csv);
});

router.get("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select({ employee: employeesTable, deptName: departmentsTable.name })
    .from(employeesTable)
    .leftJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id))
    .where(eq(employeesTable.id, String(req.params.id)));
  if (!row) { res.status(404).json({ error: "Employé introuvable" }); return; }
  res.json(formatEmployee({ ...row.employee, department: row.deptName ?? row.employee.department ?? null }));
});

router.post("/employees", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const nom = (body.nom as string | null) || null;
  const prenom = (body.prenom as string | null) || null;
  const position = (body.position as string) || (body.poste as string) || "";

  if (!nom && !body.name) {
    res.status(400).json({ error: "nom (ou name) est obligatoire" });
    return;
  }
  if (!position) {
    res.status(400).json({ error: "position (poste) est obligatoire" });
    return;
  }

  const data = parseBody(body);

  // Resolve department name from departmentId if given
  if (data.departmentId && !data.department) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, data.departmentId));
    if (dept) data.department = dept.name;
  }

  // Auto-generate matricule if not provided
  if (!data.matricule) {
    let deptCode = "000";
    if (data.departmentId) {
      const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, data.departmentId));
      if (dept) deptCode = dept.code;
    }
    data.matricule = await generateMatricule(deptCode);
  }

  // Create employee
  const [employee] = await db.insert(employeesTable).values(data).returning();

  // Create user account if poste eligible
  let generatedPassword: string | null = null;
  const role = POSTE_ROLE_MAP[position];
  if (role && employee.email) {
    const prenomSlug = (data.prenom || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 6) || "emp";
    generatedPassword = `${prenomSlug}${new Date().getFullYear()}!`;
    try {
      await db.insert(usersTable).values({
        email: employee.email,
        password: generatedPassword,
        name: employee.name,
        role,
        employeeId: employee.id,
      });
      await db.update(employeesTable).set({ hasAccount: true }).where(eq(employeesTable.id, employee.id));
      employee.hasAccount = true;
      logger.info({ employeeId: employee.id, email: employee.email, role }, "User account created for employee");
    } catch (err) {
      logger.warn({ err, email: employee.email }, "Could not create user (email already exists?)");
    }
  }

  res.status(201).json({
    ...formatEmployee(employee),
    ...(generatedPassword ? { generatedPassword, accountCreated: true } : { accountCreated: false }),
  });
});

router.put("/employees/:id", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const position = (body.position as string) || (body.poste as string) || "";
  if (!body.name && !body.nom) {
    res.status(400).json({ error: "name ou nom est obligatoire" });
    return;
  }
  if (!position) {
    res.status(400).json({ error: "position est obligatoire" });
    return;
  }

  // Fetch existing employee to detect department change
  const [existing] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, String(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Employé introuvable" }); return; }

  const data = parseBody(body);

  // Resolve department name
  let newDeptCode: string | null = null;
  if (data.departmentId) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, data.departmentId));
    if (dept) {
      data.department = dept.name;
      newDeptCode = dept.code;
    }
  }

  // Regenerate matricule only when department actually changes
  const deptChanged = data.departmentId !== existing.departmentId;
  if (deptChanged && newDeptCode) {
    data.matricule = await generateMatricule(newDeptCode);
    logger.info(
      { employeeId: existing.id, oldDept: existing.departmentId, newDept: data.departmentId, newMatricule: data.matricule },
      "Matricule regenerated due to department change"
    );
  } else {
    // Keep existing matricule — generate one if employee had none and now has a dept
    if (!existing.matricule && newDeptCode) {
      data.matricule = await generateMatricule(newDeptCode);
      logger.info({ employeeId: existing.id, newMatricule: data.matricule }, "Matricule generated for first-time dept assignment");
    } else {
      // Preserve existing matricule regardless of position/status change
      data.matricule = existing.matricule;
    }
  }

  const [employee] = await db
    .update(employeesTable)
    .set(data)
    .where(eq(employeesTable.id, String(req.params.id)))
    .returning();

  if (!employee) { res.status(404).json({ error: "Employé introuvable" }); return; }
  res.json({ ...formatEmployee(employee), matriculeRegenerated: deptChanged && !!newDeptCode });
});

/** Update statut only */
router.put("/employees/:id/status", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER), async (req, res): Promise<void> => {
  const { statut } = req.body as { statut?: string };
  if (!statut || !["actif", "suspendu", "sorti"].includes(statut)) {
    res.status(400).json({ error: "statut invalide (actif | suspendu | sorti)" });
    return;
  }
  const [employee] = await db
    .update(employeesTable)
    .set({ statut, isActive: statut === "actif" })
    .where(eq(employeesTable.id, String(req.params.id)))
    .returning();
  if (!employee) { res.status(404).json({ error: "Employé introuvable" }); return; }
  res.json(formatEmployee(employee));
});

export default router;
