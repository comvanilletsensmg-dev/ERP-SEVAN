import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversionAlertsTable = pgTable("conversion_alerts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  prospectId: text("prospect_id").notNull(),
  triggerType: text("trigger_type").notNull().default("deal"), // 'deal' | 'quote' | 'manual'
  triggerId: text("trigger_id"),
  status: text("status").notNull().default("pending"), // 'pending' | 'converted' | 'dismissed' | 'escalated'
  score: integer("score").notNull().default(0),
  prospectName: text("prospect_name").notNull(),
  reason: text("reason"),
  resolvedClientId: text("resolved_client_id"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConversionAlertSchema = createInsertSchema(conversionAlertsTable).omit({ id: true, createdAt: true });
export type ConversionAlert = typeof conversionAlertsTable.$inferSelect;
export type InsertConversionAlert = z.infer<typeof insertConversionAlertSchema>;
