import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  weekStartsOn: integer("week_starts_on").notNull().default(0),
  createdAt: text("created_at").notNull()
});

export const householdMembers = sqliteTable("household_members", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  displayName: text("display_name").notNull(),
  kind: text("kind", { enum: ["CHILD", "ADULT", "OTHER"] }).notNull(),
  canAdminister: integer("can_administer", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull()
});

export const choreDefinitions = sqliteTable("chore_definitions", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  title: text("title").notNull(),
  description: text("description"),
  kind: text("kind", { enum: ["INDIVIDUAL", "HOUSEHOLD"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull()
});

export const weeklyPlans = sqliteTable("weekly_plans", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  weekStartDate: text("week_start_date").notNull(),
  revision: integer("revision").notNull().default(0),
  generatedAt: text("generated_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [uniqueIndex("weekly_plan_household_week").on(table.householdId, table.weekStartDate)]);
