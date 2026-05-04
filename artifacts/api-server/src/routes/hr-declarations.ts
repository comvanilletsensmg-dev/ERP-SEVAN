/**
 * HR declarations & dashboard routes.
 *
 *   GET /api/hr/dashboard              — KPIs RH
 *   GET /api/hr/declarations/cnaps     — export CSV CNAPS ?month=YYYY-MM
 *   GET /api/hr/declarations/ostie     — export CSV OSTIE ?month=YYYY-MM
 *   GET /api/hr/declarations/irsa      — export CSV IRSA  ?month=YYYY-MM
 */
import { Router, type IRouter } from "express";
import { db, employeesTable, payrollTable, attendanceTable, leavesTable } from "@workspace/db";
import { and, eq, gte, lt, sum, count, avg } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";

const router: IRouter = Router();

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

router.get("/hr/dashboard", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const month = currentMonth();
  const { start: mStart, end: mEnd } = monthRange(month);

  const [employees, attendanceToday, pendingLeaves, payrollMonth] = await Promise.all([
    db.select().from(employeesTable),
    db.select({ id: attendanceTable.id }).from(attendanceTable).where(and(gte(attendanceTable.date, todayStart), lt(attendanceTable.date, todayEnd))),
    db.select({ id: leavesTable.id }).from(leavesTable).where(eq(leavesTable.status, "pending")),
    db.select().from(payrollTable).where(eq(payrollTable.month, month)),
  ]);

  const active = employees.filter((e) => e.statut === "actif" || e.isActive);
  const totalSalary = active.reduce((s, e) => s + (e.salary ?? 0), 0);
  const presentToday = attendanceToday.length;
  const absentToday = Math.max(0, active.length - presentToday);

  const masseSalariale = payrollMonth.reduce((s, p) => s + p.salaryBase, 0);
  const totalCnaps = payrollMonth.reduce((s, p) => s + p.cnapsEmp, 0);
  const totalOstie = payrollMonth.reduce((s, p) => s + p.ostieEmp, 0);
  const totalIrsa = payrollMonth.reduce((s, p) => s + p.irsa, 0);
  const totalNet = payrollMonth.reduce((s, p) => s + p.netSalary, 0);

  const byDept: Record<string, number> = {};
  for (const e of active) {
    const d = e.department ?? "Autre";
    byDept[d] = (byDept[d] ?? 0) + 1;
  }

  const byContrat: Record<string, number> = {};
  for (const e of active) {
    const c = e.typeContrat ?? "CDI";
    byContrat[c] = (byContrat[c] ?? 0) + 1;
  }

  res.json({
    totalEmployees: employees.length,
    activeEmployees: active.length,
    suspendedEmployees: employees.filter((e) => e.statut === "suspendu").length,
    exitedEmployees: employees.filter((e) => e.statut === "sorti").length,
    presentToday,
    absentToday,
    pendingLeaves: pendingLeaves.length,
    avgSalary: active.length > 0 ? Math.round(totalSalary / active.length) : 0,
    masseSalariale: Math.round(masseSalariale),
    totalCnaps: Math.round(totalCnaps),
    totalOstie: Math.round(totalOstie),
    totalIrsa: Math.round(totalIrsa),
    totalNet: Math.round(totalNet),
    payrollGenerated: payrollMonth.length,
    byDepartment: byDept,
    byContrat,
    month,
  });
});

router.get("/hr/declarations/cnaps", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.ACCOUNTANT), async (req, res): Promise<void> => {
  const month = (req.query.month as string) || currentMonth();
  const { start, end } = monthRange(month);

  const rows = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .where(eq(payrollTable.month, month));

  const csv = buildCsv(
    ["Mois", "Matricule", "Nom", "Poste", "Salaire Brut (MGA)", "CNAPS Salarié (MGA)", "N° CNAPS"],
    rows.map(({ payroll: p, employees: e }) => [
      month,
      e?.matricule ?? "",
      e?.name ?? "",
      e?.position ?? "",
      Math.round(p.salaryBase + p.bonus + p.heuresSup),
      Math.round(p.cnapsEmp),
      e?.cnapsNumber ?? "",
    ])
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=declaration-cnaps-${month}.csv`);
  res.send("\uFEFF" + csv);
});

router.get("/hr/declarations/ostie", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.ACCOUNTANT), async (req, res): Promise<void> => {
  const month = (req.query.month as string) || currentMonth();

  const rows = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .where(eq(payrollTable.month, month));

  const csv = buildCsv(
    ["Mois", "Matricule", "Nom", "Poste", "Salaire Brut (MGA)", "OSTIE Salarié (MGA)", "N° OSTIE"],
    rows.map(({ payroll: p, employees: e }) => [
      month,
      e?.matricule ?? "",
      e?.name ?? "",
      e?.position ?? "",
      Math.round(p.salaryBase + p.bonus + p.heuresSup),
      Math.round(p.ostieEmp),
      e?.ostieNumber ?? "",
    ])
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=declaration-ostie-${month}.csv`);
  res.send("\uFEFF" + csv);
});

router.get("/hr/declarations/irsa", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.ACCOUNTANT), async (req, res): Promise<void> => {
  const month = (req.query.month as string) || currentMonth();

  const rows = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .where(eq(payrollTable.month, month));

  const csv = buildCsv(
    ["Mois", "Matricule", "Nom", "Poste", "Net Imposable (MGA)", "IRSA (MGA)"],
    rows.map(({ payroll: p, employees: e }) => {
      const brut = p.salaryBase + p.bonus + p.heuresSup;
      const netImposable = Math.round(brut - p.cnapsEmp - p.ostieEmp);
      return [month, e?.matricule ?? "", e?.name ?? "", e?.position ?? "", netImposable, Math.round(p.irsa)];
    })
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=declaration-irsa-${month}.csv`);
  res.send("\uFEFF" + csv);
});

export default router;
