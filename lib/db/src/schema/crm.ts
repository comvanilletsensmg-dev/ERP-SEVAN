import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailTemplatesTable = pgTable("email_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("general"), // welcome | followup | reminder | proposal
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const emailLogsTable = pgTable("email_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  templateId: text("template_id"),
  leadId: text("lead_id"),
  status: text("status").notNull().default("sent"), // sent | failed | simulated
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const remindersTable = pgTable("reminders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  clientEmail: text("client_email").notNull(),
  clientName: text("client_name"),
  invoiceRef: text("invoice_ref"),
  type: text("type").notNull().default("payment"), // payment | followup | proposal
  dueDate: timestamp("due_date").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | cancelled
  sentAt: timestamp("sent_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmailLogSchema = createInsertSchema(emailLogsTable).omit({ id: true, createdAt: true });
export const insertReminderSchema = createInsertSchema(remindersTable).omit({ id: true, createdAt: true });

export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
export type EmailLog = typeof emailLogsTable.$inferSelect;
export type Reminder = typeof remindersTable.$inferSelect;
