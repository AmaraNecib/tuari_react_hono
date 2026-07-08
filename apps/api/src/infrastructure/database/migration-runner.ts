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
 *   - On failure: roll back transaction, log error, return failure (not throw)
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
  /** Number of migrations that were executed successfully. */
  executed: number;
  /** Number of migrations skipped because they were already recorded. */
  skipped: number;
  /**
   * Migrations that failed.
   * On success this is an empty array. On failure the entire batch was rolled
   * back (`executed` is 0) and this array contains the single failed migration.
   */
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
    if (
      upStatements.length === 0 ||
      upStatements.every((s) => s.trim().length === 0)
    ) {
      throw new ManifestValidationError(
        `migration "${m.key}" has no up statement(s)`,
      );
    }
  }
}

// ─── Internal helpers ────────────────────────────────────────────

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

/** Load already-executed migration keys from the database. */
async function loadExecutedKeys(
  tx: DbExecutor,
): Promise<Set<string>> {
  const rows = await tx.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state"',
  );
  return new Set(rows.map((row) => row.key));
}

/** Log unknown keys found in app_schema_state but not in the manifest. */
function logUnknownKeys(
  executedKeys: Set<string>,
  manifestKeys: Set<string>,
): void {
  for (const key of executedKeys) {
    if (!manifestKeys.has(key)) {
      console.warn(
        `[MigrationRunner] Unknown migration key "${key}" found in app_schema_state — ` +
          "it was likely removed from the migrations manifest. Skipping silently.",
      );
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Run pending migrations from a manifest against the given database.
 *
 * The entire migration batch (key loading, execution, recording) runs inside a
 * single transaction.  If any migration fails the transaction is rolled back,
 * the error is logged, and the failure is returned in {@link MigrationResult.failed}.
 * The function does **not** throw on migration runtime errors — callers should
 * check `result.failed.length > 0` to detect failure.
 *
 * @param db - An active database executor.
 * @param manifest - The parsed migrations.json manifest.
 * @returns A summary of what was executed, skipped, and any failures.
 * @throws {ManifestValidationError} If the manifest structure is invalid.
 */
export async function runMigrations(
  db: DbExecutor,
  manifest: MigrationManifest,
): Promise<MigrationResult> {
  validateManifest(manifest);

  const manifestKeys = new Set(manifest.migrations.map((m) => m.key));
  const total = manifest.migrations.length;

  // State captured from inside the transaction when a migration fails.
  // The outer catch block uses these to build the failure result.
  let capturedSkipped = 0;
  let capturedFailure: { key: string; error: string } | undefined;

  try {
    const result = await db.$transaction(async (tx) => {
      // Load already-executed keys inside the transaction so the key
      // snapshot, execution, and recording are atomic — no stale-snapshot
      // window where a concurrent call could see incomplete state.
      const executedKeys = await loadExecutedKeys(tx);
      logUnknownKeys(executedKeys, manifestKeys);

      const pending = manifest.migrations.filter(
        (m) => !executedKeys.has(m.key),
      );
      capturedSkipped = total - pending.length;

      if (pending.length === 0) {
        return {
          executed: 0,
          skipped: capturedSkipped,
          failed: [],
          total,
        };
      }

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
          capturedFailure = { key: migration.key, error: message };
          // Throw to trigger savepoint rollback (catches in outer try/catch).
          throw error;
        }
      }

      return {
        executed: pending.length,
        skipped: capturedSkipped,
        failed: [],
        total,
      };
    });

    // Transaction committed — every pending migration completed.
    return result;
  } catch (err) {
    // If capturedFailure was never set, this is an infrastructure failure
    // (e.g. loadExecutedKeys threw), not a migration SQL error.
    // Re-throw so callers can distinguish infrastructure errors from
    // migration-level rollbacks.
    if (!capturedFailure) {
      throw err;
    }

    // Migration SQL error — transaction was rolled back.  Return a
    // failure result.  The entire batch is reverted so `executed` is 0,
    // but `skipped` (migrations already in app_schema_state before this
    // call) is preserved.
    return {
      executed: 0,
      skipped: capturedSkipped,
      failed: [capturedFailure],
      total,
    };
  }
}
