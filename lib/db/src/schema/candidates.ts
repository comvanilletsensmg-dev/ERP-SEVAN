import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const candidatesTable = pgTable("candidates", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName:   text("first_name"),
  lastName:    text("last_name"),
  name:        text("name").notNull(),
  position:    text("position").notNull(),
  email:       text("email"),
  phone:       text("phone"),
  skills:      text("skills").default("[]"),
  experience:  text("experience"),
  education:   text("education"),
  cvUrl:       text("cv_url"),
  score:       integer("score").default(0),
  source:      text("source"),
  status:      text("status").notNull().default("applied"),
  notes:       text("notes"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});

export type Candidate = typeof candidatesTable.$inferSelect;
export type InsertCandidate = typeof candidatesTable.$inferInsert;
