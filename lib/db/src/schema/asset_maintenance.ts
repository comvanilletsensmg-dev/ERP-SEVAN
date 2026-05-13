import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetMaintenanceTable = pgTable("asset_maintenance", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetId: text("asset_id").notNull(),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  cost: real("cost").notNull().default(0),
  type: text("type").notNull().default("preventive"), // preventive | corrective | inspection
  technician: text("technician"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssetMaintenanceSchema = createInsertSchema(assetMaintenanceTable).omit({ id: true, createdAt: true });
export type InsertAssetMaintenance = z.infer<typeof insertAssetMaintenanceSchema>;
export type AssetMaintenance = typeof assetMaintenanceTable.$inferSelect;
