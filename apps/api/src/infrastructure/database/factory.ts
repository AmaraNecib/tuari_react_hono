import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from "node:fs"
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

/** Loads the SQLCipher constructor; injectable so tests can force a fake binding. */
export type SqlcipherConstructorLoader = () => typeof Database

const loadSqlcipherConstructor: SqlcipherConstructorLoader = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("better-sqlite3-sqlcipher") as typeof Database

/**
 * Resolve the SQLite constructor to use.
 * When a database key is configured, use better-sqlite3-sqlcipher for encryption.
 * Falls back to plain better-sqlite3 when no key is needed.
 * @throws Error if encryption is required but better-sqlite3-sqlcipher is unavailable.
 */
export function resolveDatabaseConstructor(
  key: string | null,
  loadSqlcipher: SqlcipherConstructorLoader = loadSqlcipherConstructor,
): typeof Database {
  if (!key) return Database

  try {
    return loadSqlcipher()
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(
      "Database encryption requires better-sqlite3-sqlcipher, which is not installed or cannot be loaded. "
      + "Install the SQLCipher binding or remove APP_DB_KEY to use an unencrypted database. "
      + `Underlying error: ${cause}`
    )
  }
}

/** The 16-byte header every plaintext SQLite database starts with. */
const SQLITE_HEADER = "SQLite format 3\0"

/**
 * Read the first bytes of a database file, or `null` when the file is absent.
 * An empty string means the file exists but is empty (SQLite treats that as a
 * valid, empty database).
 */
const readLeadingBytes = (databasePath: string): string | null => {
  if (!existsSync(databasePath)) return null
  if (statSync(databasePath).size === 0) return ""

  const descriptor = openSync(databasePath, "r")
  try {
    const buffer = Buffer.alloc(SQLITE_HEADER.length)
    const bytesRead = readSync(descriptor, buffer, 0, SQLITE_HEADER.length, 0)
    return buffer.subarray(0, bytesRead).toString("latin1")
  } finally {
    closeSync(descriptor)
  }
}

/**
 * A SQLCipher-encrypted file is indistinguishable from noise to a plaintext
 * reader, so without a key it only fails at the first query with an opaque
 * `file is not a database`. Refuse it up front with a message that names both
 * possibilities — an encrypted workspace whose `encrypted_db` capability is not
 * active, or a damaged plaintext file — without asserting which one it is
 * (licensing architecture §8.3 / #402).
 */
export function assertNotEncryptedWithoutKey(databasePath: string, key: string | null): void {
  if (key || databasePath === ":memory:") return

  const header = readLeadingBytes(databasePath)
  if (header === null || header === "" || header === SQLITE_HEADER) return

  throw new Error(
    `Refusing to open ${databasePath}: its first bytes are not the SQLite header, so it is `
    + "either SQLCipher-encrypted (expected when no database key is active) or damaged. This "
    + "build cannot tell those apart. Check the license's encrypted_db feature and APP_DB_KEY: "
    + "if the workspace should be encrypted, provide the key or restore the license; if it "
    + "should be plaintext, the file may be truncated or corrupt, so inspect or restore it "
    + "before retrying (#402)."
  )
}

/** Message for a keyed open whose binding does not actually encrypt. */
const encryptionUnavailableMessage = (cause?: unknown): string =>
  "Refusing to open the database with APP_DB_KEY set: the loaded SQLite binding cannot encrypt. "
  + "PRAGMA cipher_version returned no version, so the SQLCipher PRAGMAs are no-ops and the "
  + "license would be served a plaintext database (#402). Install the better-sqlite3-sqlcipher binding."
  + (cause === undefined ? "" : ` (${cause instanceof Error ? cause.message : String(cause)})`)

/** The minimal connection surface the capability probe needs. */
export type EncryptionCapabilityProbe = Pick<BetterSqliteDatabase, "pragma"> & {
  close: () => unknown
}

/**
 * Prove the loaded binding is real SQLCipher rather than plain better-sqlite3.
 * Plain better-sqlite3 accepts `PRAGMA key` as a no-op and reports no cipher
 * version, so a successful `require()` is not enough. This proves the binding
 * can encrypt; it does not prove that a keyed write lands ciphertext on disk —
 * the #410 CI job covers that end to end. On failure the connection is closed
 * before throwing, so no handle (and no plaintext file) is left behind.
 */
export function assertBindingEncrypts(sqlite: EncryptionCapabilityProbe): void {
  let cipherVersion: unknown
  try {
    cipherVersion = sqlite.pragma("cipher_version", { simple: true })
  } catch (error) {
    sqlite.close()
    throw new Error(encryptionUnavailableMessage(error))
  }

  if (typeof cipherVersion !== "string" || cipherVersion.trim() === "") {
    sqlite.close()
    throw new Error(encryptionUnavailableMessage())
  }
}

/**
 * Create a SQLite database connection.
 *
 * @param databasePath - Explicit file path (or `:memory:`). When omitted,
 *                       the env-resolved path is used.
 * @param dbKey - SQLCipher encryption key. When omitted, falls back to
 *                `process.env.APP_DB_KEY` (then plain better-sqlite3).
 * @param loadSqlcipher - Injection seam for the SQLCipher constructor (tests).
 */
export function createDatabaseConnection(
  databasePath?: string,
  dbKey?: string | null,
  loadSqlcipher?: SqlcipherConstructorLoader,
): BetterSqliteDatabase {
  const resolvedPath = databasePath ?? resolveDatabaseEnv().databasePath
  mkdirSync(dirname(resolvedPath), { recursive: true })

  const resolvedKey = dbKey ?? process.env.APP_DB_KEY ?? null
  assertNotEncryptedWithoutKey(resolvedPath, resolvedKey)
  const SqliteConstructor = resolveDatabaseConstructor(resolvedKey, loadSqlcipher)
  const sqlite = new SqliteConstructor(resolvedPath)

  if (resolvedKey) {
    sqlite.pragma(`key = '${escapeSqliteString(resolvedKey)}'`)
    sqlite.pragma("cipher_compatibility = 4")
    assertBindingEncrypts(sqlite)
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
