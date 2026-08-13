import { closeSync, openSync, readSync } from "node:fs";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createDatabaseConnection, escapeSqliteString } from "./factory";

/** Result of a database encryption-key change. Mirrors the RPC wire output. */
export type DatabaseKeyChangeResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Verifies and rotates the SQLCipher database encryption key.
 *
 * The raw database handle never leaves the composition root — the router and
 * system handlers receive this narrow port instead (issue #198). The port
 * contract is storage-agnostic: the app knows only that a key can be changed
 * and gets a discriminated result back. All SQLite/SQLCipher mechanics
 * (fresh-connection verification, header sniffing, scratch connections) live
 * inside this adapter.
 */
export interface DatabaseKeyManager {
  /**
   * Verify the current key and re-encrypt the database with a new key.
   *
   * The verification runs on a fresh connection so a wrong current key is
   * actually detected (SQLCipher ignores `PRAGMA key` on an already-open
   * connection). An unencrypted database fails explicitly — a silent no-op
   * rekey would let the caller believe encryption was enabled when it was
   * not. Persisting the new key (so a process restart can still open the
   * database) is the caller's responsibility — see `DatabaseKeyPersister`.
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
 * Optional test seams for {@link createDatabaseKeyManager}.
 *
 * Production callers (the composition root) pass only the live connection —
 * the adapter resolves the database path and scratch connector itself. Tests
 * inject fakes so verification behavior can be pinned without a real file or
 * the SQLCipher native binding.
 */
export type DatabaseKeyManagerSeams = {
  /** Database file path (defaults to the connection's own path). */
  databasePath?: string;
  /** Open a fresh connection with an explicit key (defaults to the factory). */
  openConnection?: (path: string, key: string) => BetterSqliteDatabase;
};

/** The 16-byte header every plain (non-SQLCipher) SQLite file starts with. */
const PLAIN_SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "utf8");

/**
 * Detect whether a database file is SQLCipher-encrypted.
 *
 * Plain SQLite files begin with the literal magic `"SQLite format 3\0"`;
 * SQLCipher files begin with a 16-byte random salt (the magic moves to
 * offset 16). Returns `null` when the path is not a readable file
 * (`:memory:`, missing, or too short to hold a header) — callers fall back
 * to shared-connection verification.
 *
 * Reads exactly 16 bytes (never the whole file — databases can be large).
 */
function detectEncryption(databasePath: string): "plain" | "encrypted" | null {
  if (!databasePath || databasePath === ":memory:") return null;

  let fd: number;
  try {
    fd = openSync(databasePath, "r");
  } catch {
    return null;
  }

  try {
    const header = Buffer.alloc(16);
    const bytesRead = readSync(fd, header, 0, 16, 0);
    if (bytesRead < 16) return null;
    return header.equals(PLAIN_SQLITE_MAGIC) ? "plain" : "encrypted";
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * Open a scratch connection and verify that `key` actually opens the
 * database. Returns true when the read succeeds. The scratch connection is
 * always closed.
 */
function verifyKeyOnFreshConnection(
  openConnection: (path: string, key: string) => BetterSqliteDatabase,
  databasePath: string,
  key: string,
): boolean {
  let scratch: BetterSqliteDatabase | null = null;
  try {
    scratch = openConnection(databasePath, key);
    scratch.prepare("SELECT COUNT(*) FROM sqlite_master").get();
    return true;
  } catch {
    return false;
  } finally {
    scratch?.close();
  }
}

/**
 * Create a {@link DatabaseKeyManager} over a live better-sqlite3 connection.
 *
 * All SQLite specifics are contained here (the app depends only on the
 * `DatabaseKeyManager` port):
 * - the database path comes from the connection itself (or a test seam);
 * - the scratch verification connection is opened through the same factory
 *   the composition root uses (SQLCipher binding resolution included);
 * - encryption is detected from the file header.
 *
 * Verification order (issue #265):
 * 1. Unencrypted file → explicit failure (`PRAGMA rekey` on plain
 *    better-sqlite3 is a documented no-op — succeeding silently would fake an
 *    encryption change).
 * 2. Encrypted file → verify `currentKey` on a fresh connection (SQLCipher
 *    only accepts `PRAGMA key` before the first read, so the shared
 *    connection's key cannot be re-verified).
 * 3. `:memory:` / unreadable path → verify on the shared connection (legacy
 *    behavior; plain better-sqlite3 treats the SQLCipher PRAGMAs as no-ops).
 *
 * The rekey re-encrypts the whole database in place via `PRAGMA rekey` on
 * the shared connection and is then verified on a fresh connection with the
 * NEW key, so a silent rekey failure cannot report success. Keys are
 * single-quote-escaped (`''` doubling) before interpolation into the PRAGMA
 * SQL. The result never throws — a failed verification, failed rekey, or
 * unencrypted database maps onto the wire failure output with an honest
 * reason.
 */
export function createDatabaseKeyManager(
  sqlite: BetterSqliteDatabase,
  seams: DatabaseKeyManagerSeams = {},
): DatabaseKeyManager {
  // The connection knows its own storage location — the app does not need to
  // pass it in (and must not: paths are a storage-engine concern).
  const databasePath = seams.databasePath ?? sqlite.name;
  const openConnection =
    seams.openConnection ?? ((path: string, key: string) => createDatabaseConnection(path, key));

  return {
    changeKey(currentKey: string, newKey: string): DatabaseKeyChangeResult {
      // Defensive guard mirroring the wire contract (changeDbKeyInputSchema
      // trims and requires non-empty keys) — the port must never emit a
      // PRAGMA with an empty key.
      if (!currentKey.trim() || !newKey.trim()) {
        return { success: false, error: "Database encryption keys must not be empty" };
      }

      const encryption = detectEncryption(databasePath);

      if (encryption === "plain") {
        return { success: false, error: "Database is not encrypted" };
      }

      if (encryption === "encrypted") {
        if (!verifyKeyOnFreshConnection(openConnection, databasePath, currentKey)) {
          return { success: false, error: "Current encryption key is invalid" };
        }
      } else {
        // `:memory:` or unreadable path — no file to re-open; fall back to the
        // shared connection (kept for dev/test on plain better-sqlite3, where
        // the SQLCipher PRAGMAs are accepted as no-ops).
        try {
          sqlite.pragma(`key = '${escapeSqliteString(currentKey)}'`);
          sqlite.prepare("SELECT COUNT(*) FROM sqlite_master").get();
        } catch {
          return { success: false, error: "Current encryption key is invalid" };
        }
      }

      try {
        sqlite.pragma(`rekey = '${escapeSqliteString(newKey)}'`);
      } catch {
        return { success: false, error: "Database re-encryption failed" };
      }

      // Confirm the database actually opens with the new key before reporting
      // success (SQLCipher rekey on a WAL-mode connection must not silently
      // fail). Only meaningful for real files — `:memory:` cannot be
      // re-opened by path.
      if (
        encryption === "encrypted" &&
        !verifyKeyOnFreshConnection(openConnection, databasePath, newKey)
      ) {
        return { success: false, error: "Database re-encryption failed" };
      }

      return { success: true };
    },
  };
}
