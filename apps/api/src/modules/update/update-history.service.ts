/**
 * UpdateHistoryService — records applied application updates (M4.3).
 *
 * The Rust Updater Engine calls into this service after each update
 * attempt to persist the result in the `update_history` table.
 */
import type { UpdateRecord, RecordUpdateInput } from "@tuari/contracts";
import type { BetterSqliteDatabase } from "../../types/sqlite";

export class UpdateHistoryService {
  constructor(private readonly db: BetterSqliteDatabase) {}

  /**
   * Record an applied (or failed) update in the history table.
   * Returns the newly created record.
   */
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

  /**
   * Return all update history records, most recent first.
   */
  getHistory(limit = 50): UpdateRecord[] {
    const stmt = this.db.prepare(
      `SELECT "id", "version", "applied_at" AS "appliedAt", "success", "error_message" AS "errorMessage"
       FROM "update_history"
       ORDER BY "id" DESC
       LIMIT ?`,
    );
    return stmt.all(limit).map((row: any) => ({
      ...row,
      success: row.success === 1,
    }));
  }

  /**
   * Return the most recent update record, or null if none exist.
   */
  getLatestUpdate(): UpdateRecord | null {
    const stmt = this.db.prepare(
      `SELECT "id", "version", "applied_at" AS "appliedAt", "success", "error_message" AS "errorMessage"
       FROM "update_history"
       ORDER BY "id" DESC
       LIMIT 1`,
    );
    const row = stmt.get() as any;
    if (!row) return null;
    return {
      ...row,
      success: row.success === 1,
    };
  }
}
