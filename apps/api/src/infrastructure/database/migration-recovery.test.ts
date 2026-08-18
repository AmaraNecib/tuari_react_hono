/**
 * Recovery / rollback failure-mode tests for the `ensureDatabaseSchema`
 * migration functions (Issue #175 — M7 production hardening).
 *
 * The happy-path, idempotency and no-op behaviour of each migration is already
 * pinned by `schema-migrations.test.ts`. This file closes the gap on the
 * RECOVERY invariant that the milestone brief calls out:
 *
 *   When a migration fails PARTWAY through its own transaction, every earlier
 *   DDL/DML statement must be rolled back (schema left unchanged) AND the
 *   `app_schema_state` row for that migration's key must NOT be recorded —
 *   so the next startup's `ensureDatabaseSchema` re-attempts the migration
 *   instead of permanently skipping it on a half-applied schema.
 *
 * Failure injection (real executor, realistic DB): each migration records its
 * state key as the LAST statement inside a savepoint transaction
 * (`BetterSqlite3Executor.$transaction`). We inject a SQLite
 * `BEFORE INSERT` trigger on `app_schema_state` that aborts the FIRST
 * key-insert (`RAISE(ABORT)`) — exactly the statement that persists the
 * migration — while the real savepoint is still open. The real production
 * executor must then roll back all preceding DDL/DML and leave the key
 * unrecorded. Dropping the injected trigger and re-running the migration on
 * the SAME database is the "next startup" recovery story.
 *
 * Coverage boundary (deliberate): the failing statement IS the state-key
 * insert, so "key not recorded" follows from the failure point itself; the
 * genuinely independent rollback check is assertion (a) — that the earlier
 * DDL/DML (rename, index swap, table rebuild, role deletion) did not survive.
 * That asymmetry mirrors production: the key is written last, so a key
 * without committed DDL is impossible, while DDL without a committed key must
 * not be possible either.
 */

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  applyDebtAccountBalanceRename,
  applyDebtAccountDirectionMigration,
  applyPaymentAllocationRestrictMigration,
  applyRbacThreeRoleMigration,
} from "./schema";
import {
  debtAccountBalanceRenameMigrationKey,
  debtAccountDirectionMigrationKey,
  paymentAllocationRestrictMigrationKey,
  rbacThreeRoleMigrationKey,
} from "./schema-definitions";
import { BetterSqlite3Executor } from "./sqlite-executor";
import type { DbExecutor } from "./schema";

// ─── Helpers ──────────────────────────────────────────────────────

/** A normal, well-formed in-memory DB with an empty `app_schema_state`. */
function normalStateDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE "app_schema_state" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "executed_at" DATETIME NOT NULL
    );
  `);
  return db;
}

/**
 * Arm the injected failure: the FIRST insert into `app_schema_state` raises
 * ABORT, exactly the statement that would record a migration key. The failure
 * happens inside the migration's open savepoint, so the real executor must
 * roll the savepoint back.
 */
function armFailOnFirstStateInsert(db: Database.Database): void {
  db.exec(`
    CREATE TRIGGER "test_fail_first_state_insert"
    BEFORE INSERT ON "app_schema_state"
    WHEN (SELECT COUNT(*) FROM "app_schema_state") = 0
    BEGIN
      SELECT RAISE(ABORT, 'injected migration failure');
    END
  `);
}

function ex(db: Database.Database): DbExecutor {
  return new BetterSqlite3Executor(db);
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db
    .prepare(`PRAGMA table_info("${table}")`)
    .all() as Array<{ name: string }>)
    .map((c) => c.name);
}

function indexNames(db: Database.Database, table: string): string[] {
  return (db
    .prepare(`PRAGMA index_list("${table}")`)
    .all() as Array<{ name: string }>)
    .map((i) => i.name);
}

function tableNames(db: Database.Database): string[] {
  return (db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>)
    .map((t) => t.name);
}

function stateKeys(db: Database.Database): string[] {
  return (db
    .prepare('SELECT "key" FROM "app_schema_state"')
    .all() as Array<{ key: string }>)
    .map((r) => r.key);
}

// ─── applyDebtAccountBalanceRename (Issue #21) ────────────────────

describe("applyDebtAccountBalanceRename — rollback recovery (§M7)", () => {
  function legacyDb(db: Database.Database): Database.Database {
    db.exec(`
      CREATE TABLE "debt_account" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "current_balance_dzd" REAL NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL
      );
      INSERT INTO "debt_account" ("id", "current_balance_dzd", "status") VALUES ('acct-1', 1500, 'OPEN');
    `);
    return db;
  }

  it("rolls back the rename and leaves the state key unrecorded on a mid-transaction failure", async () => {
    const db = legacyDb(normalStateDb());
    armFailOnFirstStateInsert(db);

    await expect(applyDebtAccountBalanceRename(ex(db))).rejects.toThrow(
      /injected migration failure/,
    );

    // Rollback (the independent invariant): the earlier rename did not survive.
    expect(columnNames(db, "debt_account")).toContain("current_balance_dzd");
    expect(columnNames(db, "debt_account")).not.toContain("current_balance");

    // Recovery signal: key NOT recorded → next startup re-attempts.
    expect(stateKeys(db)).not.toContain(debtAccountBalanceRenameMigrationKey);
  });

  it("recovers on the SAME database after the failure is resolved (next-startup retry)", async () => {
    const db = legacyDb(normalStateDb());
    armFailOnFirstStateInsert(db);

    // Startup #1 fails mid-migration; schema and state are left untouched.
    await expect(applyDebtAccountBalanceRename(ex(db))).rejects.toThrow(
      /injected migration failure/,
    );
    expect(stateKeys(db)).not.toContain(debtAccountBalanceRenameMigrationKey);
    expect(columnNames(db, "debt_account")).toContain("current_balance_dzd");

    // The underlying issue is resolved; the same database file re-runs startup.
    db.exec('DROP TRIGGER "test_fail_first_state_insert"');
    await applyDebtAccountBalanceRename(ex(db));

    // The retry applied the rename and recorded the key exactly once.
    expect(columnNames(db, "debt_account")).toContain("current_balance");
    expect(columnNames(db, "debt_account")).not.toContain("current_balance_dzd");
    expect(stateKeys(db)).toEqual([debtAccountBalanceRenameMigrationKey]);

    // Data survives the successful rename.
    const row = db
      .prepare('SELECT "current_balance" AS b FROM "debt_account" WHERE "id" = ?')
      .get("acct-1") as { b: number };
    expect(row.b).toBe(1500);
  });
});

// ─── applyDebtAccountDirectionMigration (Issue #22) ───────────────

describe("applyDebtAccountDirectionMigration — rollback recovery (§M7)", () => {
  function legacyDbWithSingleColumnIndex(db: Database.Database): Database.Database {
    db.exec(`
      CREATE TABLE "external_counterparty" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "debt_account" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "external_counterparty_id" TEXT,
        "direction" TEXT NOT NULL DEFAULT 'PAYABLE',
        "status" TEXT NOT NULL
      );
      CREATE UNIQUE INDEX "debt_account_external_counterparty_unique"
        ON "debt_account" ("external_counterparty_id");
    `);
    return db;
  }

  it("rolls back both the legacy-index DROP and the composite CREATE after a mid-transaction failure", async () => {
    const db = legacyDbWithSingleColumnIndex(normalStateDb());
    armFailOnFirstStateInsert(db);

    await expect(applyDebtAccountDirectionMigration(ex(db))).rejects.toThrow(
      /injected migration failure/,
    );

    const indexes = indexNames(db, "debt_account");
    // Legacy single-column unique index survived the rollback.
    expect(indexes).toContain("debt_account_external_counterparty_unique");
    // Composite index from the failed run was rolled back.
    expect(indexes).not.toContain(
      "debt_account_external_counterparty_direction_unique",
    );

    expect(stateKeys(db)).not.toContain(debtAccountDirectionMigrationKey);
  });
});

// ─── applyPaymentAllocationRestrictMigration (Issue #335) ─────────

describe("applyPaymentAllocationRestrictMigration — rollback recovery (§M7)", () => {
  function legacyDb(db: Database.Database): Database.Database {
    db.exec(`
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
      CREATE TABLE "payment_allocation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "payment_id" TEXT NOT NULL,
        "invoice_id" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "created_at" TEXT NOT NULL,
        CONSTRAINT "payment_allocation_payment_id_fkey"
          FOREIGN KEY ("payment_id") REFERENCES "payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "payment_allocation_invoice_id_fkey"
          FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      INSERT INTO "payment" ("id", "total_amount", "created_at") VALUES ('pmt-1', 1000, '2026-01-01T00:00:00.000Z');
      INSERT INTO "invoice" ("id", "total_amount", "created_at") VALUES ('inv-1', 1000, '2026-01-01T00:00:00.000Z');
      INSERT INTO "payment_allocation" ("id", "payment_id", "invoice_id", "amount", "created_at") VALUES ('alloc-1', 'pmt-1', 'inv-1', 1000, '2026-01-01T00:00:00.000Z');
    `);
    return db;
  }

  it("fully reverts the rename→create→copy→drop rebuild after a mid-transaction failure", async () => {
    const db = legacyDb(normalStateDb());
    armFailOnFirstStateInsert(db);

    await expect(applyPaymentAllocationRestrictMigration(ex(db))).rejects.toThrow(
      /injected migration failure/,
    );

    // Rebuild was rolled back: no legacy table leftover, live table intact.
    const tables = tableNames(db);
    expect(tables).toContain("payment_allocation");
    expect(tables).not.toContain("payment_allocation_legacy");

    // The live table is still the legacy CASCADE variant (rollback, not swallow).
    const tableSql = (
      db
        .prepare('SELECT "sql" FROM "sqlite_master" WHERE "type" = ? AND "name" = ?')
        .get("table", "payment_allocation") as { sql: string }
    ).sql;
    expect(tableSql).toContain("ON DELETE CASCADE");
    expect(tableSql).not.toContain("ON DELETE RESTRICT");

    // Rows preserved.
    const alloc = db
      .prepare('SELECT "payment_id", "amount" FROM "payment_allocation" WHERE "id" = ?')
      .get("alloc-1") as { payment_id: string; amount: number };
    expect(alloc.payment_id).toBe("pmt-1");
    expect(alloc.amount).toBe(1000);

    expect(stateKeys(db)).not.toContain(paymentAllocationRestrictMigrationKey);
  });
});

// ─── applyRbacThreeRoleMigration (Issue #10) ──────────────────────

describe("applyRbacThreeRoleMigration — rollback recovery (§M7)", () => {
  function legacyDbWithLegacyRole(db: Database.Database): Database.Database {
    db.exec(`
      CREATE TABLE "role" ("id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL UNIQUE);
      CREATE TABLE "role_permission" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "role_id" TEXT NOT NULL,
        "permission" TEXT NOT NULL,
        UNIQUE ("role_id", "permission")
      );
      CREATE TABLE "employee" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "first_name" TEXT NOT NULL,
        "last_name" TEXT NOT NULL,
        "phone" TEXT NOT NULL UNIQUE,
        "role_id" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "created_at" TEXT NOT NULL,
        "updated_at" TEXT NOT NULL
      );
      INSERT INTO "role" ("id", "key") VALUES
        ('role-admin', 'admin'),
        ('role-manager', 'manager'),
        ('role-viewer', 'viewer'),
        ('role-legacy-worker', 'worker');
      INSERT INTO "role_permission" ("id", "role_id", "permission") VALUES
        ('perm-legacy', 'role-legacy-worker', 'employees.create');
      INSERT INTO "employee" ("id", "first_name", "last_name", "phone", "role_id", "status", "created_at", "updated_at") VALUES
        ('emp-1', 'Mourad', 'Saadi', '0612345678', 'role-legacy-worker', 'ACTIVE', 'now', 'now');
    `);
    return db;
  }

  it("restores deleted legacy roles/permissions and leaves the key unrecorded after a mid-transaction failure", async () => {
    const db = legacyDbWithLegacyRole(normalStateDb());
    armFailOnFirstStateInsert(db);

    await expect(applyRbacThreeRoleMigration(ex(db))).rejects.toThrow(
      /injected migration failure/,
    );

    // The legacy `worker` role was rolled back (ready for the retry to drop it).
    const worker = db
      .prepare('SELECT "id" FROM "role" WHERE "key" = ?')
      .get("worker") as { id: string } | undefined;
    expect(worker?.id).toBe("role-legacy-worker");

    // Legacy permission row restored.
    const perm = db
      .prepare('SELECT "permission" FROM "role_permission" WHERE "id" = ?')
      .get("perm-legacy") as { permission: string } | undefined;
    expect(perm?.permission).toBe("employees.create");

    // Employee is back on the legacy worker role (reassignment rolled back).
    const emp = db
      .prepare('SELECT "role_id" FROM "employee" WHERE "id" = ?')
      .get("emp-1") as { role_id: string };
    expect(emp.role_id).toBe("role-legacy-worker");

    expect(stateKeys(db)).not.toContain(rbacThreeRoleMigrationKey);
  });

  it("recovers on the SAME database: the retry drops the legacy roles and records the key", async () => {
    const db = legacyDbWithLegacyRole(normalStateDb());
    armFailOnFirstStateInsert(db);

    // Startup #1 fails mid-migration; the destructive DML is fully rolled back.
    await expect(applyRbacThreeRoleMigration(ex(db))).rejects.toThrow(
      /injected migration failure/,
    );
    expect(stateKeys(db)).not.toContain(rbacThreeRoleMigrationKey);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM "role" WHERE "key" = ?').get("worker") as { c: number }).c,
    ).toBe(1);

    // Same database file, next startup: legacy roles are dropped and the key
    // is recorded exactly once.
    db.exec('DROP TRIGGER "test_fail_first_state_insert"');
    await applyRbacThreeRoleMigration(ex(db));

    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM "role" WHERE "key" = ?').get("worker") as { c: number }).c,
    ).toBe(0);
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM "role" WHERE "key" = ?').get("manager") as { c: number }).c,
    ).toBe(1);
    expect(stateKeys(db)).toEqual([rbacThreeRoleMigrationKey]);
  });
});