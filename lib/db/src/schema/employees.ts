import { pgTable, text, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employeesTable = pgTable("employees", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  matricule: text("matricule").unique(),
  name: text("name").notNull(),
  nom: text("nom"),
  prenom: text("prenom"),
  sexe: text("sexe"),
  dateNaissance: timestamp("date_naissance"),
  email: text("email"),
  position: text("position").notNull(),
  department: text("department"),
  departmentId: text("department_id"),
  salary: real("salary"),
  hireDate: timestamp("hire_date"),
  typeContrat: text("type_contrat").default("CDI"),
  cnapsNumber: text("cnaps_number"),
  ostieNumber: text("ostie_number"),
  statut: text("statut").notNull().default("actif"),
  isActive: boolean("is_active").notNull().default(true),
  phone: text("phone"),
  hasAccount: boolean("has_account").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
