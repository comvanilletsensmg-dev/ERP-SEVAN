import { pgTable, text, real, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Categories ───────────────────────────────────────────────────────────────
// OPERATION | BUREAU | INFORMATIQUE | CUISINE | IMMOBILISATION | MOBILIER | ENTRETIEN

// ─── Master catalog ───────────────────────────────────────────────────────────
export const stockItemsTable = pgTable("stock_items", {
  id:             text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reference:      text("reference").notNull(),
  name:           text("name").notNull(),
  category:       text("category").notNull().default("BUREAU"),
  // OPERATION | BUREAU | INFORMATIQUE | CUISINE | IMMOBILISATION | MOBILIER | ENTRETIEN
  description:    text("description"),
  unit:           text("unit").notNull().default("unité"),
  quantity:       real("quantity").notNull().default(0),
  minQuantity:    real("min_quantity").notNull().default(0),
  location:       text("location"),
  unitPrice:      real("unit_price").notNull().default(0),
  currency:       text("currency").notNull().default("MGA"),
  supplierId:     text("supplier_id"),
  serialNumber:   text("serial_number"),
  isImmobilization: boolean("is_immobilization").notNull().default(false),
  warrantyExpiry: timestamp("warranty_expiry"),
  status:         text("status").notNull().default("active"),
  // active | inactive | disposed
  notes:          text("notes"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
});

// ─── Stock movements ──────────────────────────────────────────────────────────
export const stockItemMovementsTable = pgTable("stock_item_movements", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId:      text("item_id").notNull().references(() => stockItemsTable.id, { onDelete: "cascade" }),
  type:        text("type").notNull(), // IN | OUT | ADJUSTMENT | LOSS
  quantity:    real("quantity").notNull(),
  reason:      text("reason"),
  referenceDoc: text("reference_doc"), // PO number, request id, etc.
  operationReportId: text("operation_report_id"), // link to ops report for auto-deduction
  performedBy: text("performed_by"), // userId
  date:        timestamp("date").notNull().defaultNow(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// ─── Equipment assignments ────────────────────────────────────────────────────
export const equipmentAssignmentsTable = pgTable("equipment_assignments", {
  id:           text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId:       text("item_id").notNull().references(() => stockItemsTable.id, { onDelete: "cascade" }),
  employeeId:   text("employee_id").notNull(),
  employeeName: text("employee_name").notNull(),
  department:   text("department"),
  assignedAt:   timestamp("assigned_at").notNull().defaultNow(),
  returnedAt:   timestamp("returned_at"),
  state:        text("state").notNull().default("good"), // good | damaged | lost
  notes:        text("notes"),
  assignedBy:   text("assigned_by"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

// ─── Internal requests ────────────────────────────────────────────────────────
export const internalRequestsTable = pgTable("internal_requests", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId:        text("item_id").references(() => stockItemsTable.id, { onDelete: "set null" }),
  itemName:      text("item_name").notNull(), // fallback if itemId is null
  quantity:      real("quantity").notNull().default(1),
  requesterId:   text("requester_id").notNull(),
  requesterName: text("requester_name").notNull(),
  department:    text("department"),
  reason:        text("reason"),
  urgency:       text("urgency").notNull().default("normal"), // low | normal | high | urgent
  status:        text("status").notNull().default("pending"),
  // pending | approved | rejected | delivered
  validatedBy:   text("validated_by"),
  validatedAt:   timestamp("validated_at"),
  deliveredAt:   timestamp("delivered_at"),
  rejectionReason: text("rejection_reason"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
});

// ─── Equipment maintenance ────────────────────────────────────────────────────
export const equipmentMaintenanceTable = pgTable("equipment_maintenance", {
  id:             text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemId:         text("item_id").notNull().references(() => stockItemsTable.id, { onDelete: "cascade" }),
  type:           text("type").notNull().default("preventive"),
  // preventive | corrective | calibration | warranty_claim
  description:    text("description"),
  scheduledAt:    timestamp("scheduled_at"),
  doneAt:         timestamp("done_at"),
  provider:       text("provider"),
  cost:           real("cost").default(0),
  currency:       text("currency").default("MGA"),
  warrantyExpiry: timestamp("warranty_expiry"),
  state:          text("state").notNull().default("planned"),
  // planned | in_progress | done | cancelled
  notes:          text("notes"),
  nextDueAt:      timestamp("next_due_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

// ─── Insert schemas & types ───────────────────────────────────────────────────
export const insertStockItemSchema = createInsertSchema(stockItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStockItemMovementSchema = createInsertSchema(stockItemMovementsTable).omit({ id: true, createdAt: true });
export const insertEquipmentAssignmentSchema = createInsertSchema(equipmentAssignmentsTable).omit({ id: true, createdAt: true });
export const insertInternalRequestSchema = createInsertSchema(internalRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEquipmentMaintenanceSchema = createInsertSchema(equipmentMaintenanceTable).omit({ id: true, createdAt: true });

export type StockItem              = typeof stockItemsTable.$inferSelect;
export type StockItemMovement      = typeof stockItemMovementsTable.$inferSelect;
export type EquipmentAssignment    = typeof equipmentAssignmentsTable.$inferSelect;
export type InternalRequest        = typeof internalRequestsTable.$inferSelect;
export type EquipmentMaintenance   = typeof equipmentMaintenanceTable.$inferSelect;

export type InsertStockItem            = z.infer<typeof insertStockItemSchema>;
export type InsertStockItemMovement    = z.infer<typeof insertStockItemMovementSchema>;
export type InsertEquipmentAssignment  = z.infer<typeof insertEquipmentAssignmentSchema>;
export type InsertInternalRequest      = z.infer<typeof insertInternalRequestSchema>;
export type InsertEquipmentMaintenance = z.infer<typeof insertEquipmentMaintenanceSchema>;
