import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const accountingInvoicesTable = pgTable("accounting_invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceNumber: text("invoice_number").notNull(),
  partnerId: text("partner_id").notNull().references(() => partnersTable.id),
  type: text("type").notNull(), // sale | purchase
  currency: text("currency").notNull().default("MGA"),
  amountHT: real("amount_ht").notNull(),
  tvaRate: real("tva_rate").notNull().default(20),
  tvaMontant: real("tva_montant").notNull(),
  amountTTC: real("amount_ttc").notNull(),
  status: text("status").notNull().default("draft"), // draft | validated | paid
  dueDate: timestamp("due_date"),
  fileUrl: text("file_url"),
  notes: text("notes"),
  journalEntryId: text("journal_entry_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountingInvoiceSchema = createInsertSchema(accountingInvoicesTable).omit({ id: true, createdAt: true });
export type InsertAccountingInvoice = z.infer<typeof insertAccountingInvoiceSchema>;
export type AccountingInvoice = typeof accountingInvoicesTable.$inferSelect;
