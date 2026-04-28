import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const hrRequestsTable = pgTable("hr_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  type: text("type").notNull(), // leave | advance | issue
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHrRequestSchema = createInsertSchema(hrRequestsTable).omit({ id: true, createdAt: true, status: true });
export type InsertHrRequest = z.infer<typeof insertHrRequestSchema>;
export type HrRequest = typeof hrRequestsTable.$inferSelect;
