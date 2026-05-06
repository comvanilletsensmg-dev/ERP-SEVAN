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
  matchedRef: text("matched_ref"),
  // Enhanced reconciliation
  status: text("status").notNull().default("unmatched"), // unmatched | suggested | matched
  invoiceId: text("invoice_id"),
  partnerId: text("partner_id"),
  journalEntryId: text("journal_entry_id"),
  matchScore: real("match_score"),
  gapAmount: real("gap_amount"),
  gapJournalEntryId: text("gap_journal_entry_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBankTransactionSchema = createInsertSchema(bankTransactionsTable).omit({ id: true, createdAt: true });
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;
