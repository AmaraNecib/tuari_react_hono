import Database from "better-sqlite3";

import { describe, expect, it } from "vitest";

import {
  applyEmployeeUserLinkMigration,
  applyDebtAccountBalanceRename,
  applyDebtAccountDirectionMigration,
  applyPaymentAllocationRestrictMigration,
  applyRbacThreeRoleMigration,
  type DbExecutor,
} from "./schema";
import {
  debtAccountBalanceRenameMigrationKey,
  debtAccountDirectionMigrationKey,
  paymentAllocationRestrictMigrationKey,
  rbacThreeRoleMigrationKey,
} from "./schema-definitions";
import { BetterSqlite3Executor } from "./sqlite-executor";

describe("applyEmployeeUserLinkMigration", () => {
  function createLegacyDb() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "user" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "phoneNumber" TEXT NOT NULL UNIQUE,
        "created_at" DATETIME NOT NULL,
        "updated_at" DATETIME NOT NULL
      );
      CREATE TABLE "employee" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "first_name" TEXT NOT NULL,
        "last_name" TEXT NOT NULL,
        "phone" TEXT NOT NULL UNIQUE,
        "role_id" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "created_at" DATETIME NOT NULL,
        "updated_at" DATETIME NOT NULL
      );
      INSERT INTO "user" VALUES ('user-1', 'Mourad', '0612345678', 'now', 'now');
      INSERT INTO "employee" VALUES ('employee-1', 'Mourad', 'Saadi', '0612345678', 'role-1', 'ACTIVE', 'now', 'now');
    `);
    return db;
  }

  it("adds a nullable link to a legacy employee table and is idempotent", async () => {
    const db = createLegacyDb();

    await applyEmployeeUserLinkMigration(asDbExecutor(db));
    await applyEmployeeUserLinkMigration(asDbExecutor(db));

    db.prepare('UPDATE "employee" SET "user_id" = ? WHERE "id" = ?').run("user-1", "employee-1");
    const linked = db.prepare('SELECT "user_id" FROM "employee" WHERE "id" = ?').get("employee-1") as { user_id: string };
    expect(linked.user_id).toBe("user-1");
  });

  it("enforces one employee per user and preserves the link when the user is deleted", async () => {
    const db = createLegacyDb();
    await applyEmployeeUserLinkMigration(asDbExecutor(db));
    db.prepare('UPDATE "employee" SET "user_id" = ? WHERE "id" = ?').run("user-1", "employee-1");
    db.prepare('INSERT INTO "employee" ("id", "first_name", "last_name", "phone", "role_id", "status", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run("employee-2", "A", "B", "0612345679", "role-1", "ACTIVE", "now", "now");

    expect(() => db.prepare('UPDATE "employee" SET "user_id" = ? WHERE "id" = ?').run("user-1", "employee-2")).toThrow(/UNIQUE constraint failed/);

    db.prepare('DELETE FROM "user" WHERE "id" = ?').run("user-1");
    const unlinked = db.prepare('SELECT "user_id" FROM "employee" WHERE "id" = ?').get("employee-1") as { user_id: string | null };
    expect(unlinked.user_id).toBeNull();
  });

});

/**
 * Adapter that turns a `better-sqlite3` `Database` into a `DbExecutor`
 * so the migration can be exercised directly against an in-memory SQLite
 * using raw SQLite.
 *
 * Implements the raw SQLite interface used by the migration:
 * raw execute, and a savepoint-backed transaction callback that yields a
 * same-shaped `DbExecutor` for the txn body (mirrors the production
 * `BetterSqlite3Executor`).
 */
let savepointCounter = 0;
function asDbExecutor(database: Database.Database): DbExecutor {
  function makeDb(inner: Database.Database): DbExecutor {
    return {
      async $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T> {
        return inner.prepare(sql).all(...params) as T;
      },
      async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
        return inner.prepare(sql).run(...params).changes;
      },
      async $transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
        // better-sqlite3 transactions are synchronous, so the async work
        // cannot run inside `db.transaction(...)`. Mirror the production
        // `BetterSqlite3Executor` (sqlite-executor.ts): open a SAVEPOINT,
        // await the async work, then RELEASE / ROLLBACK — the work runs
        // while the savepoint is open, so the whole body is atomic and the
        // `await` actually waits for it (an early-resolving wrapper would
        // let the next assertion observe a half-applied migration and turn
        // a late work rejection into an unhandled promise rejection).
        const savepoint = `tx_test_${++savepointCounter}`;
        inner.exec(`SAVEPOINT ${savepoint}`);
        try {
          const result = await work(makeDb(inner));
          inner.exec(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          try {
            inner.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            inner.exec(`RELEASE SAVEPOINT ${savepoint}`);
          } catch {
            // Savepoint may already be released/rolled back.
          }
          throw error;
        }
      },
    };
  }
  return makeDb(database);
}

/**
 * Issue #21: rename `debt_account.current_balance_dzd` → `current_balance`.
 *
 * The migration must be idempotent and safe across three scenarios:
 *   (a) Fresh DB already has `current_balance` — migration is a no-op
 *   (b) Legacy DB has `current_balance_dzd` — migration renames in a tx
 *   (c) Re-run on a DB where the migration already ran — no-op via
 *       `app_schema_state` key
 */
describe("applyDebtAccountBalanceRename (issue #21)", () => {
  function createLegacyDb() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "debt_account" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "current_balance_dzd" REAL NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL
      );
      INSERT INTO "debt_account" ("id", "current_balance_dzd", "status")
        VALUES ('acct-1', 1500, 'OPEN');
    `);
    return db;
  }

  function getColumnNames(db: Database.Database, table: string) {
    return db
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map((column) => (column as { name: string }).name);
  }

  it("renames `current_balance_dzd` to `current_balance` on a legacy DB", async () => {
    const db = createLegacyDb();
    expect(getColumnNames(db, "debt_account")).toContain("current_balance_dzd");

    await applyDebtAccountBalanceRename(asDbExecutor(db));

    const columns = getColumnNames(db, "debt_account");
    expect(columns).toContain("current_balance");
    expect(columns).not.toContain("current_balance_dzd");

    // Data preserved across the rename
    const account = db
      .prepare('SELECT "current_balance" AS balance FROM "debt_account" WHERE "id" = ?')
      .get("acct-1") as { balance: number };
    expect(account.balance).toBe(1500);

    // Migration key recorded
    const [keyRow] = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(debtAccountBalanceRenameMigrationKey) as Array<{ key: string }>;
    expect(keyRow?.key).toBe(debtAccountBalanceRenameMigrationKey);
  });

  it("is a no-op on a fresh DB that already uses the new column name", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "debt_account" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "current_balance" REAL NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL
      );
    `);

    await applyDebtAccountBalanceRename(asDbExecutor(db));

    const columns = getColumnNames(db, "debt_account");
    expect(columns).toEqual(["id", "current_balance", "status"]);

    // Second call is a true no-op via the state key
    await applyDebtAccountBalanceRename(asDbExecutor(db));
    const columnsAfter = getColumnNames(db, "debt_account");
    expect(columnsAfter).toEqual(["id", "current_balance", "status"]);
  });

  it("is a no-op on a DB where the migration has already run", async () => {
    const db = createLegacyDb();
    await applyDebtAccountBalanceRename(asDbExecutor(db));

    // Re-run
    await applyDebtAccountBalanceRename(asDbExecutor(db));

    const columns = getColumnNames(db, "debt_account");
    expect(columns).toContain("current_balance");
    expect(columns).not.toContain("current_balance_dzd");

    // State key still recorded exactly once
    const keys = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(debtAccountBalanceRenameMigrationKey) as Array<{ key: string }>;
    expect(keys).toHaveLength(1);
  });

  it("preserves the row data when the column is renamed", async () => {
    const db = createLegacyDb();
    db
      .prepare('INSERT INTO "debt_account" ("id", "current_balance_dzd", "status") VALUES (?, ?, ?)')
      .run("acct-positive", 500, "OPEN");
    db
      .prepare('INSERT INTO "debt_account" ("id", "current_balance_dzd", "status") VALUES (?, ?, ?)')
      .run("acct-zero", 0, "SETTLED");
    db
      .prepare('INSERT INTO "debt_account" ("id", "current_balance_dzd", "status") VALUES (?, ?, ?)')
      .run("acct-negative", -300, "OPEN");

    await applyDebtAccountBalanceRename(asDbExecutor(db));

    const rows = db
      .prepare('SELECT "id", "current_balance" AS balance FROM "debt_account" ORDER BY "id"')
      .all() as Array<{ id: string; balance: number }>;
    expect(rows).toEqual([
      { id: "acct-1", balance: 1500 },
      { id: "acct-negative", balance: -300 },
      { id: "acct-positive", balance: 500 },
      { id: "acct-zero", balance: 0 },
    ]);
  });
});

/**
 * Issue #22: add `direction` column to `debt_account` and enforce
 * uniqueness on `(external_counterparty_id, direction)`. The column
 * itself is added by an additive statement on every startup, so the
 * migration only needs to create the composite unique index and
 * record itself in `app_schema_state`.
 */
describe("applyDebtAccountDirectionMigration (issue #22)", () => {
  function createDbWithDirectionColumn() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "external_counterparty" (
        "id" TEXT NOT NULL PRIMARY KEY
      );
      CREATE TABLE "debt_account" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "external_counterparty_id" TEXT,
        "direction" TEXT NOT NULL DEFAULT 'PAYABLE'
          CHECK ("direction" IN ('PAYABLE', 'RECEIVABLE')),
        "status" TEXT NOT NULL,
        "current_balance" REAL NOT NULL DEFAULT 0
      );
    `);
    db.prepare('INSERT INTO "external_counterparty" ("id") VALUES (?), (?)').run(
      "ext-1",
      "ext-2",
    );
    return db;
  }

  /**
   * Realistic legacy DB: has the single-column unique index installed
   * by `debtSingleAccountMigration`. The direction migration MUST drop
   * this index or the second ledger per counterparty is impossible.
   */
  function createLegacyDbWithSingleColumnIndex() {
    const db = createDbWithDirectionColumn();
    db.exec(
      'CREATE UNIQUE INDEX "debt_account_external_counterparty_unique" ON "debt_account" ("external_counterparty_id") WHERE "external_counterparty_id" IS NOT NULL',
    );
    // Pre-existing counterparty already has a PAYABLE account.
    db.prepare(
      'INSERT INTO "debt_account" ("id", "external_counterparty_id", "direction", "status") VALUES (?, ?, ?, ?)',
    ).run("acct-legacy", "ext-1", "PAYABLE", "OPEN");
    return db;
  }

  function listIndexes(db: Database.Database, table: string) {
    return db
      .prepare(`PRAGMA index_list("${table}")`)
      .all()
      .map((row) => (row as { name: string }).name);
  }

  it("creates the composite unique index on a fresh legacy DB", async () => {
    const db = createDbWithDirectionColumn();

    await applyDebtAccountDirectionMigration(asDbExecutor(db));

    const indexes = listIndexes(db, "debt_account");
    expect(indexes).toContain("debt_account_external_counterparty_direction_unique");

    const [keyRow] = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(debtAccountDirectionMigrationKey) as Array<{ key: string }>;
    expect(keyRow?.key).toBe(debtAccountDirectionMigrationKey);
  });

  it("is a no-op when called twice (state key guards re-run)", async () => {
    const db = createDbWithDirectionColumn();

    await applyDebtAccountDirectionMigration(asDbExecutor(db));
    await applyDebtAccountDirectionMigration(asDbExecutor(db));

    const keys = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(debtAccountDirectionMigrationKey) as Array<{ key: string }>;
    expect(keys).toHaveLength(1);
  });

  it("drops the legacy single-column unique index on legacy DBs", async () => {
    // Greptile flagged this: production databases that ran the
    // pre-Issue-#22 `debtSingleAccountMigration` already have
    // `debt_account_external_counterparty_unique` enforcing
    // "one account per counterparty". The direction migration MUST
    // drop that index or the second ledger is impossible.
    const db = createLegacyDbWithSingleColumnIndex();
    expect(listIndexes(db, "debt_account")).toContain("debt_account_external_counterparty_unique");

    await applyDebtAccountDirectionMigration(asDbExecutor(db));

    const indexes = listIndexes(db, "debt_account");
    expect(indexes).not.toContain("debt_account_external_counterparty_unique");
    expect(indexes).toContain("debt_account_external_counterparty_direction_unique");
  });

  it("allows a second ledger per counterparty after dropping the legacy index", async () => {
    const db = createLegacyDbWithSingleColumnIndex();

    await applyDebtAccountDirectionMigration(asDbExecutor(db));

    // The legacy PAYABLE row is still there.
    const before = db
      .prepare(
        'SELECT "id", "direction" FROM "debt_account" WHERE "external_counterparty_id" = ? ORDER BY "direction"',
      )
      .all("ext-1") as Array<{ id: string; direction: string }>;
    expect(before).toEqual([{ id: "acct-legacy", direction: "PAYABLE" }]);

    // Insert the second ledger (RECEIVABLE) — this would FAIL on a
    // legacy DB that hadn't dropped the old single-column index.
    expect(() =>
      db
        .prepare(
          'INSERT INTO "debt_account" ("id", "external_counterparty_id", "direction", "status") VALUES (?, ?, ?, ?)',
        )
        .run("acct-rec-1", "ext-1", "RECEIVABLE", "OPEN"),
    ).not.toThrow();

    // Both ledgers coexist on the same counterparty.
    const after = db
      .prepare(
        'SELECT "direction" FROM "debt_account" WHERE "external_counterparty_id" = ? ORDER BY "direction"',
      )
      .all("ext-1") as Array<{ direction: string }>;
    expect(after.map((row) => row.direction)).toEqual(["PAYABLE", "RECEIVABLE"]);
  });

  it("enforces one-PAYABLE-and-one-RECEIVABLE-per-counterparty at the DB layer", async () => {
    const db = createDbWithDirectionColumn();

    await applyDebtAccountDirectionMigration(asDbExecutor(db));

    // First PAYABLE account: ok
    db.prepare(
      'INSERT INTO "debt_account" ("id", "external_counterparty_id", "direction", "status") VALUES (?, ?, ?, ?)',
    ).run("acct-pay-1", "ext-1", "PAYABLE", "OPEN");

    // First RECEIVABLE account for same counterparty: ok
    expect(() =>
      db
        .prepare(
          'INSERT INTO "debt_account" ("id", "external_counterparty_id", "direction", "status") VALUES (?, ?, ?, ?)',
        )
        .run("acct-rec-1", "ext-1", "RECEIVABLE", "OPEN"),
    ).not.toThrow();

    // Second PAYABLE for same counterparty: rejected
    expect(() =>
      db
        .prepare(
          'INSERT INTO "debt_account" ("id", "external_counterparty_id", "direction", "status") VALUES (?, ?, ?, ?)',
        )
        .run("acct-pay-2", "ext-1", "PAYABLE", "OPEN"),
    ).toThrow(/UNIQUE constraint failed/);

    // Second RECEIVABLE for same counterparty: rejected
    expect(() =>
      db
        .prepare(
          'INSERT INTO "debt_account" ("id", "external_counterparty_id", "direction", "status") VALUES (?, ?, ?, ?)',
        )
        .run("acct-rec-2", "ext-1", "RECEIVABLE", "OPEN"),
    ).toThrow(/UNIQUE constraint failed/);
  });
});

describe("applyRbacThreeRoleMigration (issue #10)", () => {
  function createRbacMigrationDb(includeManager = true) {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "role" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL UNIQUE
      );
      CREATE TABLE "role_permission" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "role_id" TEXT NOT NULL,
        "permission" TEXT NOT NULL,
        UNIQUE ("role_id", "permission")
      );
      INSERT INTO "role" ("id", "key") VALUES
        ('role-admin', 'admin'), ('role-viewer', 'viewer');
      INSERT INTO "role_permission" ("id", "role_id", "permission") VALUES
        ('permission-legacy', 'role-admin', 'employees.create');
    `);
    if (includeManager) {
      db.prepare('INSERT INTO "role" ("id", "key") VALUES (?, ?)').run(
        "role-manager",
        "manager",
      );
    }
    return db;
  }

  it("removes duplicate legacy permissions before normalizing", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "role" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL UNIQUE
      );
      CREATE TABLE "role_permission" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "role_id" TEXT NOT NULL,
        "permission" TEXT NOT NULL,
        UNIQUE ("role_id", "permission")
      );
      INSERT INTO "role" ("id", "key") VALUES
        ('role-admin', 'admin'), ('role-manager', 'manager'), ('role-viewer', 'viewer');
      INSERT INTO "role_permission" ("id", "role_id", "permission") VALUES
        ('permission-legacy', 'role-manager', 'employees.create'),
        ('permission-current', 'role-manager', 'employees:create');
    `);

    await applyRbacThreeRoleMigration(new BetterSqlite3Executor(db));

    const permissions = db
      .prepare('SELECT "permission" FROM "role_permission" WHERE "role_id" = ?')
      .all("role-manager") as Array<{ permission: string }>;
    expect(permissions).toEqual([{ permission: "employees:create" }]);

    const [migration] = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(rbacThreeRoleMigrationKey) as Array<{ key: string }>;
    expect(migration?.key).toBe(rbacThreeRoleMigrationKey);
  });

  it("skips all work when the migration key already exists", async () => {
    const db = createRbacMigrationDb();
    db
      .prepare('INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)')
      .run(rbacThreeRoleMigrationKey, new Date().toISOString());

    await applyRbacThreeRoleMigration(new BetterSqlite3Executor(db));

    const [permission] = db
      .prepare('SELECT "permission" FROM "role_permission" WHERE "id" = ?')
      .all("permission-legacy") as Array<{ permission: string }>;
    expect(permission?.permission).toBe("employees.create");
  });

  it("normalizes permission format and records the key without consolidating roles (issue #20)", async () => {
    const db = createRbacMigrationDb(false);

    // The migration no longer requires/consolidates a manager role: it only
    // normalizes resource.action → resource:colon and records the key.
    await expect(applyRbacThreeRoleMigration(new BetterSqlite3Executor(db))).resolves.toBeUndefined();

    const [permission] = db
      .prepare('SELECT "permission" FROM "role_permission" WHERE "id" = ?')
      .all("permission-legacy") as Array<{ permission: string }>;
    expect(permission?.permission).toBe("employees:create");

    const stateRows = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(rbacThreeRoleMigrationKey);
    expect(stateRows).toHaveLength(1);
  });
});

// Issue #335: payment_allocation.payment_id FK must be ON DELETE RESTRICT so a
// raw DELETE FROM "payment" fails loudly instead of silently cascade-deleting
// allocations while the invoice stays PAID and the debt entry stays booked.
// SQLite cannot ALTER an FK constraint, so the migration rebuilds the table.
describe("applyPaymentAllocationRestrictMigration (issue #335)", () => {
  const LEGACY_TABLE_SQL = `CREATE TABLE "payment_allocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "payment_allocation_payment_id_fkey"
      FOREIGN KEY ("payment_id") REFERENCES "payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`;

  function createLegacyDb() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "payment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "total_amount" REAL NOT NULL,
        "created_at" TEXT NOT NULL
      );
      CREATE TABLE "invoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "total_amount" REAL NOT NULL,
        "created_at" TEXT NOT NULL
      );
    `);
    db.exec(LEGACY_TABLE_SQL);
    db.prepare(
      'INSERT INTO "payment" ("id", "total_amount", "created_at") VALUES (?, ?, ?)',
    ).run("pmt-1", 1000, "2026-01-01T00:00:00.000Z");
    db.prepare(
      'INSERT INTO "invoice" ("id", "total_amount", "created_at") VALUES (?, ?, ?)',
    ).run("inv-1", 1000, "2026-01-01T00:00:00.000Z");
    db.prepare(
      'INSERT INTO "payment_allocation" ("id", "payment_id", "invoice_id", "amount", "created_at") VALUES (?, ?, ?, ?, ?)',
    ).run("alloc-1", "pmt-1", "inv-1", 1000, "2026-01-01T00:00:00.000Z");
    return db;
  }

  function getTableSql(db: Database.Database, table: string) {
    return (
      db
        .prepare('SELECT "sql" FROM "sqlite_master" WHERE "type" = ? AND "name" = ?')
        .get("table", table) as { sql: string }
    ).sql;
  }

  function getPaymentIdFkeyLine(db: Database.Database) {
    return getTableSql(db, "payment_allocation")
      .split("\n")
      .find((line) =>
        line.includes('FOREIGN KEY ("payment_id") REFERENCES "payment"'),
      )!;
  }

  it("rebuilds payment_allocation with ON DELETE RESTRICT and preserves rows on a legacy DB", async () => {
    const db = createLegacyDb();
    expect(getPaymentIdFkeyLine(db)).toContain("ON DELETE CASCADE");

    await applyPaymentAllocationRestrictMigration(asDbExecutor(db));

    // payment_id FK is now RESTRICT; the invoice_id FK keeps its CASCADE.
    expect(getPaymentIdFkeyLine(db)).toContain("ON DELETE RESTRICT");
    expect(getPaymentIdFkeyLine(db)).not.toContain("ON DELETE CASCADE");
    expect(getTableSql(db, "payment_allocation")).toContain(
      'FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE CASCADE',
    );

    // Data preserved across the rebuild.
    const alloc = db
      .prepare('SELECT "payment_id", "amount" FROM "payment_allocation" WHERE "id" = ?')
      .get("alloc-1") as { payment_id: string; amount: number };
    expect(alloc.payment_id).toBe("pmt-1");
    expect(alloc.amount).toBe(1000);

    // Migration key recorded.
    const [keyRow] = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(paymentAllocationRestrictMigrationKey) as Array<{ key: string }>;
    expect(keyRow?.key).toBe(paymentAllocationRestrictMigrationKey);

    // The rebuilt FK is enforced: a raw delete of the allocated payment
    // now fails loudly instead of cascade-deleting the allocation.
    expect(() =>
      db.prepare('DELETE FROM "payment" WHERE "id" = ?').run("pmt-1"),
    ).toThrow(/FOREIGN KEY constraint failed/i);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM "payment_allocation"').get() as { c: number }).c,
    ).toBe(1);
  });

  it("is a no-op on a DB where the migration has already run (state key guard)", async () => {
    const db = createLegacyDb();
    await applyPaymentAllocationRestrictMigration(asDbExecutor(db));
    const sqlAfterFirst = getTableSql(db, "payment_allocation");

    await applyPaymentAllocationRestrictMigration(asDbExecutor(db));

    expect(getTableSql(db, "payment_allocation")).toBe(sqlAfterFirst);
    const keys = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(paymentAllocationRestrictMigrationKey) as Array<{ key: string }>;
    expect(keys).toHaveLength(1);
  });

  it("records the state key without rebuilding on a fresh DB that already uses RESTRICT", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "payment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "total_amount" REAL NOT NULL,
        "created_at" TEXT NOT NULL
      );
      CREATE TABLE "invoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "total_amount" REAL NOT NULL,
        "created_at" TEXT NOT NULL
      );
    `);
    db.exec(
      LEGACY_TABLE_SQL.replace("ON DELETE CASCADE", "ON DELETE RESTRICT"),
    );
    db.prepare(
      'INSERT INTO "payment" ("id", "total_amount", "created_at") VALUES (?, ?, ?)',
    ).run("pmt-1", 1000, "2026-01-01T00:00:00.000Z");
    db.prepare(
      'INSERT INTO "payment_allocation" ("id", "payment_id", "invoice_id", "amount", "created_at") VALUES (?, ?, ?, ?, ?)',
    ).run("alloc-1", "pmt-1", "inv-1", 1000, "2026-01-01T00:00:00.000Z");

    await applyPaymentAllocationRestrictMigration(asDbExecutor(db));

    expect(getTableSql(db, "payment_allocation")).toContain("ON DELETE RESTRICT");
    const [keyRow] = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(paymentAllocationRestrictMigrationKey) as Array<{ key: string }>;
    expect(keyRow?.key).toBe(paymentAllocationRestrictMigrationKey);
  });

  it("rebuilds when only another FK (invoice_id) is RESTRICT but payment_id is still CASCADE", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE "app_schema_state" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "executed_at" DATETIME NOT NULL
      );
      CREATE TABLE "payment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "total_amount" REAL NOT NULL,
        "created_at" TEXT NOT NULL
      );
      CREATE TABLE "invoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "total_amount" REAL NOT NULL,
        "created_at" TEXT NOT NULL
      );
    `);
    // payment_id keeps the legacy CASCADE; only the invoice_id FK is RESTRICT.
    // An unscoped `ON DELETE RESTRICT` scan of the DDL would wrongly take the
    // no-rebuild fast path and leave payment_id cascade-deletable.
    db.exec(`CREATE TABLE "payment_allocation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "payment_id" TEXT NOT NULL,
      "invoice_id" TEXT NOT NULL,
      "amount" REAL NOT NULL,
      "created_at" TEXT NOT NULL,
      CONSTRAINT "payment_allocation_payment_id_fkey"
        FOREIGN KEY ("payment_id") REFERENCES "payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "payment_allocation_invoice_id_fkey"
        FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`);
    db.prepare(
      'INSERT INTO "payment" ("id", "total_amount", "created_at") VALUES (?, ?, ?)',
    ).run("pmt-1", 1000, "2026-01-01T00:00:00.000Z");
    db.prepare(
      'INSERT INTO "invoice" ("id", "total_amount", "created_at") VALUES (?, ?, ?)',
    ).run("inv-1", 1000, "2026-01-01T00:00:00.000Z");
    db.prepare(
      'INSERT INTO "payment_allocation" ("id", "payment_id", "invoice_id", "amount", "created_at") VALUES (?, ?, ?, ?, ?)',
    ).run("alloc-1", "pmt-1", "inv-1", 1000, "2026-01-01T00:00:00.000Z");

    await applyPaymentAllocationRestrictMigration(asDbExecutor(db));

    // The rebuild ran (not the fast path): payment_id is now RESTRICT.
    expect(getPaymentIdFkeyLine(db)).toContain("ON DELETE RESTRICT");
    expect(getPaymentIdFkeyLine(db)).not.toContain("ON DELETE CASCADE");
    const [keyRow] = db
      .prepare('SELECT "key" FROM "app_schema_state" WHERE "key" = ?')
      .all(paymentAllocationRestrictMigrationKey) as Array<{ key: string }>;
    expect(keyRow?.key).toBe(paymentAllocationRestrictMigrationKey);

    // The rebuilt FK is enforced: a raw delete of the allocated payment fails
    // loudly instead of cascade-deleting the allocation.
    expect(() =>
      db.prepare('DELETE FROM "payment" WHERE "id" = ?').run("pmt-1"),
    ).toThrow(/FOREIGN KEY constraint failed/i);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM "payment_allocation"').get() as { c: number }).c,
    ).toBe(1);
  });
});
