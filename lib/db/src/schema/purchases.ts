import { pgTable, text, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const PURCHASE_TYPES = ["VANILLE", "CONSOMMABLE", "BUREAU", "INFORMATIQUE", "IMMOBILISATION", "SERVICE"] as const;
export type PurchaseType = (typeof PURCHASE_TYPES)[number];

export const PURCHASE_STATUSES = ["brouillon", "valide", "receptionne", "comptabilise"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const purchasesTable = pgTable("purchases", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplierId:    text("supplier_id").notNull().references(() => suppliersTable.id),
  // ── Type & catégorie
  type:          text("type").notNull().default("VANILLE"),
  category:      text("category"),
  description:   text("description"),
  reference:     text("reference"),
  // ── Montants
  currency:      text("currency").notNull().default("MGA"),
  amountHt:      real("amount_ht"),
  vatRate:       real("vat_rate").default(0),
  vatAmount:     real("vat_amount").default(0),
  amountTtc:     real("amount_ttc"),
  // ── Quantités
  quantity:      real("quantity"),
  unit:          text("unit").default("unité"),
  unitPrice:     real("unit_price"),
  // ── Vanille-specific (backward compat)
  weight:        real("weight").notNull().default(0),
  pricePerKg:    real("price_per_kg").notNull().default(0),
  totalAmount:   real("total_amount").notNull(),
  humidity:      real("humidity").notNull().default(0),
  // ── Logistique
  warehouse:     text("warehouse"),
  paymentMethod: text("payment_method").notNull().default("cash"),
  // ── Statut & workflow
  status:        text("status").notNull().default("valide"),
  purchaseDate:  date("purchase_date").defaultNow(),
  notes:         text("notes"),
  // ── Liens
  lotId:         text("lot_id"),
  fixedAssetId:  text("fixed_asset_id"),
  journalEntryId: text("journal_entry_id"),
  // ── Suppression soft
  deletedAt:     timestamp("deleted_at"),
  deletedBy:     text("deleted_by"),
  deleteReason:  text("delete_reason"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const purchaseReceptionsTable = pgTable("purchase_receptions", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  purchaseId:  text("purchase_id").notNull().references(() => purchasesTable.id, { onDelete: "cascade" }),
  quantity:    real("quantity").notNull(),
  notes:       text("notes"),
  receivedAt:  timestamp("received_at").notNull().defaultNow(),
  createdBy:   text("created_by"),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
export type PurchaseReception = typeof purchaseReceptionsTable.$inferSelect;
