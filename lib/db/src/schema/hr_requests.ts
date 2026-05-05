import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const hrRequestsTable = pgTable("hr_requests", {
  id:             text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reference:      text("reference"),
  employeeId:     text("employee_id").notNull().references(() => employeesTable.id),
  type:           text("type").notNull(), // leave | advance | attestation | mission | issue
  description:    text("description").notNull().default(""),
  reason:         text("reason"),
  startDate:      timestamp("start_date"),
  endDate:        timestamp("end_date"),
  amount:         numeric("amount", { precision: 12, scale: 2 }),
  status:         text("status").notNull().default("pending"), // draft|pending|manager_approved|hr_approved|rejected
  managerId:      text("manager_id"),
  hrId:           text("hr_id"),
  managerComment: text("manager_comment"),
  hrComment:      text("hr_comment"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

export const hrRequestLogsTable = pgTable("hr_request_logs", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  requestId: text("request_id").notNull().references(() => hrRequestsTable.id, { onDelete: "cascade" }),
  action:    text("action").notNull(),
  userId:    text("user_id").notNull(),
  userName:  text("user_name"),
  comment:   text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type HrRequest    = typeof hrRequestsTable.$inferSelect;
export type HrRequestLog = typeof hrRequestLogsTable.$inferSelect;
