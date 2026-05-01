import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email"),
  company: text("company"),
  country: text("country"),
  industry: text("industry"),
  companySize: integer("company_size"), // number of employees
  website: text("website"),
  stage: text("stage").notNull().default("new"), // new | contacted | qualified | proposal | won | lost
  source: text("source"), // manual | kompass | web | referral
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const enrichedLeadsTable = pgTable("enriched_leads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  industry: text("industry"),
  companySize: integer("company_size"),
  website: text("website"),
  score: integer("score").notNull().default(0),
  scoreDetails: text("score_details"), // JSON string with per-criterion breakdown
  enrichedAt: timestamp("enriched_at").notNull().defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEnrichedLeadSchema = createInsertSchema(enrichedLeadsTable).omit({ id: true, enrichedAt: true });

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
export type EnrichedLead = typeof enrichedLeadsTable.$inferSelect;
