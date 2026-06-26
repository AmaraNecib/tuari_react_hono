import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"
import type { BetterSqliteDatabase } from "../../types/sqlite"

import { resolveDatabaseEnv } from "../config/database-env"

/** Detect whether better-sqlite3-sqlcipher is available at runtime. */
function hasSqlcipher(): boolean {
  try {
    require.resolve("better-sqlite3-sqlcipher")
    return true
  } catch {
    return false
  }
}

/** Create a SQLite database connection. */
export function createDatabaseConnection(dbKey?: string | null): BetterSqliteDatabase {
  const { databasePath } = resolveDatabaseEnv()

  mkdirSync(dirname(databasePath), { recursive: true })

  const sqlite = new Database(databasePath)

  // Encryption pragmas only work with better-sqlite3-sqlcipher.
  // When using plain better-sqlite3, these are silently skipped.
  const resolvedKey = dbKey ?? process.env.APP_DB_KEY ?? null
  if (resolvedKey && hasSqlcipher()) {
    sqlite.pragma(`key = '${resolvedKey.replace(/'/g, "''")}'`)
    sqlite.pragma("cipher_compatibility = 4")
  }

  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  return sqlite as BetterSqliteDatabase
}

/**
 * Change the SQLCipher encryption key on an open database connection.
 * This re-encrypts the database in place via PRAGMA rekey.
 *
 * @returns true if rekey succeeded, false if SQLCipher is unavailable.
 */
export function changeDatabaseKey(sqlite: BetterSqliteDatabase, newKey: string): boolean {
  if (!hasSqlcipher()) return false
  sqlite.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`)
  return true
}
