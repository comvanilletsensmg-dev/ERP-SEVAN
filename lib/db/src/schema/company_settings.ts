import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const companySettingsTable = pgTable("company_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  companyName: text("company_name").notNull(),
  logoUrl: text("logo_url"),

  email: text("email"),
  phone: text("phone"),

  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country").notNull().default("Madagascar"),

  taxId: text("tax_id"),
  statNumber: text("stat_number"),
  rcsNumber: text("rcs_number"),

  currency: text("currency").notNull().default("MGA"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
