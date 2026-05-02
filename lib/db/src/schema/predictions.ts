import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lotsTable } from "./lots";

export const predictionsTable = pgTable("predictions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId: text("lot_id").references(() => lotsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // humidity | loss | price | risk
  date: timestamp("date").notNull(),
  value: real("value").notNull(),
  confidence: real("confidence").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  lotIdIdx: index("predictions_lot_id_idx").on(t.lotId),
  typeIdx: index("predictions_type_idx").on(t.type),
  dateIdx: index("predictions_date_idx").on(t.date),
}));

export const insertPredictionSchema = createInsertSchema(predictionsTable).omit({ id: true, createdAt: true });
export type Prediction = typeof predictionsTable.$inferSelect;
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
