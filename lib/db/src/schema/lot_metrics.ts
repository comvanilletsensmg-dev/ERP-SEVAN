import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lotsTable } from "./lots";

export const lotMetricsTable = pgTable("lot_metrics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull().defaultNow(),
  humidity: real("humidity").notNull(),
  weight: real("weight").notNull(),
  temp: real("temp"),
  storage: text("storage"),
}, (t) => ({
  lotIdIdx: index("lot_metrics_lot_id_idx").on(t.lotId),
  dateIdx: index("lot_metrics_date_idx").on(t.date),
}));

export const insertLotMetricsSchema = createInsertSchema(lotMetricsTable).omit({ id: true });
export type LotMetric = typeof lotMetricsTable.$inferSelect;
export type InsertLotMetric = z.infer<typeof insertLotMetricsSchema>;
