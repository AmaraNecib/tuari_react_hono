import { closeSync, openSync, readSync } from "node:fs";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createDatabaseConnection, escapeSqliteString } from "./factory";

/**
 * Result of a database encryption-key change. Mirrors the RPC wire output.
 *
 * Failure outcomes are tri-state on the rekey (Greptile P1):
 * - `rekeyed: true` — the database IS on the new key (a verified rekey whose
 *   persistence failed); the caller must KEEP the new key.
 * - `rekeyed: false` without `ambiguous` — the database DEFINITIVELY is NOT
 *   on the new key (the post-rekey probe ran and rejected it); restoring the
 *   old key is safe and correct.
 * - `rekeyed: false` with `ambiguous: true` — the rekey ran but the
 *   post-rekey verification could not complete (transient/system probe
 *   failure: lock, binding, connection, file). The database is LIKELY on the
 *   new key, so the caller must NOT restore the old key (that would orphan
 *   the database on the next startup) and must NOT clear the rollback slot —
 *   the outcome stays pending for a later re-verification.
 */
export type DatabaseKeyChangeResult =
  | { success: true }
  | { success: false; error: string; rekeyed?: boolean; ambiguous?: boolean };

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
 * Result of probing a fresh connection with a key:
 * - `"opens"` — the key was verified to open the database;
 * - `"wrong-key"` — the database DEFINITIVELY rejected the key (SQLCipher
 *   surfaces a wrong key as SQLITE_NOTADB when the first read runs);
 * - `"error"` — the probe could not verify anything (transient/system
 *   failure: connection open, binding, lock, or file error). This is NOT
 *   evidence that the key is wrong — the database may be on either key.
 */
type KeyProbeResult = "opens" | "wrong-key" | "error";

/** SQLITE_NOTADB (26) — SQLCipher rejects a read with the wrong key this way. */
const SQLITE_NOTADB_ERRNO = 26;

/**
 * True when `error` is SQLCipher's definitive wrong-key signal
 * (SQLITE_NOTADB — "file is not a database" from a read with the wrong
 * key). Anything else — a lock/busy error, an open/binding failure, or an
 * unexpected error shape — is a transient/system failure and cannot prove
 * the key is wrong.
 */
function isDefinitiveWrongKeySignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "SQLITE_NOTADB" || candidate.errno === SQLITE_NOTADB_ERRNO;
}

/**
 * Open a scratch connection and probe whether `key` opens the database.
 * Returns the tri-state {@link KeyProbeResult} — a definitive wrong-key
 * rejection is distinguished from a transient/system failure so callers
 * never mistake "couldn't verify" for "the key is wrong". The scratch
 * connection is always closed.
 */
function probeKeyOnFreshConnection(
  openConnection: (path: string, key: string) => BetterSqliteDatabase,
  databasePath: string,
  key: string,
): KeyProbeResult {
  let scratch: BetterSqliteDatabase | null = null;
  try {
    scratch = openConnection(databasePath, key);
    scratch.prepare("SELECT COUNT(*) FROM sqlite_master").get();
    return "opens";
  } catch (error) {
    return isDefinitiveWrongKeySignal(error) ? "wrong-key" : "error";
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
 *
 * Post-rekey probe honesty (Greptile P1): the verification result is
 * tri-state, never binary. A probe that VERIFIES the new key opens the
 * database reports success. A probe that RAN and definitively rejected the
 * new key (SQLITE_NOTADB — the rekey did not apply, e.g. the rekey-on-WAL
 * no-op hazard) reports `rekeyed: false` with NO `ambiguous` flag: restoring
 * the old key is safe. A probe that COULD NOT RUN (transient/system error:
 * lock, binding, connection, file) reports `rekeyed: false` WITH
 * `ambiguous: true`: the rekey likely succeeded, so the caller must not
 * restore the old key (that would orphan the re-encrypted database) and must
 * not clear the rollback slot — the outcome stays pending. `rekeyed: true`
 * is never claimed without a verified probe.
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
        if (probeKeyOnFreshConnection(openConnection, databasePath, currentKey) !== "opens") {
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
      if (encryption === "encrypted") {
        const newKeyProbe = probeKeyOnFreshConnection(openConnection, databasePath, newKey);
        if (newKeyProbe === "wrong-key") {
          // DEFINITIVE failure: the probe RAN and SQLCipher rejected the new
          // key (SQLITE_NOTADB) — the rekey did not apply (the rekey-on-WAL
          // no-op hazard). The database is NOT on the new key, so restoring
          // the old key is safe and correct. No `ambiguous` flag.
          return {
            success: false,
            error: "Database re-encryption failed",
            rekeyed: false,
          };
        }
        if (newKeyProbe === "error") {
          // AMBIGUOUS (Greptile P1): the rekey RAN, but the post-rekey probe
          // could not verify anything — a transient/system failure (lock,
          // binding, connection, file). The database is LIKELY on the new
          // key, so reporting a plain `rekeyed: false` would make the caller
          // restore the old key and orphan the re-encrypted database on the
          // next startup. Report the ambiguity explicitly: the caller keeps
          // the new key, keeps the rollback slot, and surfaces the honest
          // "rekey applied but verification pending" state instead of
          // restoring.
          return {
            success: false,
            error: "Database re-encryption could not be verified",
            rekeyed: false,
            ambiguous: true,
          };
        }
      }

      return { success: true };
    },
  };
}
