import { pgTable, text, real, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const leavesTable = pgTable("leaves", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  type: text("type").notNull(), // annual | sick | unpaid
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  days: real("days").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reason: text("reason"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leaveBalancesTable = pgTable("leave_balances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  year: integer("year").notNull(),
  annualDays: real("annual_days").notNull().default(0),
  usedAnnualDays: real("used_annual_days").notNull().default(0),
  sickDays: real("sick_days").notNull().default(15),
  usedSickDays: real("used_sick_days").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("leave_balances_emp_year").on(t.employeeId, t.year)]);

export const insertLeaveSchema = createInsertSchema(leavesTable).omit({ id: true, createdAt: true, status: true, days: true });
export type InsertLeave = z.infer<typeof insertLeaveSchema>;
export type Leave = typeof leavesTable.$inferSelect;
export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;
