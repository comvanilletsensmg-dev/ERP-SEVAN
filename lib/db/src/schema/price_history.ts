import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const priceHistoryTable = pgTable("price_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: timestamp("date").notNull(),
  price: real("price").notNull(),
  market: text("market").notNull().default("export"), // 'local' | 'export'
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pricePredictionsTable = pgTable("price_predictions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: timestamp("date").notNull(),
  predicted: real("predicted").notNull(),
  movingAvg: real("moving_avg").notNull(),
  trend: real("trend").notNull(),
  confidence: text("confidence").notNull().default("medium"), // 'high' | 'medium' | 'low'
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const insertPriceHistorySchema = createInsertSchema(priceHistoryTable).omit({ id: true, createdAt: true });
export const insertPricePredictionSchema = createInsertSchema(pricePredictionsTable).omit({ id: true, generatedAt: true });

export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type PriceHistory = typeof priceHistoryTable.$inferSelect;
export type PricePrediction = typeof pricePredictionsTable.$inferSelect;
