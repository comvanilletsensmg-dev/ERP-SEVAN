import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const purchasesTable = pgTable("purchases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplierId: text("supplier_id").notNull().references(() => suppliersTable.id),
  totalAmount: real("total_amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
