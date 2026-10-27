import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const entries = sqliteTable("entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  plannerName: text("planner_name").notNull(),
  title: text("title").notNull(),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date").notNull(),
  city: text("city").notNull(),
  guestCount: integer("guest_count").notNull(),
  budgetMinInr: integer("budget_min_inr").notNull(),
  budgetMaxInr: integer("budget_max_inr").notNull(),
  venuePref: text("venue_pref").notNull(),
  needsParking: integer("needs_parking").notNull(),
  expectedCars: integer("expected_cars").notNull().default(0),
  areaPreference: text("area_preference"),
  foodType: text("food_type").notNull(),
  vegPercent: integer("veg_percent").notNull().default(100),
  desserts: integer("desserts").notNull(),
  fruits: integer("fruits").notNull(),
  dryFruits: integer("dry_fruits").notNull(),
  dietaryNotes: text("dietary_notes"),
  entertainmentTypes: text("entertainment_types").notNull().default(""),
  entertainmentHours: integer("entertainment_hours").notNull().default(3),
  kidsActivities: integer("kids_activities").notNull().default(0),
  decorLevel: text("decor_level").notNull().default("simple"),
  manpowerJson: text("manpower_json").notNull().default("[]"),
  budgetLinesJson: text("budget_lines_json").notNull().default("[]"),
  costPerPlateInr: integer("cost_per_plate_inr").notNull().default(0),
  planSource: text("plan_source").notNull().default("template"),
  planVersion: integer("plan_version").notNull().default(1),
  venueOptionsJson: text("venue_options_json").notNull().default("[]"),
  menuJson: text("menu_json").notNull().default("{}"),
  tasksJson: text("tasks_json").notNull().default("[]"),
  risksJson: text("risks_json").notNull().default("[]"),
  aiNotesJson: text("ai_notes_json").notNull().default("[]"),
  aiModel: text("ai_model").notNull().default("gemini-3.5-flash-lite"),
  generationMessage: text("generation_message"),
  selectedVenueName: text("selected_venue_name"),
  venueConfirmed: integer("venue_confirmed").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const planVersions = sqliteTable("plan_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  source: text("source").notNull().default("template"),
  label: text("label").notNull().default(""),
  totalInr: integer("total_inr").notNull().default(0),
  perGuestInr: integer("per_guest_inr").notNull().default(0),
  healthScore: integer("health_score").notNull().default(0),
  snapshotJson: text("snapshot_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
