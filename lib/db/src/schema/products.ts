import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reference: text("reference").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  subCategoryGousse: text("sub_category_gousse"),
  size: text("size"),
  subCategoryExtrait: text("sub_category_extrait"),
  subCategoryPate: text("sub_category_pate"),
  description: text("description"),
  aromaticProfile: text("aromatic_profile"),
  recommendedUsage: text("recommended_usage"),
  packaging: text("packaging"),
  moq: text("moq"),
  salesUnit: text("sales_unit"),
  availability: text("availability").notNull().default("Disponible"),
  purchasePriceKg: real("purchase_price_kg"),
  minFobPriceKg: real("min_fob_price_kg"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Product = typeof productsTable.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
