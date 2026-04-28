import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { lotsTable } from "./lots";

export const salesTable = pgTable("sales", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  clientId: text("client_id").notNull().references(() => clientsTable.id),
  totalAmount: real("total_amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  incoterm: text("incoterm").notNull().default("FOB"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const saleItemsTable = pgTable("sale_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  saleId: text("sale_id").notNull().references(() => salesTable.id),
  lotId: text("lot_id").notNull().references(() => lotsTable.id),
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
export const insertSaleItemSchema = createInsertSchema(saleItemsTable).omit({ id: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type Sale = typeof salesTable.$inferSelect;
export type SaleItem = typeof saleItemsTable.$inferSelect;
