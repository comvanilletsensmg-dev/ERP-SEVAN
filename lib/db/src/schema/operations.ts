import { pgTable, text, real, timestamp, date } from "drizzle-orm/pg-core";
import { lotsTable } from "./lots";

export const operationReportsTable = pgTable("operation_reports", {
  id:                  text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date:                date("date").notNull().unique(),
  employeeId:          text("employee_id"),
  quantityReceivedKg:  real("quantity_received_kg").default(0),
  quantityPreparedKg:  real("quantity_prepared_kg").default(0),
  notes:               text("notes"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").defaultNow(),
});

export const operationLotStatusesTable = pgTable("operation_lot_statuses", {
  id:         text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reportId:   text("report_id").notNull().references(() => operationReportsTable.id, { onDelete: "cascade" }),
  lotId:      text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
  status:     text("status").notNull(), // processing|phenole|moldy|ready|preparing
  quantityKg: real("quantity_kg").notNull().default(0),
});

export const consumablesTable = pgTable("consumables", {
  id:       text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:     text("name").notNull(),
  unit:     text("unit").notNull().default("unité"),
  stock:    real("stock").notNull().default(0),
  minStock: real("min_stock").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const consumableUsagesTable = pgTable("consumable_usages", {
  id:           text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reportId:     text("report_id").notNull().references(() => operationReportsTable.id, { onDelete: "cascade" }),
  consumableId: text("consumable_id").notNull().references(() => consumablesTable.id, { onDelete: "cascade" }),
  quantityUsed: real("quantity_used").notNull().default(0),
});

export type OperationReport      = typeof operationReportsTable.$inferSelect;
export type OperationLotStatus   = typeof operationLotStatusesTable.$inferSelect;
export type Consumable           = typeof consumablesTable.$inferSelect;
export type ConsumableUsage      = typeof consumableUsagesTable.$inferSelect;
