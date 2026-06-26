import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"
import type { BetterSqliteDatabase } from "../../types/sqlite"

import { resolveDatabaseEnv } from "../config/database-env"

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

/** Create a SQLite database connection. */
export function createDatabaseConnection(dbKey?: string | null): BetterSqliteDatabase {
  const { databasePath } = resolveDatabaseEnv()
  mkdirSync(dirname(databasePath), { recursive: true })

  const resolvedKey = dbKey ?? process.env.APP_DB_KEY ?? null
  const SqliteConstructor = resolveDatabaseConstructor(resolvedKey)
  const sqlite = new SqliteConstructor(databasePath)

  if (resolvedKey) {
    sqlite.pragma(`key = '${resolvedKey.replace(/'/g, "''")}'`)
    sqlite.pragma("cipher_compatibility = 4")
  }

  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

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
