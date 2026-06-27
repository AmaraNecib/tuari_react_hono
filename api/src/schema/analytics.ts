import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Onboarding analytics schema.
 * Tracks user interactions with onboarding features.
 */

/** Analytics events table */
export const analyticsEvent = sqliteTable("analytics_event", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  event: text("event").notNull(),
  data: text("data"), // JSON stringified data
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
  sessionId: text("session_id").notNull(),
  userId: text("user_id"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/** Onboarding progress tracking */
export const onboardingProgress = sqliteTable("onboarding_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  feature: text("feature").notNull(), // tour, tutorial, task
  featureId: text("feature_id").notNull(), // specific tour/tutorial/task ID
  status: text("status").notNull(), // started, completed, skipped
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  duration: integer("duration"), // milliseconds
  metadata: text("metadata"), // JSON stringified additional data
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/** User onboarding level */
export const userOnboardingLevel = sqliteTable("user_onboarding_level", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),
  level: integer("level").notNull().default(1), // 1=basic, 2=intermediate, 3=advanced
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
