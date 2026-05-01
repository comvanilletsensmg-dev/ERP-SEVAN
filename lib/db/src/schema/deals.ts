import { pgTable, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dealsTable = pgTable("deals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  prospectId: text("prospect_id"),
  clientId: text("client_id"),
  stage: text("stage").notNull().default("prospect"), // prospect | contact | negotiation | proposal | won | lost
  value: real("value").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  probability: integer("probability").notNull().default(20), // 0-100
  expectedClose: timestamp("expected_close"),
  notes: text("notes"),
  assignedTo: text("assigned_to"), // userId
  autoConverted: boolean("auto_converted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDealSchema = createInsertSchema(dealsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
