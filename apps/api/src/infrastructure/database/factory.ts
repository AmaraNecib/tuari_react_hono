import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"
import type { BetterSqliteDatabase } from "../../types/sqlite"

import { resolveDatabaseEnv } from "../config/database-env"
import { createAlgeriaTimestamp } from "../../modules/company/company-time"

/**
 * Resolve the SQLite constructor to use.
 * When a database key is configured, use better-sqlite3-sqlcipher for encryption.
 * Falls back to plain better-sqlite3 when no key is needed.
 * @throws Error if encryption is required but better-sqlite3-sqlcipher is unavailable.
 */
function resolveDatabaseConstructor(key: string | null): typeof Database {
  if (!key) return Database

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("better-sqlite3-sqlcipher") as typeof Database
  } catch {
    throw new Error(
      "Database encryption requires better-sqlite3-sqlcipher, which is not installed. "
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

  if (resolvedKey) {
    sqlite.pragma(`key = '${resolvedKey.replace(/'/g, "''")}'`)
    sqlite.pragma("cipher_compatibility = 4")
  }

  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

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

/**
 * Change the SQLCipher encryption key on an open database connection.
 * This re-encrypts the database in place via PRAGMA rekey.
 *
 * @throws Error if better-sqlite3-sqlcipher is unavailable.
 */
export function changeDatabaseKey(sqlite: BetterSqliteDatabase, newKey: string): void {
  sqlite.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`)
}
