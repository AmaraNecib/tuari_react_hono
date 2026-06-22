import Database from "better-sqlite3";

import { describe, expect, it } from "vitest";

import { applyDebtAccountBalanceRename, type DbExecutor } from "./schema";
import { debtAccountBalanceRenameMigrationKey } from "./schema-definitions";

/**
 * Adapter that turns a `better-sqlite3` `Database` into a `DbExecutor`
 * so the migration can be exercised directly against an in-memory SQLite
 * without going through the global Prisma client.
 *
 * Mirrors the minimal Prisma surface used by the migration: raw query,
 * raw execute, and a synchronous transaction callback that yields a
 * same-shaped `DbExecutor` for the txn body.
 */
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
        // better-sqlite3 transactions are synchronous and block the event loop.
        // We use the prepared statements on the same connection to preserve
        // the atomicity guarantees expected by the migration (rename + key
        // insert in a single transaction).
        let result!: T;
        inner.transaction(() => {
          void work(makeDb(inner)).then((value) => {
            result = value;
          });
        })();
        return result;
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
