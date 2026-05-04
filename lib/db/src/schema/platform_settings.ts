import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const platformSettingsTable = pgTable("platform_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  settingKey: text("setting_key").unique().notNull(),
  settingValue: text("setting_value"),
  settingType: text("setting_type").notNull().default("text"),
  category: text("category").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
