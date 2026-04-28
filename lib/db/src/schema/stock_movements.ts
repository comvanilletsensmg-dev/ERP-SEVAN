import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lotsTable } from "./lots";

export const stockMovementsTable = pgTable("stock_movements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId: text("lot_id").notNull().references(() => lotsTable.id),
  type: text("type").notNull(), // IN | OUT | LOSS
  quantity: real("quantity").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStockMovementSchema = createInsertSchema(stockMovementsTable).omit({ id: true, createdAt: true });
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
