import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountingInvoicesTable } from "./invoices";

export const invoicePaymentsTable = pgTable("invoice_payments", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceId: text("invoice_id").notNull().references(() => accountingInvoicesTable.id, { onDelete: "cascade" }),
  amount:    real("amount").notNull(),
  method:    text("method").notNull(),    // cash | mvola | orange_money | bni | boa | bfv | acces
  provider:  text("provider"),            // human-readable: Mvola, BNI Madagascar, etc.
  reference: text("reference"),           // mobile money ref / bank wire ref
  proofUrl:  text("proof_url"),           // uploaded receipt image
  notes:     text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoicePaymentSchema = createInsertSchema(invoicePaymentsTable).omit({ id: true, createdAt: true });
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;
export type InvoicePayment = typeof invoicePaymentsTable.$inferSelect;
