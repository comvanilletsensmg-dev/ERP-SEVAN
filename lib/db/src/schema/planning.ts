import { pgTable, text, real, integer, timestamp, index } from "drizzle-orm/pg-core";
import { lotsTable } from "./lots";
import { employeesTable } from "./employees";

// ── Production Tasks ──────────────────────────────────────────────────────────
export const productionTasksTable = pgTable("production_tasks", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId:         text("lot_id").references(() => lotsTable.id, { onDelete: "cascade" }),
  type:          text("type").notNull(),          // drying | sorting | packaging | preparation | curing
  status:        text("status").notNull().default("pending"), // pending | in_progress | completed | cancelled
  startDate:     timestamp("start_date").notNull(),
  endDate:       timestamp("end_date").notNull(),
  requiredStaff: integer("required_staff").notNull().default(1),
  notes:         text("notes"),
  autoCreated:   text("auto_created").default("no"), // yes | no
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  lotIdIdx: index("pt_lot_id_idx").on(t.lotId),
  statusIdx: index("pt_status_idx").on(t.status),
}));

export type ProductionTask = typeof productionTasksTable.$inferSelect;

// ── Export Orders ─────────────────────────────────────────────────────────────
export const exportOrdersTable = pgTable("export_orders", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reference:   text("reference").notNull().unique(),
  clientName:  text("client_name").notNull(),
  clientId:    text("client_id"),               // optional FK to CRM clients
  quantityKg:  real("quantity_kg").notNull(),
  status:      text("status").notNull().default("pending"), // pending | preparing | ready | shipped | cancelled
  priority:    integer("priority").notNull().default(2),    // 1=urgent 2=normal 3=low
  deadline:    timestamp("deadline").notNull(),
  lotId:       text("lot_id").references(() => lotsTable.id, { onDelete: "set null" }),
  destination: text("destination"),
  notes:       text("notes"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  statusIdx:   index("eo_status_idx").on(t.status),
  deadlineIdx: index("eo_deadline_idx").on(t.deadline),
}));

export type ExportOrder = typeof exportOrdersTable.$inferSelect;

// ── Task Assignments ──────────────────────────────────────────────────────────
export const taskAssignmentsTable = pgTable("task_assignments", {
  id:         text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId:     text("task_id").notNull().references(() => productionTasksTable.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (t) => ({
  taskIdx: index("ta_task_id_idx").on(t.taskId),
}));

export type TaskAssignment = typeof taskAssignmentsTable.$inferSelect;
