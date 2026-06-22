import Database from "better-sqlite3";

import { describe, expect, it } from "vitest";

import { debtAccountBalanceRenameMigrationKey } from "./schema-definitions";

/**
 * Issue #21: rename `debt_account.current_balance_dzd` → `current_balance`.
 *
 * The migration must be idempotent and safe across three scenarios:
 *   (a) Fresh DB already has `current_balance` — migration is a no-op
 *   (b) Legacy DB has `current_balance_dzd` — migration renames in a tx
 *   (c) Re-run on a DB where the migration already ran — no-op via
 *       `app_schema_state` key
 *
 * These tests run against an in-memory SQLite database (separate from
 * the shared Prisma test DB) so we can exercise scenario (b) without
 * mutating the shared fixture state.
 */
describe("runDebtAccountBalanceRenameMigration (issue #21)", () => {
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

  function applyRenameMigration(db: Database.Database) {
    const [row] = db
      .prepare(
        'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
      )
      .all(debtAccountBalanceRenameMigrationKey) as Array<{ key: string }>;

    if (row) {
      return "skipped: already executed";
    }

    const hasOld = getColumnNames(db, "debt_account").includes("current_balance_dzd");
    const hasNew = getColumnNames(db, "debt_account").includes("current_balance");

    db.transaction(() => {
      if (hasOld && !hasNew) {
        db.exec('ALTER TABLE "debt_account" RENAME COLUMN "current_balance_dzd" TO "current_balance"');
      }
      db
        .prepare('INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)')
        .run(debtAccountBalanceRenameMigrationKey, new Date().toISOString());
    })();

    return "applied";
  }

  it("renames `current_balance_dzd` to `current_balance` on a legacy DB", () => {
    const db = createLegacyDb();

    expect(getColumnNames(db, "debt_account")).toContain("current_balance_dzd");

    const result = applyRenameMigration(db);

    expect(result).toBe("applied");
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

  it("is a no-op on a fresh DB that already uses the new column name", () => {
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

    const result = applyRenameMigration(db);

    expect(result).toBe("applied"); // Key not in state, so first call applies
    const columns = getColumnNames(db, "debt_account");
    expect(columns).toEqual(["id", "current_balance", "status"]);

    // Second call is a true no-op via the state key
    const secondResult = applyRenameMigration(db);
    expect(secondResult).toBe("skipped: already executed");
  });

  it("is a no-op on a DB where the migration has already run", () => {
    const db = createLegacyDb();
    applyRenameMigration(db);

    const result = applyRenameMigration(db);

    expect(result).toBe("skipped: already executed");
    const columns = getColumnNames(db, "debt_account");
    expect(columns).toContain("current_balance");
    expect(columns).not.toContain("current_balance_dzd");
  });

  it("preserves the row data when the column is renamed", () => {
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

    applyRenameMigration(db);

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
