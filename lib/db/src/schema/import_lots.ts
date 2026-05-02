import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const importBatchesTable = pgTable("import_batches", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  ignoredCount: integer("ignored_count").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const importErrorsTable = pgTable("import_errors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  batchId: text("batch_id").notNull(),
  rowNumber: integer("row_number").notNull(),
  rowData: jsonb("row_data").notNull().default({}),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertImportBatchSchema = createInsertSchema(importBatchesTable).omit({ id: true, createdAt: true });
export const insertImportErrorSchema = createInsertSchema(importErrorsTable).omit({ id: true, createdAt: true });
export type ImportBatch = typeof importBatchesTable.$inferSelect;
export type ImportError = typeof importErrorsTable.$inferSelect;
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type InsertImportError = z.infer<typeof insertImportErrorSchema>;
