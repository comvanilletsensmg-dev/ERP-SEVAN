import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const lotsTable = pgTable("lots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  supplierId: text("supplier_id").notNull().references(() => suppliersTable.id),
  weightInitial: real("weight_initial").notNull(),
  weightCurrent: real("weight_current").notNull(),
  humidity: real("humidity").notNull(),
  grade: text("grade").notNull(),
  status: text("status").notNull().default("curing"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLotSchema = createInsertSchema(lotsTable).omit({ id: true, createdAt: true });
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Lot = typeof lotsTable.$inferSelect;
