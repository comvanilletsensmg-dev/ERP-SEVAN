import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversionLogsTable = pgTable("conversion_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  prospectId: text("prospect_id").notNull(),
  clientId: text("client_id").notNull(),
  source: text("source").notNull().default("manual"), // manual | quote_accepted | order_created | deal_created
  triggeredBy: text("triggered_by"),
  triggeredByQuoteId: text("triggered_by_quote_id"),
  triggeredByDealId: text("triggered_by_deal_id"),
  dataMigrated: jsonb("data_migrated").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConversionLogSchema = createInsertSchema(conversionLogsTable).omit({ id: true, createdAt: true });
export type ConversionLog = typeof conversionLogsTable.$inferSelect;
export type InsertConversionLog = z.infer<typeof insertConversionLogSchema>;
