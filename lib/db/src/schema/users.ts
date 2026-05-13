import { pgTable, text, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name"),
  role: text("role").notNull().default("SUPER_ADMIN"),
  employeeId: text("employee_id"),
  department: text("department"),
  isActive: boolean("is_active").notNull().default(true),
  status: text("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedAt: timestamp("locked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loginHistoryTable = pgTable("login_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  success: boolean("success").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userPermissionsTable = pgTable("user_permissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  canView: boolean("can_view").notNull().default(true),
  canCreate: boolean("can_create").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
  canDelete: boolean("can_delete").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
}, (t) => [uniqueIndex("user_permissions_user_module_idx").on(t.userId, t.module)]);

export const rolePermissionsTable = pgTable("role_permissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  role: text("role").notNull(),
  module: text("module").notNull(),
  canView: boolean("can_view").notNull().default(false),
  canCreate: boolean("can_create").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
  canDelete: boolean("can_delete").notNull().default(false),
  canExport: boolean("can_export").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("role_permissions_role_module_idx").on(t.role, t.module)]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type LoginHistory = typeof loginHistoryTable.$inferSelect;
export type UserPermission = typeof userPermissionsTable.$inferSelect;
export type RolePermission = typeof rolePermissionsTable.$inferSelect;
