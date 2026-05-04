import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const departmentsTable = pgTable("departments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Department = typeof departmentsTable.$inferSelect;
