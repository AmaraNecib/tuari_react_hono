// M4.1 — Update metadata endpoint
// M4.3 — Update history table

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Records of applied application updates. */
export const updateHistory = sqliteTable("update_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull(),
  appliedAt: text("applied_at").notNull(),
  success: integer("success", { mode: "boolean" }).notNull().default(true),
  errorMessage: text("error_message"),
});
