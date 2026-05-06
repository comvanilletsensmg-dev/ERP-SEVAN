import { pgTable, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id:   text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
});

export const journalEntriesTable = pgTable("journal_entries", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date:        timestamp("date").notNull().defaultNow(),
  reference:   text("reference").notNull(),
  description: text("description"),
  status:      text("status").notNull().default("draft"), // draft | validated | locked
});

export const journalLinesTable = pgTable("journal_lines", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryId:   text("entry_id").notNull().references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accountsTable.id),
  debit:     real("debit").notNull().default(0),
  credit:    real("credit").notNull().default(0),
  label:     text("label"), // optional per-line label
});

export const journalAuditLogsTable = pgTable("journal_audit_logs", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryId:   text("entry_id").notNull().references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  action:    text("action").notNull(), // created | updated | validated | locked | deleted
  changes:   jsonb("changes"),
  userEmail: text("user_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountSchema       = createInsertSchema(accountsTable).omit({ id: true });
export const insertJournalEntrySchema  = createInsertSchema(journalEntriesTable).omit({ id: true });
export const insertJournalLineSchema   = createInsertSchema(journalLinesTable).omit({ id: true });

export type InsertAccount      = z.infer<typeof insertAccountSchema>;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type InsertJournalLine  = z.infer<typeof insertJournalLineSchema>;
export type Account            = typeof accountsTable.$inferSelect;
export type JournalEntry       = typeof journalEntriesTable.$inferSelect;
export type JournalLine        = typeof journalLinesTable.$inferSelect;
export type JournalAuditLog    = typeof journalAuditLogsTable.$inferSelect;
