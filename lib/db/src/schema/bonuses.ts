import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { lotsTable } from "./lots";

export const bonusesTable = pgTable("bonuses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  employeeId: text("employee_id").notNull().references(() => employeesTable.id),
  lotId: text("lot_id").notNull().references(() => lotsTable.id),
  quantity: real("quantity").notNull(),
  rate: real("rate").notNull(), // MGA per kg
  amount: real("amount").notNull(), // quantity × rate
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBonusSchema = createInsertSchema(bonusesTable).omit({ id: true, createdAt: true, amount: true });
export type InsertBonus = z.infer<typeof insertBonusSchema>;
export type Bonus = typeof bonusesTable.$inferSelect;
