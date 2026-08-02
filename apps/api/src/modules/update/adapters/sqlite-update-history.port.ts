/**
 * SqliteUpdateHistoryPort — SQLite implementation of UpdateHistoryPort.
 *
 * The `update_history` persistence is intrinsically SQLite-specific
 * (raw SQL against the local database), so it lives here in the adapter
 * rather than in the service. Row shapes and 0/1 → boolean normalization
 * never leak past this boundary.
 */
import type { RecordUpdateInput, UpdateRecord } from "@tuari/contracts";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { UpdateHistoryPort } from "../update-history.types";

/**
 * Row shape of the `update_history` table as read back by this adapter.
 * `success` is stored as 0/1 and normalized to a boolean on read.
 */
type UpdateHistoryRow = {
  id: number;
  version: string;
  appliedAt: string;
  success: number;
  errorMessage: string | null;
};

export class SqliteUpdateHistoryPort implements UpdateHistoryPort {
  constructor(private readonly db: BetterSqliteDatabase) {}

  recordUpdate(input: RecordUpdateInput): UpdateRecord {
    const appliedAt = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO "update_history" ("version", "applied_at", "success", "error_message")
       VALUES (?, ?, ?, ?)`,
    );
    const result = stmt.run(
      input.version,
      appliedAt,
      input.success ? 1 : 0,
      input.errorMessage ?? null,
    );
    return {
      id: result.lastInsertRowid as number,
      version: input.version,
      appliedAt,
      success: input.success,
      errorMessage: input.errorMessage ?? null,
    };
  }

  getHistory(limit = 50): UpdateRecord[] {
    const stmt = this.db.prepare(
      `SELECT "id", "version", "applied_at" AS "appliedAt", "success", "error_message" AS "errorMessage"
       FROM "update_history"
       ORDER BY "applied_at" DESC, "id" DESC
       LIMIT ?`,
    );
    const rows = stmt.all(limit) as unknown as UpdateHistoryRow[];
    return rows.map((row) => ({
      ...row,
      success: row.success === 1,
    }));
  }

  getLatestUpdate(): UpdateRecord | null {
    const stmt = this.db.prepare(
      `SELECT "id", "version", "applied_at" AS "appliedAt", "success", "error_message" AS "errorMessage"
       FROM "update_history"
       ORDER BY "applied_at" DESC, "id" DESC
       LIMIT 1`,
    );
    const row = stmt.get() as unknown as UpdateHistoryRow | undefined;
    if (!row) return null;
    return {
      ...row,
      success: row.success === 1,
    };
  }
}
