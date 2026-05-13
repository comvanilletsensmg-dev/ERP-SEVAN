import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const suppliersTable = pgTable("suppliers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  region: text("region").notNull().default(""),
  phone: text("phone"),
  score: integer("score").notNull().default(80),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  supplierType: text("supplier_type").notNull().default("GOODS"),
  category: text("category"),
  status: text("status").notNull().default("active"),
  supplierCode: text("supplier_code"),
  email: text("email"),
  website: text("website"),
  mobile: text("mobile"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  city: text("city"),
  country: text("country").default("Madagascar"),
  nif: text("nif"),
  stat: text("stat"),
  rccm: text("rccm"),
  isVatSubject: boolean("is_vat_subject").default(false),
  paymentMethod: text("payment_method").default("Virement bancaire"),
  paymentTerms: text("payment_terms").default("30"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  assignedEmployeeId: text("assigned_employee_id"),
  notesJson: text("notes_json").default("[]"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;
