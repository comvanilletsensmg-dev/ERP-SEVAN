import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lotsTable } from "./lots";

export const lotCostsTable = pgTable("lot_costs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
  purchaseCost: real("purchase_cost").notNull().default(0),
  processCost: real("process_cost").notNull().default(0),
  transportCost: real("transport_cost").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
  costPerKg: real("cost_per_kg").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLotCostSchema = createInsertSchema(lotCostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLotCost = z.infer<typeof insertLotCostSchema>;
export type LotCost = typeof lotCostsTable.$inferSelect;
