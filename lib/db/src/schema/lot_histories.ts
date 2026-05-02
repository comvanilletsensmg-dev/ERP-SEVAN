import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lotsTable } from "./lots";

export const lotHistoriesTable = pgTable("lot_histories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  humidity: real("humidity").notNull(),
  weight: real("weight").notNull(),
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  lotIdIdx: index("lot_histories_lot_id_idx").on(t.lotId),
  createdAtIdx: index("lot_histories_created_at_idx").on(t.createdAt),
}));

export const insertLotHistorySchema = createInsertSchema(lotHistoriesTable).omit({ id: true, createdAt: true });
export type LotHistory = typeof lotHistoriesTable.$inferSelect;
export type InsertLotHistory = z.infer<typeof insertLotHistorySchema>;
