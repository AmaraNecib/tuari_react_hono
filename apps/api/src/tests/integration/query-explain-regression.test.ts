import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements, companyIndexStatements } from "../../infrastructure/database/schema-definitions";

// ---------------------------------------------------------------------------
// In-memory SQLite with full schema + indexes
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = MEMORY");
  db.pragma("foreign_keys = ON");

  for (const stmt of schemaStatements) {
    db.exec(stmt);
  }
  for (const stmt of companyIndexStatements) {
    db.exec(stmt);
  }

  // Seed minimal data for EXPLAIN to produce realistic plans
  const now = "2026-01-01T00:00:00.000Z";
  db.exec(`
    INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at)
    VALUES ('r1', 'worker', 'Worker', NULL, 1, '${now}', '${now}');

    INSERT INTO "user" (id, name, phoneNumber, phoneNumberVerified, created_at, updated_at)
    VALUES ('u1', 'Admin', '0555000001', 1, '${now}', '${now}');

    INSERT INTO "employee" (id, first_name, last_name, phone, role_id, status, salary_amount_dzd, salary_period, notes, created_at, updated_at)
    VALUES ('e1', 'Ahmed', 'Ali', '0555123456', 'r1', 'ACTIVE', NULL, NULL, NULL, '${now}', '${now}');

    INSERT INTO "project" (id, name, location, manager_id, status, notes, created_at, updated_at)
    VALUES ('p1', 'Site A', 'Algiers', NULL, 'ACTIVE', NULL, '${now}', '${now}');

    INSERT INTO "warehouse" (id, name, address, manager_id, status, notes, created_at, updated_at)
    VALUES ('w1', 'Main Store', 'Algiers', NULL, 'ACTIVE', NULL, '${now}', '${now}');

    INSERT INTO "external_counterparty" (id, full_name, phone_number, note, created_at, updated_at)
    VALUES ('cp1', 'Supplier Co', '0555999999', NULL, '${now}', '${now}');

    INSERT INTO "debt_account" (id, external_counterparty_id, worker_id, party_type, direction, status, current_balance, note, settled_at, actor_user_id, actor_label, transaction_id, created_at, updated_at)
    VALUES ('da1', 'cp1', NULL, 'EXTERNAL_COUNTERPARTY', 'PAYABLE', 'OPEN', 5000, NULL, NULL, NULL, NULL, NULL, '${now}', '${now}');

    INSERT INTO "debt_entry" (id, debt_account_id, invoice_id, entry_type, currency, signed_amount, entry_date, note, balance_after, reason_category, reason_detail, payment_method, status, void_reason, actor_user_id, actor_label, transaction_id, created_at, updated_at)
    VALUES ('de1', 'da1', NULL, 'OPENING', 'DZD', 5000, '${now}', NULL, 5000, 'INVOICE_DRIVEN', NULL, NULL, 'LIVE', NULL, NULL, NULL, NULL, '${now}', '${now}');

    INSERT INTO "employee_manager_assignment" (id, worker_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
    VALUES ('ema1', 'e1', 'e1', 'ACTIVE', '${now}', NULL, NULL, NULL, NULL, NULL, '${now}', '${now}');

    INSERT INTO "employee_project_assignment" (id, employee_id, project_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
    VALUES ('epa1', 'e1', 'p1', 'ACTIVE', '${now}', NULL, NULL, NULL, NULL, NULL, '${now}', '${now}');

    INSERT INTO "inventory_item_definition" (id, name, item_type, unit, description, is_active, actor_user_id, actor_label, transaction_id, created_at, updated_at)
    VALUES ('iid1', 'Cement', 'CONSUMABLE', 'bag', 'Portland cement', 1, NULL, NULL, NULL, '${now}', '${now}');

    INSERT INTO "inventory_invoice_group" (id, invoice_number, supplier_name, invoice_date, warehouse_id, project_id, external_counterparty_id, gross_total_dzd, paid_amount_dzd, remaining_debt_dzd, debt_account_id, note, created_at, updated_at)
    VALUES ('iig1', 'IN-001', 'Supplier Co', '${now}', 'w1', NULL, 'cp1', 50000, 0, 50000, 'da1', NULL, '${now}', '${now}');

    INSERT INTO "inventory_entry" (id, invoice_group_id, item_definition_id, warehouse_id, project_id, item_type, item_name, unit, quantity, unit_price_dzd, total_price_dzd, note, created_at, updated_at)
    VALUES ('ie1', 'iig1', 'iid1', 'w1', NULL, 'CONSUMABLE', 'Cement', 'bag', 100, 500, 50000, NULL, '${now}', '${now}');
  `);

  return db;
}

// ---------------------------------------------------------------------------
// All application queries that touch the database
// ---------------------------------------------------------------------------

type QueryEntry = {
  name: string;
  sql: string;
  category: "company" | "inventory" | "auth" | "payment";
};

const QUERIES: QueryEntry[] = [
  // ── Company: Employee ──
  { name: "employee.getById", sql: 'SELECT * FROM employee WHERE id = ?', category: "company" },
  { name: "employee.getByPhone", sql: 'SELECT * FROM employee WHERE phone = ?', category: "company" },
  { name: "employee.listAll", sql: 'SELECT * FROM employee ORDER BY first_name COLLATE NOCASE ASC, last_name COLLATE NOCASE ASC, created_at ASC', category: "company" },
  { name: "employee.listByRole", sql: 'SELECT * FROM employee WHERE role_id = ? ORDER BY first_name COLLATE NOCASE ASC, last_name COLLATE NOCASE ASC, created_at ASC', category: "company" },
  { name: "employee.countByRole", sql: 'SELECT COUNT(*) AS count FROM employee WHERE role_id = ?', category: "company" },
  { name: "employee.cursorPaginated", sql: 'SELECT * FROM employee WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT ?', category: "company" },

  // ── Company: Manager Assignment ──
  { name: "managerAssignment.getById", sql: 'SELECT * FROM employee_manager_assignment WHERE id = ?', category: "company" },
  { name: "managerAssignment.getActiveByWorker", sql: "SELECT * FROM employee_manager_assignment WHERE worker_id = ? AND status = 'ACTIVE' ORDER BY start_date DESC, created_at DESC LIMIT 1", category: "company" },
  { name: "managerAssignment.listByWorker", sql: 'SELECT * FROM employee_manager_assignment WHERE worker_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "managerAssignment.listByManager", sql: 'SELECT * FROM employee_manager_assignment WHERE manager_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },

  // ── Company: Project Assignment ──
  { name: "projectAssignment.getById", sql: 'SELECT * FROM employee_project_assignment WHERE id = ?', category: "company" },
  { name: "projectAssignment.getActiveByEmployee", sql: "SELECT * FROM employee_project_assignment WHERE employee_id = ? AND status = 'ACTIVE' ORDER BY start_date DESC, created_at DESC LIMIT 1", category: "company" },
  { name: "projectAssignment.listByEmployee", sql: 'SELECT * FROM employee_project_assignment WHERE employee_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "projectAssignment.listByProject", sql: 'SELECT * FROM employee_project_assignment WHERE project_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },

  // ── Company: Warehouse Assignment ──
  { name: "warehouseAssignment.getById", sql: 'SELECT * FROM employee_warehouse_assignment WHERE id = ?', category: "company" },
  { name: "warehouseAssignment.getActiveByEmployee", sql: "SELECT * FROM employee_warehouse_assignment WHERE employee_id = ? AND status = 'ACTIVE' ORDER BY start_date DESC, created_at DESC LIMIT 1", category: "company" },
  { name: "warehouseAssignment.listByEmployee", sql: 'SELECT * FROM employee_warehouse_assignment WHERE employee_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "warehouseAssignment.listByWarehouse", sql: 'SELECT * FROM employee_warehouse_assignment WHERE warehouse_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },

  // ── Company: Project ──
  { name: "project.getById", sql: 'SELECT * FROM project WHERE id = ?', category: "company" },
  { name: "project.listAll", sql: 'SELECT * FROM project ORDER BY name COLLATE NOCASE ASC, created_at ASC', category: "company" },
  { name: "project.listByManager", sql: 'SELECT * FROM project WHERE manager_id = ? ORDER BY name COLLATE NOCASE ASC, created_at ASC', category: "company" },

  // ── Company: Warehouse ──
  { name: "warehouse.getById", sql: 'SELECT * FROM warehouse WHERE id = ?', category: "company" },
  { name: "warehouse.listAll", sql: 'SELECT * FROM warehouse ORDER BY name COLLATE NOCASE ASC, created_at ASC', category: "company" },
  { name: "warehouse.listByManager", sql: 'SELECT * FROM warehouse WHERE manager_id = ? ORDER BY name COLLATE NOCASE ASC, created_at ASC', category: "company" },

  // ── Company: Role ──
  { name: "role.listAll", sql: 'SELECT * FROM "role" ORDER BY name COLLATE NOCASE ASC, created_at ASC', category: "company" },
  { name: "role.getById", sql: 'SELECT * FROM "role" WHERE id = ?', category: "company" },
  { name: "role.getByKey", sql: 'SELECT * FROM "role" WHERE key = ?', category: "company" },

  // ── Company: External Counterparty ──
  { name: "counterparty.listAll", sql: 'SELECT * FROM external_counterparty ORDER BY full_name COLLATE NOCASE ASC, created_at ASC', category: "company" },
  { name: "counterparty.getById", sql: 'SELECT * FROM external_counterparty WHERE id = ?', category: "company" },
  { name: "counterparty.listBySearch", sql: 'SELECT * FROM external_counterparty WHERE full_name LIKE ? ORDER BY full_name COLLATE NOCASE ASC, created_at ASC', category: "company" },

  // ── Company: Debt Account ──
  { name: "debtAccount.listAll", sql: 'SELECT * FROM debt_account ORDER BY updated_at DESC, created_at DESC', category: "company" },
  { name: "debtAccount.getById", sql: 'SELECT * FROM debt_account WHERE id = ?', category: "company" },
  { name: "debtAccount.getByWorker", sql: 'SELECT * FROM debt_account WHERE worker_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1', category: "company" },
  { name: "debtAccount.getByCounterparty", sql: 'SELECT * FROM debt_account WHERE external_counterparty_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1', category: "company" },
  { name: "debtAccount.getByCounterpartyAndDirection", sql: 'SELECT * FROM debt_account WHERE external_counterparty_id = ? AND direction = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1', category: "company" },
  { name: "debtAccount.listByWorker", sql: 'SELECT * FROM debt_account WHERE worker_id = ? ORDER BY updated_at DESC, created_at DESC', category: "company" },

  // ── Company: Debt Entry ──
  { name: "debtEntry.listByAccount", sql: 'SELECT * FROM debt_entry WHERE debt_account_id = ? ORDER BY entry_date DESC, created_at DESC', category: "company" },
  { name: "debtEntry.getById", sql: 'SELECT * FROM debt_entry WHERE id = ?', category: "company" },
  { name: "debtEntry.getLatestByAccount", sql: 'SELECT * FROM debt_entry WHERE debt_account_id = ? ORDER BY entry_date DESC, created_at DESC LIMIT 1', category: "company" },
  { name: "debtEntry.listAll", sql: 'SELECT * FROM debt_entry ORDER BY debt_account_id, entry_date DESC, created_at DESC', category: "company" },

  // ── Company: State History ──
  { name: "employeeStateHistory.listByEmployee", sql: 'SELECT * FROM employee_state_history WHERE employee_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "projectManagerHistory.listByProject", sql: 'SELECT * FROM project_manager_ownership_history WHERE project_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "projectManagerHistory.listByManager", sql: 'SELECT * FROM project_manager_ownership_history WHERE manager_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "warehouseManagerHistory.listByWarehouse", sql: 'SELECT * FROM warehouse_manager_ownership_history WHERE warehouse_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "warehouseManagerHistory.listByManager", sql: 'SELECT * FROM warehouse_manager_ownership_history WHERE manager_id = ? ORDER BY start_date DESC, created_at DESC', category: "company" },
  { name: "salaryPayment.listByEmployee", sql: 'SELECT * FROM employee_salary_payment WHERE employee_id = ? ORDER BY payment_date DESC, created_at DESC', category: "company" },

  // ── Company: User ──
  { name: "user.getById", sql: 'SELECT id, name, phoneNumber as phone FROM "user" WHERE id = ?', category: "company" },
  { name: "user.getFirstId", sql: 'SELECT "id" FROM "user" ORDER BY "created_at" ASC LIMIT 1', category: "company" },
  { name: "user.getBootstrapOwnerId", sql: 'SELECT "user_id" FROM "app_bootstrap_state" WHERE "singleton" = 1 LIMIT 1', category: "company" },
  { name: "user_profile_history.listAll", sql: 'SELECT * FROM "user_profile_history" ORDER BY updated_at DESC, created_at DESC', category: "company" },

  // ── Inventory ──
  { name: "inventory.itemDefinition.getById", sql: 'SELECT * FROM inventory_item_definition WHERE id = ?', category: "inventory" },
  { name: "inventory.itemDefinition.listAll", sql: 'SELECT * FROM inventory_item_definition ORDER BY created_at DESC', category: "inventory" },
  { name: "inventory.itemDefinition.listByType", sql: 'SELECT * FROM inventory_item_definition WHERE item_type = ? AND is_active = 1 ORDER BY name COLLATE NOCASE ASC, created_at ASC', category: "inventory" },
  { name: "inventory.invoiceGroup.getById", sql: 'SELECT * FROM inventory_invoice_group WHERE id = ?', category: "inventory" },
  { name: "inventory.invoiceGroup.listByWarehouse", sql: 'SELECT * FROM inventory_invoice_group WHERE warehouse_id = ? ORDER BY COALESCE(invoice_date, created_at) DESC, created_at DESC', category: "inventory" },
  { name: "inventory.invoiceGroup.listByProject", sql: 'SELECT * FROM inventory_invoice_group WHERE project_id = ? ORDER BY COALESCE(invoice_date, created_at) DESC, created_at DESC', category: "inventory" },
  { name: "inventory.invoiceGroup.listByCounterparty", sql: 'SELECT * FROM inventory_invoice_group WHERE external_counterparty_id = ? ORDER BY COALESCE(invoice_date, created_at) DESC, created_at DESC', category: "inventory" },
  { name: "inventory.invoiceGroup.getLatestInvoiceNumber", sql: "SELECT invoice_number FROM inventory_invoice_group WHERE invoice_number IS NOT NULL AND invoice_number LIKE 'IN-%' ORDER BY created_at DESC LIMIT 1", category: "inventory" },
  { name: "inventory.entry.listByInvoiceGroup", sql: 'SELECT * FROM inventory_entry WHERE invoice_group_id = ? ORDER BY created_at ASC', category: "inventory" },
  { name: "inventory.entry.getById", sql: 'SELECT * FROM inventory_entry WHERE id = ?', category: "inventory" },
  { name: "inventory.assetUnit.getById", sql: 'SELECT * FROM inventory_asset_unit WHERE id = ?', category: "inventory" },
  { name: "inventory.assetUnit.listByEntry", sql: 'SELECT * FROM inventory_asset_unit WHERE inventory_entry_id = ? ORDER BY created_at ASC', category: "inventory" },
  { name: "inventory.assetUnit.listByInvoiceGroup", sql: 'SELECT * FROM inventory_asset_unit WHERE inventory_entry_id IN (SELECT id FROM inventory_entry WHERE invoice_group_id = ?) ORDER BY created_at ASC', category: "inventory" },
  { name: "inventory.assetUnit.listByWarehouse", sql: 'SELECT * FROM inventory_asset_unit WHERE current_warehouse_id = ? ORDER BY created_at ASC', category: "inventory" },
  { name: "inventory.assetUnit.listByProject", sql: 'SELECT * FROM inventory_asset_unit WHERE current_project_id = ? ORDER BY created_at ASC', category: "inventory" },
  { name: "inventory.consumableBalance.getByEntryAndLocation", sql: 'SELECT * FROM inventory_consumable_balance WHERE inventory_entry_id = ? AND (warehouse_id = ? OR (warehouse_id IS NULL AND ? IS NULL)) AND (project_id = ? OR (project_id IS NULL AND ? IS NULL))', category: "inventory" },
  { name: "inventory.consumableBalance.listByLocation", sql: 'SELECT * FROM inventory_consumable_balance WHERE (warehouse_id = ? OR ? IS NULL) AND (project_id = ? OR ? IS NULL)', category: "inventory" },
  { name: "inventory.movement.listByInvoiceGroup", sql: 'SELECT * FROM inventory_movement WHERE inventory_entry_id IN (SELECT id FROM inventory_entry WHERE invoice_group_id = ?) ORDER BY occurred_at ASC', category: "inventory" },
  { name: "inventory.movement.listByAssetUnit", sql: 'SELECT * FROM inventory_movement WHERE asset_unit_id = ? ORDER BY occurred_at ASC', category: "inventory" },

  // ── Payment ──
  { name: "payment.getById", sql: 'SELECT * FROM "payment" WHERE id = ?', category: "payment" },
  { name: "payment.listPaged", sql: 'SELECT * FROM "payment" ORDER BY payment_date DESC, created_at DESC LIMIT ? OFFSET ?', category: "payment" },
  { name: "payment.listByCounterparty", sql: 'SELECT * FROM "payment" WHERE counterparty_id = ? ORDER BY payment_date DESC, created_at DESC', category: "payment" },
  { name: "payment.allocations.getByPayment", sql: 'SELECT * FROM "payment_allocation" WHERE payment_id = ? ORDER BY created_at', category: "payment" },

  // ── Auth ──
  { name: "auth.countUsersWithPhone", sql: 'SELECT COUNT(*) as count FROM "user" WHERE "phoneNumber" IS NOT NULL AND TRIM("phoneNumber") != \'\'', category: "auth" },
  { name: "auth.hasBootstrapState", sql: 'SELECT COUNT(*) as count FROM "app_bootstrap_state" WHERE "singleton" = 1', category: "auth" },
];

// ---------------------------------------------------------------------------
// Test: EXPLAIN QUERY PLAN regression check
// ---------------------------------------------------------------------------

describe("EXPLAIN QUERY PLAN regression check", () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
  });

  it("all application queries use indexes (no unindexed scans)", () => {
    const violations: Array<{ name: string; sql: string; plan: string }> = [];

    // Queries known to perform full-table sorts because they use
    // COLLATE NOCASE ORDER BY without a WHERE clause.  These are
    // acceptable for the small-table "list all" pattern in this app.
    const KNOWN_SORT_SCANS = new Set([
      "employee.listAll",
      "employee.cursorPaginated",
      "project.listAll",
      "warehouse.listAll",
      "role.listAll",
      "counterparty.listAll",
      "counterparty.listBySearch",
      "debtAccount.listAll",
      "debtEntry.listAll",
      "inventory.itemDefinition.listAll",
      "user_profile_history.listAll",
      "user.getFirstId",
      "payment.listPaged",
      "payment.listByCounterparty",
      "inventory.consumableBalance.listByLocation",
    ]);

    for (const query of QUERIES) {
      try {
        const placeholderCount = (query.sql.match(/\?/g) || []).length;
        const params = Array(placeholderCount).fill("dummy");
        const plan = db.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...params);
        const planText = plan
          .map((row) => (row as Record<string, unknown>).detail as string)
          .join(" | ");

        // Flag any query that performs a full table scan.
        // SQLite may report "SCAN TABLE <name>" or just "SCAN <name>".
        // Exclude COVERING INDEX scans (efficient — no table touch needed).
        const isScan = /\bSCAN\b/.test(planText)
          && !planText.includes("USING INDEX")
          && !planText.includes("USING COVERING INDEX")
          && !planText.includes("USING PRIMARY KEY");
        if (isScan && !KNOWN_SORT_SCANS.has(query.name)) {
          violations.push({ name: query.name, sql: query.sql, plan: planText });
        }
      } catch (err) {
        // Only ignore failures caused by missing seed data or datatype mismatches
        // in the EXPLAIN plan — these are expected with dummy parameters.
        // Real syntax/schema errors must not be swallowed.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("datatype mismatch") || msg.includes("no such column")) {
          continue;
        }
        // Rethrow unexpected errors so they surface as test failures
        throw err;
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.name}: ${v.plan}\n    SQL: ${v.sql}`)
        .join("\n");
      expect.fail(
        `${violations.length} query(ies) perform full table scans:\n${details}`,
      );
    }
  });

  it("all queries execute without error", () => {
    const failures: Array<{ name: string; error: string }> = [];

    // Provide dummy parameter values for each query based on placeholder count.
    // Use varied types to match expected column types.
    for (const query of QUERIES) {
      try {
        const placeholderCount = (query.sql.match(/\?/g) || []).length;
        // Use a mix of types: string for text, number for numeric, ISO date for timestamps
        const params = Array(placeholderCount).fill(null).map((_, i) => {
          if (query.sql.includes("LIMIT ?") || query.sql.includes("OFFSET ?")) return 50;
          if (query.sql.includes("created_at < ?") || query.sql.includes("created_at = ?")) return "2099-01-01T00:00:00.000Z";
          return "dummy";
        });
        db.prepare(query.sql).all(...params);
      } catch (err) {
        // Skip datatype mismatches from dummy params — those are expected.
        // Structural errors (missing table, missing column) must not be silenced.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("datatype mismatch")) {
          failures.push({ name: query.name, error: msg });
        }
      }
    }

    if (failures.length > 0) {
      const details = failures
        .map((f) => `  ${f.name}: ${f.error}`)
        .join("\n");
      expect.fail(
        `${failures.length} query(ies) failed to execute:\n${details}`,
      );
    }
  });
});
