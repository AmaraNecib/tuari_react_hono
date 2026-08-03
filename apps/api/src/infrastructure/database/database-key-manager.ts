import type { BetterSqliteDatabase } from "../../types/sqlite";

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
   * @returns `true` when the current key was verified and the rekey succeeded;
   *          `false` when verification or the rekey failed (the caller should
   *          surface this as a graceful failure, never a crash).
   */
  changeKey(currentKey: string, newKey: string): boolean;
}

/**
 * Create a {@link DatabaseKeyManager} over a live better-sqlite3 connection.
 *
 * The verification step reads actual data (`sqlite_master`) so a wrong current
 * key surfaces as a failed read on the encrypted pages; the rekey re-encrypts
 * the whole database in place via `PRAGMA rekey`. Any failure — a wrong
 * current key OR a failed rekey (I/O error, locked database) — is reported as
 * `false`; the caller never sees an exception. Keys are single-quote-escaped
 * (`''` doubling) before interpolation into the PRAGMA SQL.
 */
export function createDatabaseKeyManager(
  sqlite: BetterSqliteDatabase,
): DatabaseKeyManager {
  return {
    changeKey(currentKey: string, newKey: string): boolean {
      try {
        sqlite.pragma(`key = '${currentKey.replace(/'/g, "''")}'`);
        sqlite.prepare("SELECT COUNT(*) FROM sqlite_master").get();
        sqlite.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`);
        return true;
      } catch {
        return false;
      }
    },
  };
}
