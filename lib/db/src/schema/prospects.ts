import { pgTable, text, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prospectsTable = pgTable("prospects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // === IDENTITÉ ENTREPRISE ===
  company: text("company").notNull(), // companyName
  altName: text("alt_name"),
  type: text("type").notNull().default("Entreprise"), // Entreprise | Particulier | Association | Administration
  clientCode: text("client_code"),

  // === ADRESSE ===
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country").notNull(),
  region: text("region"),

  // === CONTACT ===
  contact: text("contact"), // nom du contact principal
  phone: text("phone"),
  mobile: text("mobile"),
  fax: text("fax"),
  website: text("website"),
  email: text("email"),
  refuseMassEmail: boolean("refuse_mass_email").notNull().default(false),

  // === IDENTIFIANTS FISCAUX ===
  proId1: text("pro_id1"),
  proId2: text("pro_id2"),
  vatRegistered: boolean("vat_registered").notNull().default(false),
  vatNumber: text("vat_number"),

  // === CATÉGORISATION (JSON arrays stored as text) ===
  tags: text("tags").notNull().default("[]"), // JSON array of strings
  internalNotes: text("internal_notes"),

  // === QUALIFICATION COMMERCIALE ===
  source: text("source").notNull().default("manuel"),
  status: text("status").notNull().default("new"), // new | to_contact | contacted | qualified | converted | lost
  score: integer("score").notNull().default(0),
  assignedTo: text("assigned_to"),
  createdBy: text("created_by"),

  // === DONNÉES MÉTIER VANILLE ===
  activityType: text("activity_type"), // importateur | distributeur | transformateur | industriel | artisan | autre
  estimatedVolume: real("estimated_volume"), // tonnes/an
  currentSupplier: text("current_supplier"),
  productsSought: text("products_sought").notNull().default("[]"), // JSON array
  decisionTimeline: text("decision_timeline"), // immediat | 1_3_mois | 3_6_mois | 6_12_mois | inconnu
  budgetRange: text("budget_range"), // moins_50 | 50_100 | 100_200 | plus_200

  // === SPÉCIFICATIONS ACHAT ===
  preferredCurrency: text("preferred_currency").default("USD"),
  preferredIncoterm: text("preferred_incoterm"),
  paymentTerms: text("payment_terms"),
  certifications: text("certifications").notNull().default("[]"), // JSON array

  // === TRACKING ===
  notes: text("notes"), // alias for internalNotes (kept for compat)
  lastInteraction: timestamp("last_interaction"),
  convertedToClientId: text("converted_to_client_id"),
  convertedAt: timestamp("converted_at"),
  convertedBy: text("converted_by"),
  conversionSource: text("conversion_source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;
