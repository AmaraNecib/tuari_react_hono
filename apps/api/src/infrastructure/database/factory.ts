import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"

import { resolveDatabaseEnv } from "../config/database-env"

/**
 * Database instance type expected by downstream repositories.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqliteDatabase = any

/**
 * Create a SQLite database connection.
 *
 * Uses better-sqlite3 at runtime. When better-sqlite3-sqlcipher is available
 * (encryption enabled), swap the import to get SQLCipher support — the API
 * is identical.
 */
export function createDatabaseConnection(dbKey?: string | null): BetterSqliteDatabase {
  const { databasePath } = resolveDatabaseEnv()

  mkdirSync(dirname(databasePath), { recursive: true })

  const sqlite = new Database(databasePath)

  const resolvedKey = dbKey ?? process.env.APP_DB_KEY ?? null

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
 * @param sqlite - Open SQLCipher database connection
 * @param newKey - New encryption key to apply
 */
export function changeDatabaseKey(sqlite: BetterSqliteDatabase, newKey: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sqlite as any
  db.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`)
}
