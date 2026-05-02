import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lotsTable } from "./lots";

export const riskEventsTable = pgTable("risk_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
  riskLevel: text("risk_level").notNull(), // LOW | MEDIUM | HIGH
  score: real("score").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  lotIdIdx: index("risk_events_lot_id_idx").on(t.lotId),
  createdAtIdx: index("risk_events_created_at_idx").on(t.createdAt),
}));

export const insertRiskEventSchema = createInsertSchema(riskEventsTable).omit({ id: true, createdAt: true });
export type RiskEvent = typeof riskEventsTable.$inferSelect;
export type InsertRiskEvent = z.infer<typeof insertRiskEventSchema>;
