import { pgTable, text, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bankTransactionsTable = pgTable("bank_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(), // positive = credit, negative = debit
  currency: text("currency").notNull().default("MGA"),
  reference: text("reference"),
  matched: boolean("matched").notNull().default(false),
  matchedRef: text("matched_ref"), // invoice id or payment id matched to
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBankTransactionSchema = createInsertSchema(bankTransactionsTable).omit({ id: true, createdAt: true });
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;
