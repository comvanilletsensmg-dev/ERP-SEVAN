import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const payrollTable = pgTable("payroll", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  month: text("month").notNull(),
  salaryBase: real("salary_base").notNull(),
  bonus: real("bonus").notNull().default(0),
  heuresSup: real("heures_sup").notNull().default(0),
  deductions: real("deductions").notNull().default(0),
  cnapsEmp: real("cnaps_emp").notNull().default(0),
  ostieEmp: real("ostie_emp").notNull().default(0),
  irsa: real("irsa").notNull().default(0),
  charges: real("charges").notNull().default(0),
  netSalary: real("net_salary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPayrollSchema = createInsertSchema(payrollTable).omit({ id: true, createdAt: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payrollTable.$inferSelect;
