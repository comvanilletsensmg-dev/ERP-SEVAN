import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const productAdjustmentsTable = pgTable("product_adjustments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // IN | OUT | ADJUSTMENT
  quantity: real("quantity").notNull(),
  reason: text("reason"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  productIdIdx: index("product_adjustments_product_id_idx").on(t.productId),
  createdAtIdx: index("product_adjustments_created_at_idx").on(t.createdAt),
}));

export const insertProductAdjustmentSchema = createInsertSchema(productAdjustmentsTable).omit({ id: true, createdAt: true });
export type ProductAdjustment = typeof productAdjustmentsTable.$inferSelect;
export type InsertProductAdjustment = z.infer<typeof insertProductAdjustmentSchema>;
