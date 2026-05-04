/**
 * Monthly payroll cron.
 * Runs on the 1st of each month (triggered from index.ts).
 * Generates payroll for all employees with statut='actif'.
 */
import { db, employeesTable, payrollTable, bonusesTable, attendanceTable } from "@workspace/db";
import { and, eq, gte, lt } from "drizzle-orm";
import { calculatePayroll } from "./payroll-calc";
import { logger } from "./logger";

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

export async function runMonthlyPayroll(month: string): Promise<{ month: string; created: number; skipped: number }> {
  const activeEmployees = await db.select().from(employeesTable).where(eq(employeesTable.statut, "actif"));
  const { start, end } = monthRange(month);
  let created = 0; let skipped = 0;

  for (const employee of activeEmployees) {
    const [existing] = await db.select({ id: payrollTable.id }).from(payrollTable)
      .where(and(eq(payrollTable.employeeId, employee.id), eq(payrollTable.month, month))).limit(1);
    if (existing) { skipped++; continue; }

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
    logger.info({ name: employee.name, month, net: calc.netSalary }, "Monthly payroll: generated");
  }

  return { month, created, skipped };
}
