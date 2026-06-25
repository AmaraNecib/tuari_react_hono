import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * Application bootstrap and role tables.
 * Schema matches the existing SQL definitions in schema-definitions.ts.
 */

/**
 * Application bootstrap and role tables.
 * Schema matches the existing SQL definitions in schema-definitions.ts.
 */

/** Singleton tracking whether the first user has been bootstrapped. */
export const appBootstrapState = sqliteTable("app_bootstrap_state", {
  singleton: integer("singleton").primaryKey(),
  createdAt: text("created_at").notNull(),
  userId: text("user_id"),
});

/** Schema migration tracking — records which migrations have been applied. */
export const appSchemaState = sqliteTable("app_schema_state", {
  key: text("key").primaryKey(),
  executedAt: text("executed_at").notNull(),
});

/** Audit trail for user profile changes (name, phone, password). */
export const userProfileHistory = sqliteTable("user_profile_history", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name"),
  phone: text("phone"),
  previousName: text("previous_name"),
  previousPhone: text("previous_phone"),
  passwordChanged: integer("password_changed", { mode: "boolean" })
    .notNull()
    .default(false),
  actorUserId: text("actor_user_id"),
  actorLabel: text("actor_label"),
  transactionId: text("transaction_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Role definitions (admin, worker, manager, etc.). */
export const role = sqliteTable("role", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Many-to-many mapping between roles and permissions. */
export const rolePermission = sqliteTable("role_permission", {
  id: text("id").primaryKey(),
  roleId: text("role_id")
    .notNull()
    .references(() => role.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
