import { pgTable, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Identité
  name: text("name").notNull(),
  altName: text("alt_name"),
  type: text("type").notNull().default("Entreprise"),
  clientCode: text("client_code"),

  // Adresse
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country").notNull(),
  region: text("region"),

  // Contact
  phone: text("phone"),
  mobile: text("mobile"),
  fax: text("fax"),
  website: text("website"),
  email: text("email"),
  refuseMassEmail: boolean("refuse_mass_email").notNull().default(false),

  // Identifiants fiscaux
  proId1: text("pro_id1"),
  proId2: text("pro_id2"),
  vatRegistered: boolean("vat_registered").notNull().default(false),
  vatNumber: text("vat_number"),

  // Origine
  source: text("source").notNull().default("other"),
  convertedFromId: text("converted_from_id"),

  // Catégorisation
  tags: text("tags").notNull().default("[]"),
  internalNotes: text("internal_notes"),
  notes: text("notes"),

  // Commercial
  activityType: text("activity_type"),
  riskLevel: text("risk_level").notNull().default("medium"),
  creditLimit: real("credit_limit"),
  paymentTerms: integer("payment_terms").notNull().default(30),
  currency: text("currency").notNull().default("USD"),
  preferredIncoterm: text("preferred_incoterm"),

  // Statistiques (calculées)
  totalOrders: integer("total_orders").notNull().default(0),
  totalRevenue: real("total_revenue").notNull().default(0),
  lastOrderDate: timestamp("last_order_date"),
  averageOrderValue: real("average_order_value").notNull().default(0),

  // Statut & meta
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const clientContactsTable = pgTable("client_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  clientId: text("client_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClientContactSchema = createInsertSchema(clientContactsTable).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type InsertClientContact = z.infer<typeof insertClientContactSchema>;
export type Client = typeof clientsTable.$inferSelect;
export type ClientContact = typeof clientContactsTable.$inferSelect;
