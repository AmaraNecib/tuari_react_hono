import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"
import type { BetterSqliteDatabase } from "../../types/sqlite"

import { resolveDatabaseEnv } from "../config/database-env"
import { createAlgeriaTimestamp } from "../../modules/company/company-time"

/**
 * Escape a string for interpolation inside single-quoted SQL (or PRAGMA)
 * literals — `'` becomes `''` (SQL doubling). Shared by every site that
 * builds `key = '...'` / `rekey = '...'` statements.
 */
export const escapeSqliteString = (value: string): string => value.replace(/'/g, "''")

/**
 * Resolve the SQLite constructor to use.
 * When a database key is configured, use better-sqlite3-multiple-ciphers for encryption.
 * Falls back to plain better-sqlite3 when no key is needed.
 * @throws Error if encryption is required but better-sqlite3-multiple-ciphers is unavailable.
 */
function resolveDatabaseConstructor(key: string | null): typeof Database {
  if (!key) return Database

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("better-sqlite3-multiple-ciphers") as typeof Database
  } catch {
    throw new Error(
      "Database encryption requires better-sqlite3-multiple-ciphers, which is not installed. "
      + "Install it or remove APP_DB_KEY to use an unencrypted database."
    )
  }
}

/**
 * Create a SQLite database connection.
 *
 * @param databasePath - Explicit file path (or `:memory:`). When omitted,
 *                       the env-resolved path is used.
 * @param dbKey - SQLCipher encryption key. When omitted, falls back to
 *                `process.env.APP_DB_KEY` (then plain better-sqlite3).
 */
export function createDatabaseConnection(
  databasePath?: string,
  dbKey?: string | null,
): BetterSqliteDatabase {
  const resolvedPath = databasePath ?? resolveDatabaseEnv().databasePath
  mkdirSync(dirname(resolvedPath), { recursive: true })

  const resolvedKey = dbKey ?? process.env.APP_DB_KEY ?? null
  const SqliteConstructor = resolveDatabaseConstructor(resolvedKey)
  const sqlite = new SqliteConstructor(resolvedPath)

  try {
    if (resolvedKey) {
      // Cipher options come BEFORE the key: they choose the KDF, so setting them
      // afterwards would apply them too late. `sqlcipher` + compatibility 4 keeps
      // the SQLCipher 4 file format (AES-256 + HMAC-SHA512) instead of this
      // build's chacha20 default, so the documented SQLCipher claim stays true and
      // the files stay readable by SQLCipher tooling. Verified by discrimination:
      // a file written with one cipher throws `file is not a database` when read
      // with the other.
      sqlite.pragma("cipher = 'sqlcipher'")
      sqlite.pragma("cipher_compatibility = 4")
      sqlite.pragma(`key = '${escapeSqliteString(resolvedKey)}'`)
    }

    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    // Wait (rather than fail immediately) when ANOTHER process holds the
    // SQLite write lock. Single-process today, but the transaction model
    // uses BEGIN IMMEDIATE (write reservation up front), so a second process
    // (dev tool, future host) touching the same file would otherwise surface
    // an instant SQLITE_BUSY as a spurious 500. 5s matches SQLite's typical
    // interactive wait; the error still propagates if the lock is held longer.
    sqlite.pragma("busy_timeout = 5000")
  } catch (error) {
    // A failed setup must not leak the native handle. The wrong-key path lands
    // here — `journal_mode = WAL` cannot run on a file this key cannot read —
    // and on Windows the leaked handle keeps the database file locked.
    try {
      sqlite.close()
    } catch {
      // The connection is already unusable; the original error is the useful one.
    }
    throw error
  }

  // Wrap prepare() to normalise values before they reach better-sqlite3.
  // - Boolean → 1/0 (better-sqlite3 rejects true/false)
  // - Date     → Algerian ISO string (better-sqlite3 rejects Date objects)
  // The proxy preserves object identity so named-param queries keep working.
  const originalPrepare = sqlite.prepare.bind(sqlite)

  /** Convert any bind-incompatible values in-place (recursive). */
  const normaliseParams = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i]
        if (typeof v === "boolean") { value[i] = v ? 1 : 0; continue }
        if (v instanceof Date) { value[i] = createAlgeriaTimestamp(v); continue }
        if (typeof v === "object" && v !== null) normaliseParams(v)
      }
      return
    }
    if (value !== null && typeof value === "object") {
      const keys = Object.getOwnPropertyNames(value)
      for (const k of keys) {
        const v = (value as Record<string, unknown>)[k]
        if (typeof v === "boolean") { (value as Record<string, unknown>)[k] = v ? 1 : 0; continue }
        if (v instanceof Date) { (value as Record<string, unknown>)[k] = createAlgeriaTimestamp(v); continue }
        if (typeof v === "object" && v !== null) normaliseParams(v)
      }
    }
  }

  /** Wrap a function so its array arguments are normalised before the call. */
  const withNormalised = (method: string, self: unknown, fn: (...a: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      normaliseParams(args)
      return fn.apply(self, args)
    }

  sqlite.prepare = function wrappedPrepare(sql: string) {
    const stmt = originalPrepare(sql)
    return new Proxy(stmt, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver)
        if (typeof val === "function") {
          if (prop === "all" || prop === "get" || prop === "run" || prop === "iterate") {
            return withNormalised(String(prop), target, val)
          }
          // .raw() returns a new statement — wrap it too
          if (prop === "raw") {
            return (...args: unknown[]) => {
              const rawStmt = val.apply(target, args)
              return new Proxy(rawStmt, {
                get(rawTarget, rawProp, rawReceiver) {
                  const rawVal = Reflect.get(rawTarget, rawProp, rawReceiver)
                  if (typeof rawVal === "function") {
                    if (rawProp === "all" || rawProp === "get" || rawProp === "run" || rawProp === "iterate") {
                      return withNormalised("raw:" + String(rawProp), rawTarget, rawVal)
                    }
                    return rawVal.bind(rawTarget)
                  }
                  return rawVal
                },
              })
            }
          }
          return val.bind(target)
        }
        return val
      },
    })
  } as typeof sqlite.prepare

  return sqlite as unknown as BetterSqliteDatabase
}
