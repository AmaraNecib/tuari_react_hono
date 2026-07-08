/**
 * Tests for the Migration Runner (Issue #124).
 *
 * Uses the same `BetterSqlite3Executor` from production code so that
 * savepoint-based transactions properly support rollback semantics.
 *
 * Covers:
 *   - Happy path: running pending migrations in a transaction
 *   - Idempotency: already-executed migrations are skipped
 *   - Unknown keys in app_schema_state are silently logged and skipped
 *   - Failed migration rolls back the transaction
 *   - Manifest validation (missing key, missing up, empty manifest)
 *   - Multiple migrations batch execution
 */

import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

import { BetterSqlite3Executor } from "./sqlite-executor";
import type { DbExecutor } from "./schema";
import { runMigrations, type MigrationManifest } from "./migration-runner";

// ─── Helpers ──────────────────────────────────────────────────────

function createFreshDb(): Database.Database {
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

function createDbWithExistingKeys(): Database.Database {
  const db = createFreshDb();
  db.prepare(
    'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
  ).run("migration_already_done_v1", new Date().toISOString());
  return db;
}

function getExecutedKeys(db: Database.Database): string[] {
  return (db
    .prepare('SELECT "key" FROM "app_schema_state" ORDER BY "key"')
    .all() as Array<{ key: string }>)
    .map((row) => row.key);
}

function hasTableRow(db: Database.Database, table: string): number {
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
      .get() as { count: number };
    return row.count;
  } catch {
    return -1; // table doesn't exist
  }
}

// ─── Tests ────────────────────────────────────────────────────────

describe("runMigrations (Issue #124)", () => {
  describe("manifest validation", () => {
    it("rejects a manifest with no migrations array", async () => {
      const db = createFreshDb();
      const manifest = { version: "1.0.0" } as MigrationManifest;

      await expect(
        runMigrations(new BetterSqlite3Executor(db), manifest),
      ).rejects.toThrow(/migrations.*must be an array/i);
    });

    it("rejects a migration entry with empty key", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          { key: "", description: "missing key", up: "SELECT 1" },
        ],
      };

      await expect(
        runMigrations(new BetterSqlite3Executor(db), manifest),
      ).rejects.toThrow(/empty or missing key/i);
    });

    it("rejects a migration entry with no up statement", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          { key: "no_up_v1", description: "no up", up: "" },
        ],
      };

      await expect(
        runMigrations(new BetterSqlite3Executor(db), manifest),
      ).rejects.toThrow(/no up statement/i);
    });

    it("rejects duplicate keys within the same manifest", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          { key: "dup_v1", up: "SELECT 1" },
          { key: "dup_v1", up: "SELECT 2" },
        ],
      };

      await expect(
        runMigrations(new BetterSqlite3Executor(db), manifest),
      ).rejects.toThrow(/duplicate/i);
    });

    it("accepts a valid empty migrations array (no-op)", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [],
      };

      const result = await runMigrations(
        new BetterSqlite3Executor(db),
        manifest,
      );
      expect(result.executed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe("happy path — running pending migrations", () => {
    it("executes a single migration and records its key", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          {
            key: "create_test_table_v1",
            description: "Create a test table",
            up: 'CREATE TABLE "test_entity" ("id" TEXT NOT NULL PRIMARY KEY, "label" TEXT);',
          },
        ],
      };

      const result = await runMigrations(
        new BetterSqlite3Executor(db),
        manifest,
      );

      expect(result.executed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toHaveLength(0);

      // Table should exist now
      expect(hasTableRow(db, "test_entity")).toBe(0);

      // Key should be recorded
      expect(getExecutedKeys(db)).toContain("create_test_table_v1");
    });

    it("executes multiple migrations in order", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          {
            key: "create_table_a_v1",
            up: 'CREATE TABLE "table_a" ("id" TEXT NOT NULL PRIMARY KEY, "val" INTEGER);',
          },
          {
            key: "create_table_b_v1",
            up: 'CREATE TABLE "table_b" ("id" TEXT NOT NULL PRIMARY KEY, "ref" TEXT REFERENCES "table_a" ("id"));',
          },
        ],
      };

      const result = await runMigrations(
        new BetterSqlite3Executor(db),
        manifest,
      );

      expect(result.executed).toBe(2);
      expect(result.failed).toHaveLength(0);
      expect(getExecutedKeys(db)).toEqual([
        "create_table_a_v1",
        "create_table_b_v1",
      ]);
      expect(hasTableRow(db, "table_a")).toBe(0);
      expect(hasTableRow(db, "table_b")).toBe(0);
    });

    it("supports multi-statement up via string array", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          {
            key: "multi_stmt_v1",
            description: "Multiple statements",
            up: [
              'CREATE TABLE "multi_a" ("id" TEXT NOT NULL PRIMARY KEY);',
              'CREATE TABLE "multi_b" ("id" TEXT NOT NULL PRIMARY KEY);',
            ],
          },
        ],
      };

      const result = await runMigrations(
        new BetterSqlite3Executor(db),
        manifest,
      );

      expect(result.executed).toBe(1);
      expect(result.failed).toHaveLength(0);
      expect(hasTableRow(db, "multi_a")).toBe(0);
      expect(hasTableRow(db, "multi_b")).toBe(0);
    });
  });

  describe("idempotency", () => {
    it("skips migrations whose keys already exist in app_schema_state", async () => {
      const db = createDbWithExistingKeys();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          {
            key: "migration_already_done_v1",
            up: 'CREATE TABLE "should_not_exist" ("id" TEXT NOT NULL PRIMARY KEY);',
          },
          {
            key: "migration_new_v1",
            up: 'CREATE TABLE "new_table" ("id" TEXT NOT NULL PRIMARY KEY);',
          },
        ],
      };

      const result = await runMigrations(
        new BetterSqlite3Executor(db),
        manifest,
      );

      expect(result.executed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.failed).toHaveLength(0);

      // The already-done migration's up should NOT have been executed
      expect(hasTableRow(db, "should_not_exist")).toBe(-1);
      // The new one should have been
      expect(hasTableRow(db, "new_table")).toBe(0);

      // Only the new key should be recorded (the old one was already there)
      expect(getExecutedKeys(db)).toContain("migration_already_done_v1");
      expect(getExecutedKeys(db)).toContain("migration_new_v1");
    });

    it("re-running on a fully migrated DB is a no-op", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          {
            key: "first_v1",
            up: 'CREATE TABLE "first" ("id" TEXT NOT NULL PRIMARY KEY);',
          },
        ],
      };

      // First run
      const r1 = await runMigrations(new BetterSqlite3Executor(db), manifest);
      expect(r1.executed).toBe(1);

      // Second run — same manifest
      const r2 = await runMigrations(new BetterSqlite3Executor(db), manifest);
      expect(r2.executed).toBe(0);
      expect(r2.skipped).toBe(1);
      expect(r2.failed).toHaveLength(0);
    });
  });

  describe("unknown keys in app_schema_state (§18.2 rule)", () => {
    it("logs and silently skips unknown keys that are not in the manifest", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const db = createFreshDb();
      // Pre-populate with keys that don't exist in the manifest
      db.prepare(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      ).run("unknown_migration_v1", new Date().toISOString());
      db.prepare(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      ).run("dropped_migration_v2", new Date().toISOString());

      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [{ key: "current_migration_v3", up: "SELECT 1" }],
      };

      const result = await runMigrations(
        new BetterSqlite3Executor(db),
        manifest,
      );

      // Should have logged warnings about the unknown keys
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("unknown_migration_v1"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("dropped_migration_v2"),
      );

      // Should have only run the current migration
      expect(result.executed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe("transaction rollback on failure (§18.1.7)", () => {
    it("rolls back ALL pending migrations if one fails", async () => {
      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          {
            key: "good_v1",
            up: 'CREATE TABLE "good_table" ("id" TEXT NOT NULL PRIMARY KEY);',
          },
          {
            key: "bad_v1",
            up: "THIS IS NOT VALID SQL",
          },
          {
            key: "never_reached_v1",
            up: 'CREATE TABLE "never_table" ("id" TEXT NOT NULL PRIMARY KEY);',
          },
        ],
      };

      await expect(
        runMigrations(new BetterSqlite3Executor(db), manifest),
      ).rejects.toThrow();

      // good_table should NOT exist because the transaction was rolled back
      expect(hasTableRow(db, "good_table")).toBe(-1);
      expect(hasTableRow(db, "never_table")).toBe(-1);

      // Neither key should be recorded
      expect(getExecutedKeys(db)).not.toContain("good_v1");
      expect(getExecutedKeys(db)).not.toContain("bad_v1");
      expect(getExecutedKeys(db)).not.toContain("never_reached_v1");
    });

    it("does not roll back previously-recorded migrations", async () => {
      const db = createDbWithExistingKeys();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          {
            key: "migration_already_done_v1",
            up: 'CREATE TABLE "should_not_recreate" ("id" TEXT NOT NULL PRIMARY KEY);',
          },
          {
            key: "failing_v1",
            up: "INVALID SQL",
          },
        ],
      };

      await expect(
        runMigrations(new BetterSqlite3Executor(db), manifest),
      ).rejects.toThrow();

      // The already-done key should still be in app_schema_state
      expect(getExecutedKeys(db)).toContain("migration_already_done_v1");
      // The failing key should NOT be recorded
      expect(getExecutedKeys(db)).not.toContain("failing_v1");
    });
  });

  describe("error details in result", () => {
    it("logs the failing migration error with its key", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const db = createFreshDb();
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [{ key: "failing_v1", up: "INVALID SQL" }],
      };

      await expect(
        runMigrations(new BetterSqlite3Executor(db), manifest),
      ).rejects.toThrow("failing_v1");

      // Should have logged the error with context
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("failing_v1"),
      );

      errorSpy.mockRestore();
    });
  });

  describe("result summary", () => {
    it("returns accurate counts for mixed executed/skipped scenarios", async () => {
      const db = createDbWithExistingKeys(); // has "migration_already_done_v1"
      const manifest: MigrationManifest = {
        version: "1.0.0",
        migrations: [
          { key: "migration_already_done_v1", up: "SELECT 1" },
          { key: "executed_v1", up: "SELECT 1" },
        ],
      };

      const result = await runMigrations(
        new BetterSqlite3Executor(db),
        manifest,
      );

      expect(result.executed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.failed).toHaveLength(0);
      expect(result.total).toBe(2);
    });
  });
});
