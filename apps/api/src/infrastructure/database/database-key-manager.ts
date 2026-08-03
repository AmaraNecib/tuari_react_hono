import type { BetterSqliteDatabase } from "../../types/sqlite";
import { escapeSqliteString } from "./factory";

/** Result of a database encryption-key change. Mirrors the RPC wire output. */
export type DatabaseKeyChangeResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Verifies and rotates the SQLCipher database encryption key on the shared
 * connection.
 *
 * The raw database handle never leaves the composition root — the router and
 * system handlers receive this narrow port instead (issue #198).
 */
export interface DatabaseKeyManager {
  /**
   * Verify the current key and re-encrypt the database with a new key.
   *
   * @param currentKey - The key the database is currently encrypted with.
   * @param newKey - The key to re-encrypt the database with.
   * @returns `{ success: true }` when verification and rekey succeeded, or a
   *          discriminated failure with an honest reason. Never throws.
   */
  changeKey(
    currentKey: string,
    newKey: string,
  ): DatabaseKeyChangeResult;
}

/**
 * Create a {@link DatabaseKeyManager} over a live better-sqlite3 connection.
 *
 * The verification step reads actual data (`sqlite_master`) so a wrong current
 * key surfaces as a failed read on the encrypted pages; the rekey re-encrypts
 * the whole database in place via `PRAGMA rekey`. A wrong current key and a
 * failed rekey (I/O error, locked database) are reported as distinct failures
 * — the caller maps them to the wire failure output without ever seeing an
 * exception. Keys are single-quote-escaped (`''` doubling) before
 * interpolation into the PRAGMA SQL.
 */
export function createDatabaseKeyManager(
  sqlite: BetterSqliteDatabase,
): DatabaseKeyManager {
  return {
    changeKey(currentKey: string, newKey: string): DatabaseKeyChangeResult {
      try {
        sqlite.pragma(`key = '${escapeSqliteString(currentKey)}'`);
        sqlite.prepare("SELECT COUNT(*) FROM sqlite_master").get();
      } catch {
        return { success: false, error: "Current encryption key is invalid" };
      }

      try {
        sqlite.pragma(`rekey = '${escapeSqliteString(newKey)}'`);
      } catch {
        return { success: false, error: "Database re-encryption failed" };
      }

      return { success: true };
    },
  };
}
