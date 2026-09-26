/**
 * Per-spec E2E DB isolation (issue #178).
 *
 * Each critical-path spec resets the shared E2E sqlite database to an empty
 * transactional state before its tests run, so specs never depend on rows
 * created by other specs (order-independent, retry-safe).
 *
 * Approach — truncate, don't re-create the file:
 * - The API/web servers are started ONCE per Playwright invocation with a
 *   fixed `APP_DB_PATH` (playwright.config.ts), so a fresh DB file per spec
 *   would require per-spec server restarts (not supported by the config's
 *   single webServer pair), and file snapshot/restore under the live
 *   connection is not portable (Windows EBUSY).
 * - Truncating the transactional tables through a second better-sqlite3
 *   connection is the established write pattern in this suite (db-seed.ts
 *   already INSERTs into the live DB). better-sqlite3 serializes writes and
 *   the API is idle between tests, so there is no lock contention.
 * - Seeded reference tables are PRESERVED: `role`, `role_permission`
 *   (the RBAC seeds the employee form options come from) and
 *   `app_schema_state` (migration marker).
 *
 * After a reset the `user` table is empty, so the next `bootstrapOrSignIn`
 * re-bootstraps (create-first-user path) — self-healing for every
 * downstream spec, which all use `bootstrapOrSignIn`.
 */

import { findE2eDatabase, loadDatabaseConstructor } from "./db-seed"

/**
 * False when the suite targets an externally managed API: there is no local
 * database file for the direct-SQLite fixtures to reset or seed, so the specs
 * that need one skip with a reason instead of failing mid-flow.
 */
export const databaseFixturesAvailable = process.env.E2E_API_MANAGED !== "0"

/**
 * Transactional tables emptied by a reset, in FK-safe order. `foreign_keys`
 * is toggled OFF on the reset connection anyway, so order is belt-and-braces
 * for readers — the pragma is the guarantee.
 */
const TRANSACTIONAL_TABLES = [
  // better-auth tables
  "session",
  "verification",
  "user_profile_history",
  "user",
  "account",
  // bootstrap ownership marker (re-created by the next bootstrap)
  "app_bootstrap_state",
  // workforce
  "employee_salary_payment",
  "employee_state_history",
  "employee_warehouse_assignment",
  "employee_project_assignment",
  "employee_manager_assignment",
  "employee",
  "project_manager_ownership_history",
  "warehouse_manager_ownership_history",
  "project",
  "warehouse",
  // debts
  "debt_entry",
  "debt_account",
  "external_counterparty",
  // inventory
  "inventory_outbound_transfer_item",
  "inventory_outbound_transfer",
  "inventory_invoice_attachment",
  "inventory_movement",
  "inventory_consumable_balance",
  "inventory_asset_unit",
  "inventory_entry",
  "inventory_invoice_group",
  "inventory_item_definition",
  // invoices / payments
  "payment_allocation",
  "payment",
  "invoice_line_item",
  "invoice",
  // security / release bookkeeping
  "recovery_key",
  "update_history",
]

/**
 * Empty every transactional table in the live E2E database. Seed tables
 * (`role`, `role_permission`, `app_schema_state`) are left intact.
 */
export function resetE2eDatabase(): void {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    // Fail loudly if a listed table no longer exists (schema rename/migration)
    // instead of silently leaking rows across specs.
    const known = new Set(
      (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    )
    for (const table of TRANSACTIONAL_TABLES) {
      if (!known.has(table)) {
        throw new Error(
          `resetE2eDatabase: table "${table}" no longer exists in the schema — update TRANSACTIONAL_TABLES in tests/e2e/helpers/db-isolation.ts`,
        )
      }
    }

    db.pragma("foreign_keys = OFF")
    db.exec("BEGIN")
    try {
      for (const table of TRANSACTIONAL_TABLES) {
        db.prepare(`DELETE FROM "${table}"`).run()
      }
      // DELETE leaves AUTOINCREMENT sequences alive (sqlite_sequence). Reset
      // them so post-reset inserts restart counters (invoice numbering is
      // row-derived, but payment_allocation/recovery_key/update_history use
      // AUTOINCREMENT ids). sqlite_sequence is created lazily by SQLite on the
      // first AUTOINCREMENT insert, so it may not exist yet on a fresh DB.
      if (known.has("sqlite_sequence")) {
        db.prepare(
          `DELETE FROM sqlite_sequence WHERE name IN (${TRANSACTIONAL_TABLES.map(() => "?").join(",")})`,
        ).run(...TRANSACTIONAL_TABLES)
      }
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    } finally {
      db.pragma("foreign_keys = ON")
    }
  } finally {
    db.close()
  }
}
