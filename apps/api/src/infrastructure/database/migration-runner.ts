/**
 * Migration Runner — Issue #124 — M4.2 Database Migration Execution.
 *
 * Reads a `migrations.json` manifest (parsed into a {@link MigrationManifest}),
 * compares migration keys against the `app_schema_state` table, and runs
 * pending migrations within a transaction.
 *
 * Architecture: docs/update-architecture.md §18
 *
 * Rules (§18.2):
 *   - MINOR/PATCH migrations are additive only (enforced by the caller)
 *   - Every migration has a unique key
 *   - Unknown migration keys in `app_schema_state` are logged and silently skipped
 *   - On failure: roll back transaction, log error, throw
 */

import type { DbExecutor } from "./schema";

// ─── Types ────────────────────────────────────────────────────────

/** A single migration definition from the manifest. */
export interface MigrationDef {
  /** Globally unique key, recorded in `app_schema_state` after execution. */
  key: string;
  /** Optional human-readable description. */
  description?: string;
  /**
   * SQL statement(s) to execute.
   * A single string or an array of strings (each executed in order).
   */
  up: string | string[];
}

/** The parsed `migrations.json` structure. */
export interface MigrationManifest {
  /** Schema version for the manifest format itself (e.g. "1.0.0"). */
  version: string;
  /** Ordered list of migrations to apply. */
  migrations: MigrationDef[];
}

/** Summary of a migration run. */
export interface MigrationResult {
  /** Number of migrations that were executed. */
  executed: number;
  /** Number of migrations skipped because they were already recorded. */
  skipped: number;
  /** Migrations that failed (empty on success). */
  failed: Array<{ key: string; error: string }>;
  /** Total number of migrations in the manifest. */
  total: number;
}

// ─── Internal validation ─────────────────────────────────────────

class ManifestValidationError extends Error {
  constructor(message: string) {
    super(`Migration manifest validation failed: ${message}`);
    this.name = "ManifestValidationError";
  }
}

/** Validate the manifest structure before execution. */
function validateManifest(manifest: MigrationManifest): void {
  if (!manifest.migrations || !Array.isArray(manifest.migrations)) {
    throw new ManifestValidationError("migrations must be an array");
  }

  const keys = new Set<string>();

  for (let i = 0; i < manifest.migrations.length; i++) {
    const m = manifest.migrations[i]!;

    if (!m.key || m.key.trim().length === 0) {
      throw new ManifestValidationError(
        `migration at index ${i} has an empty or missing key`,
      );
    }

    if (keys.has(m.key)) {
      throw new ManifestValidationError(
        `duplicate migration key "${m.key}" at index ${i}`,
      );
    }
    keys.add(m.key);

    const upStatements = Array.isArray(m.up) ? m.up : [m.up];
    if (upStatements.length === 0 || upStatements.every((s) => s.trim().length === 0)) {
      throw new ManifestValidationError(
        `migration "${m.key}" has no up statement(s)`,
      );
    }
  }
}

// ─── Internal helpers ────────────────────────────────────────────

/** Load all already-executed migration keys from the database. */
async function loadExecutedKeys(db: DbExecutor): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state"',
  );
  return new Set(rows.map((row) => row.key));
}

/** Execute a single migration's up statement(s) within the transaction. */
async function executeMigrationUp(
  tx: DbExecutor,
  migration: MigrationDef,
): Promise<void> {
  const statements = Array.isArray(migration.up) ? migration.up : [migration.up];

  for (const sql of statements) {
    const trimmed = sql.trim();
    if (trimmed.length === 0) continue;
    await tx.$executeRawUnsafe(trimmed);
  }
}

/** Record a migration key in app_schema_state. */
async function recordMigrationKey(
  tx: DbExecutor,
  key: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
    key,
    new Date().toISOString(),
  );
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Run pending migrations from a manifest against the given database.
 *
 * @param db - An active database executor.
 * @param manifest - The parsed migrations.json manifest.
 * @returns A summary of what was executed, skipped, and any failures.
 * @throws If the manifest is invalid or a migration fails (transaction rolled back).
 */
export async function runMigrations(
  db: DbExecutor,
  manifest: MigrationManifest,
): Promise<MigrationResult> {
  validateManifest(manifest);

  const executedKeys = await loadExecutedKeys(db);

  // Build the ordered list of pending migrations.
  const pending = manifest.migrations.filter(
    (m) => !executedKeys.has(m.key),
  );
  const skipped = manifest.migrations.length - pending.length;

  // Log unknown keys (in app_schema_state but not in the manifest).
  const manifestKeys = new Set(manifest.migrations.map((m) => m.key));
  for (const key of executedKeys) {
    if (!manifestKeys.has(key)) {
      console.warn(
        `[MigrationRunner] Unknown migration key "${key}" found in app_schema_state — it was likely removed from the migrations manifest. Skipping silently.`,
      );
    }
  }

  if (pending.length === 0) {
    return {
      executed: 0,
      skipped,
      failed: [],
      total: manifest.migrations.length,
    };
  }

  // Run all pending migrations in a single transaction.
  await db.$transaction(async (tx) => {
    for (const migration of pending) {
      try {
        await executeMigrationUp(tx, migration);
        await recordMigrationKey(tx, migration.key);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[MigrationRunner] Migration "${migration.key}" failed: ${message}`,
        );
        throw new Error(
          `Migration "${migration.key}" failed: ${message}`,
        );
      }
    }
  });

  return {
    executed: pending.length,
    skipped,
    failed: [],
    total: manifest.migrations.length,
  };
}
