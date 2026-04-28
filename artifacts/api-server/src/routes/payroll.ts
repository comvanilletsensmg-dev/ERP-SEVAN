import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sum } from "drizzle-orm";
import { db, employeesTable, payrollTable, bonusesTable, attendanceTable } from "@workspace/db";
import { GeneratePayrollBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

function formatPayroll(p: typeof payrollTable.$inferSelect, employee?: typeof employeesTable.$inferSelect | null) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    employee: employee ? { ...employee, createdAt: employee.createdAt.toISOString(), hireDate: employee.hireDate?.toISOString() ?? null } : undefined,
  };
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

router.post("/payroll", requireAuth, async (req, res): Promise<void> => {
  const parsed = GeneratePayrollBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { employeeId, month } = parsed.data;

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  // Check if payroll already generated for this month
  const existing = await db
    .select()
    .from(payrollTable)
    .where(and(eq(payrollTable.employeeId, employeeId), eq(payrollTable.month, month)));
  if (existing.length > 0) {
    res.status(400).json({ error: `Paie déjà générée pour ${employee.name} en ${month}` });
    return;
  }

  const salaryBase = employee.salary ?? 0;
  const { start, end } = monthRange(month);

  // Count check-ins this month
  const attendanceRows = await db
    .select()
    .from(attendanceTable)
    .where(and(eq(attendanceTable.employeeId, employeeId), gte(attendanceTable.date, start), lt(attendanceTable.date, end)));

  const workedDays = attendanceRows.length;
  const businessDays = 26; // standard Madagascar working days
  const absentDays = Math.max(0, businessDays - workedDays);
  const dailyRate = salaryBase / businessDays;
  const absenceDeduction = absentDays * dailyRate;

  // Bonuses this month
  const bonusRows = await db
    .select()
    .from(bonusesTable)
    .where(and(eq(bonusesTable.employeeId, employeeId), gte(bonusesTable.createdAt, start), lt(bonusesTable.createdAt, end)));
  const bonusTotal = bonusRows.reduce((acc, b) => acc + b.amount, 0);

  // Charges sociales Madagascar (CNAPS 1% + OSTIE 1%)
  const charges = salaryBase * 0.02;

  const deductions = absenceDeduction;
  const netSalary = Math.max(0, salaryBase + bonusTotal - deductions - charges);

  const [payroll] = await db
    .insert(payrollTable)
    .values({
      employeeId,
      month,
      salaryBase,
      bonus: bonusTotal,
      deductions,
      charges,
      netSalary,
    })
    .returning();

  console.log(
    `[PAIE] ${employee.name} — ${month}: base=${salaryBase.toLocaleString()} + bonus=${bonusTotal.toLocaleString()} - déductions=${deductions.toFixed(0)} - charges=${charges.toFixed(0)} = net=${netSalary.toFixed(0)} MGA`
  );

  res.status(201).json(formatPayroll(payroll, employee));
});

export default router;
