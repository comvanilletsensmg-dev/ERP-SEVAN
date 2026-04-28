import { pgTable, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fixedAssetsTable = pgTable("fixed_assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  category: text("category").notNull().default("equipment"), // equipment | vehicle | building | other
  value: real("value").notNull(), // valeur d'acquisition
  residualValue: real("residual_value").notNull().default(0),
  accumulatedDepreciation: real("accumulated_depreciation").notNull().default(0),
  startDate: timestamp("start_date").notNull(),
  durationMonths: integer("duration_months").notNull(),
  currency: text("currency").notNull().default("MGA"),
  notes: text("notes"),
  status: text("status").notNull().default("active"), // active | fully_depreciated | disposed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFixedAssetSchema = createInsertSchema(fixedAssetsTable).omit({ id: true, createdAt: true, accumulatedDepreciation: true });
export type InsertFixedAsset = z.infer<typeof insertFixedAssetSchema>;
export type FixedAsset = typeof fixedAssetsTable.$inferSelect;
