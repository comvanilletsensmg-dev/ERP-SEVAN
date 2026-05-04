/**
 * Payroll routes — génération paie Madagascar + bulletin HTML/PDF + exports.
 *
 *   GET  /api/payroll              — liste fiches de paie
 *   GET  /api/payroll/:id          — fiche de paie unitaire
 *   GET  /api/payroll/:id/pdf      — bulletin de paie HTML (imprimable → PDF)
 *   POST /api/payroll              — générer la paie d'un employé pour un mois
 *   POST /api/payroll/batch        — générer paie de tous les actifs pour un mois
 */
import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { db, employeesTable, payrollTable, bonusesTable, attendanceTable } from "@workspace/db";
import { GeneratePayrollBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { requireRole, ROLES } from "../middlewares/roles";
import { calculatePayroll } from "../lib/payroll-calc";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const hrAccess = requireRole(ROLES.SUPER_ADMIN, ROLES.HR_MANAGER);

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

function formatEmployee(e: typeof employeesTable.$inferSelect | null) {
  if (!e) return undefined;
  return { ...e, createdAt: e.createdAt.toISOString(), hireDate: e.hireDate?.toISOString() ?? null, dateNaissance: e.dateNaissance?.toISOString() ?? null };
}

function formatPayroll(p: typeof payrollTable.$inferSelect, employee?: typeof employeesTable.$inferSelect | null) {
  return { ...p, createdAt: p.createdAt.toISOString(), employee: formatEmployee(employee ?? null) };
}

router.get("/payroll", requireAuth, async (req, res): Promise<void> => {
  const { month, employeeId } = req.query as { month?: string; employeeId?: string };
  const rows = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .orderBy(payrollTable.createdAt);
  let result = rows.map(({ payroll: p, employees: e }) => formatPayroll(p, e));
  if (month) result = result.filter((r) => r.month === month);
  if (employeeId) result = result.filter((r) => r.employeeId === employeeId);
  res.json(result);
});

router.get("/payroll/:id", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .where(eq(payrollTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Fiche de paie introuvable" }); return; }
  res.json(formatPayroll(row.payroll, row.employees));
});

router.get("/payroll/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(payrollTable)
    .leftJoin(employeesTable, eq(payrollTable.employeeId, employeesTable.id))
    .where(eq(payrollTable.id, req.params.id));
  if (!row) { res.status(404).json({ error: "Fiche de paie introuvable" }); return; }

  const p = row.payroll;
  const e = row.employees;
  const brut = p.salaryBase + p.bonus + p.heuresSup;
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR") + " MGA";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bulletin de paie — ${e?.name ?? ""} — ${p.month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 24px; }
  h1 { font-size: 18px; color: #1a6c3c; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #666; margin-bottom: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .company { font-size: 14px; font-weight: bold; }
  .meta { font-size: 11px; color: #444; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1a6c3c; color: #fff; padding: 6px 10px; text-align: left; font-size: 11px; }
  td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .total-row td { font-weight: bold; background: #f0fdf4; border-top: 2px solid #1a6c3c; }
  .net-row td { font-weight: bold; font-size: 14px; background: #1a6c3c; color: #fff; }
  .footer { margin-top: 32px; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 8px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company">🌿 Vanilla Madagascar Export</div>
    <div class="meta">Direction des Ressources Humaines</div>
  </div>
  <div style="text-align:right">
    <h1>Bulletin de Paie</h1>
    <div class="subtitle">Période : ${p.month}</div>
  </div>
</div>

<table>
  <tr><th colspan="2">Informations Employé</th></tr>
  <tr><td>Nom</td><td><strong>${e?.name ?? "—"}</strong></td></tr>
  <tr><td>Matricule</td><td>${e?.matricule ?? "—"}</td></tr>
  <tr><td>Poste</td><td>${e?.position ?? "—"}</td></tr>
  <tr><td>Département</td><td>${e?.department ?? "—"}</td></tr>
  <tr><td>Type contrat</td><td>${e?.typeContrat ?? "CDI"}</td></tr>
  <tr><td>Date embauche</td><td>${e?.hireDate ? new Date(e.hireDate).toLocaleDateString("fr-FR") : "—"}</td></tr>
  <tr><td>N° CNAPS</td><td>${e?.cnapsNumber ?? "—"}</td></tr>
  <tr><td>N° OSTIE</td><td>${e?.ostieNumber ?? "—"}</td></tr>
</table>

<table>
  <tr><th>Libellé</th><th style="text-align:right">Montant</th></tr>
  <tr><td>Salaire de base</td><td style="text-align:right">${fmt(p.salaryBase)}</td></tr>
  ${p.bonus > 0 ? `<tr><td>Primes &amp; bonus</td><td style="text-align:right">${fmt(p.bonus)}</td></tr>` : ""}
  ${p.heuresSup > 0 ? `<tr><td>Heures supplémentaires</td><td style="text-align:right">${fmt(p.heuresSup)}</td></tr>` : ""}
  <tr class="total-row"><td>Salaire BRUT</td><td style="text-align:right">${fmt(brut)}</td></tr>
</table>

<table>
  <tr><th>Retenues</th><th style="text-align:right">Montant</th></tr>
  <tr><td>CNAPS salarié (1%)</td><td style="text-align:right">— ${fmt(p.cnapsEmp)}</td></tr>
  <tr><td>OSTIE salarié (1%)</td><td style="text-align:right">— ${fmt(p.ostieEmp)}</td></tr>
  <tr><td>IRSA (barème progressif)</td><td style="text-align:right">— ${fmt(p.irsa)}</td></tr>
  ${p.deductions > 0 ? `<tr><td>Déductions absences</td><td style="text-align:right">— ${fmt(p.deductions)}</td></tr>` : ""}
  <tr class="net-row"><td>NET À PAYER</td><td style="text-align:right">${fmt(p.netSalary)}</td></tr>
</table>

<div class="footer">
  Document généré automatiquement — Vanilla Madagascar ERP — ${new Date().toLocaleDateString("fr-FR")}
  <br>Ce bulletin de paie est confidentiel.
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

router.post("/payroll", requireAuth, hrAccess, async (req, res): Promise<void> => {
  const parsed = GeneratePayrollBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { employeeId, month } = parsed.data;
  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) { res.status(404).json({ error: "Employé introuvable" }); return; }

  const existing = await db.select().from(payrollTable).where(and(eq(payrollTable.employeeId, employeeId), eq(payrollTable.month, month)));
  if (existing.length > 0) { res.status(400).json({ error: `Paie déjà générée pour ${employee.name} en ${month}` }); return; }

  const salaryBase = employee.salary ?? 0;
  const { start, end } = monthRange(month);

  const attendanceRows = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, employeeId), gte(attendanceTable.date, start), lt(attendanceTable.date, end)));
  const workedDays = attendanceRows.length;
  const businessDays = 26;
  const absentDays = Math.max(0, businessDays - workedDays);
  const absenceDeduction = Math.round((salaryBase / businessDays) * absentDays);

  const bonusRows = await db.select().from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, employeeId), gte(bonusesTable.createdAt, start), lt(bonusesTable.createdAt, end)));
  const bonusTotal = bonusRows.reduce((acc, b) => acc + b.amount, 0);

  const heuresSup = Number(req.body.heuresSup ?? 0);
  const calc = calculatePayroll({ salaryBase, bonus: bonusTotal, heuresSup, deductions: absenceDeduction });

  const [payroll] = await db.insert(payrollTable).values({
    employeeId, month, salaryBase,
    bonus: bonusTotal, heuresSup,
    deductions: absenceDeduction,
    cnapsEmp: calc.cnapsEmp, ostieEmp: calc.ostieEmp, irsa: calc.irsa,
    charges: calc.charges, netSalary: calc.netSalary,
  }).returning();

  logger.info({ name: employee.name, month, net: calc.netSalary }, "Payroll generated");
  res.status(201).json(formatPayroll(payroll, employee));
});

/** Delete a single payroll record */
router.delete("/payroll/:id", requireAuth, hrAccess, async (req, res): Promise<void> => {
  const [deleted] = await db
    .delete(payrollTable)
    .where(eq(payrollTable.id, req.params.id))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Fiche de paie introuvable" }); return; }
  logger.info({ id: deleted.id, employeeId: deleted.employeeId, month: deleted.month }, "Payroll record deleted");
  res.json({ success: true, deleted: { id: deleted.id, month: deleted.month } });
});

// Batch payroll: generate for ALL active employees in a given month
router.post("/payroll/batch", requireAuth, hrAccess, async (req, res): Promise<void> => {
  const { month } = req.body as { month?: string };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "month requis (YYYY-MM)" }); return; }

  const activeEmployees = await db.select().from(employeesTable)
    .where(eq(employeesTable.statut, "actif"));

  const { start, end } = monthRange(month);
  let created = 0; let skipped = 0;

  for (const employee of activeEmployees) {
    const existing = await db.select({ id: payrollTable.id }).from(payrollTable)
      .where(and(eq(payrollTable.employeeId, employee.id), eq(payrollTable.month, month))).limit(1);
    if (existing.length > 0) { skipped++; continue; }

    const salaryBase = employee.salary ?? 0;
    const attendanceRows = await db.select().from(attendanceTable)
      .where(and(eq(attendanceTable.employeeId, employee.id), gte(attendanceTable.date, start), lt(attendanceTable.date, end)));
    const workedDays = attendanceRows.length;
    const businessDays = 26;
    const absenceDeduction = Math.round((salaryBase / businessDays) * Math.max(0, businessDays - workedDays));

    const bonusRows = await db.select().from(bonusesTable)
      .where(and(eq(bonusesTable.employeeId, employee.id), gte(bonusesTable.createdAt, start), lt(bonusesTable.createdAt, end)));
    const bonusTotal = bonusRows.reduce((acc, b) => acc + b.amount, 0);

    const calc = calculatePayroll({ salaryBase, bonus: bonusTotal, heuresSup: 0, deductions: absenceDeduction });
    await db.insert(payrollTable).values({
      employeeId: employee.id, month, salaryBase,
      bonus: bonusTotal, heuresSup: 0, deductions: absenceDeduction,
      cnapsEmp: calc.cnapsEmp, ostieEmp: calc.ostieEmp, irsa: calc.irsa,
      charges: calc.charges, netSalary: calc.netSalary,
    });
    created++;
  }

  logger.info({ month, created, skipped }, "Batch payroll complete");
  res.json({ success: true, month, created, skipped });
});

export default router;
