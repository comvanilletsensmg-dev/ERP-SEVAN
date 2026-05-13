import { pgTable, text, real, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";
import { productsTable } from "./products";

export const lotsTable = pgTable("lots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  supplierId: text("supplier_id").notNull().references(() => suppliersTable.id),
  purchaseId: text("purchase_id"),
  productId: text("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  weightInitial: real("weight_initial").notNull(),
  weightCurrent: real("weight_current").notNull(),
  humidity: real("humidity").notNull(),
  grade: text("grade"),
  region: text("region"),
  warehouse: text("warehouse"),
  // Status: RAW | CURING | SORTING | READY | AVAILABLE | SHIPPED | PHENOLED | MOLDY | DOWNGRADED
  // Legacy lowercase still accepted: raw, curing, drying, ready, sold
  status: text("status").notNull().default("RAW"),
  // ── Qualité & traçabilité vanille
  productType:  text("product_type"),
  lengthCm:     real("length_cm"),
  quality:      text("quality"),
  origin:       text("origin"),
  preparation:  text("preparation"),
  vanillinRate: real("vanillin_rate"),
  riskScore: real("risk_score").notNull().default(0),
  riskLevel: text("risk_level").notNull().default("LOW"), // LOW | MEDIUM | HIGH
  isBlocked: boolean("is_blocked").notNull().default(false),
  blockedReason: text("blocked_reason"),
  lastRiskCheck: timestamp("last_risk_check"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  productIdIdx: index("lots_product_id_idx").on(t.productId),
}));

export const insertLotSchema = createInsertSchema(lotsTable).omit({ id: true, createdAt: true });
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Lot = typeof lotsTable.$inferSelect;
