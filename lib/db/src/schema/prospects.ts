import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prospectsTable = pgTable("prospects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  company: text("company").notNull(),
  contact: text("contact"),
  email: text("email"),
  phone: text("phone"),
  country: text("country").notNull(),
  source: text("source").notNull().default("manuel"), // Kompass | manuel | web | referral
  status: text("status").notNull().default("to_contact"), // new | to_contact | contacted | qualified | converted
  score: integer("score").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;
