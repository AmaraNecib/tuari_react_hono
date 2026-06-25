import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import SqlCipherDatabase from "better-sqlite3-sqlcipher"

import { resolveDatabaseEnv } from "../config/database-env"

/**
 * Database instance type expected by downstream repositories.
 * Matches the `better-sqlite3` interface that company/inventory
 * repositories consume.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqliteDatabase = any

/**
 * Create a database connection using better-sqlite3-sqlcipher.
 *
 * If `dbKey` is provided it is used directly. Otherwise the factory
 * reads `APP_DB_KEY` from the environment (via `resolveDatabaseEnv`)
 * so every caller gets encrypted initialization automatically.
 *
 * better-sqlite3-sqlcipher is API-compatible with better-sqlite3 but
 * has different TypeScript types. We cast at this boundary so downstream
 * code sees the familiar shape.
 */
/** Create a SQLCipher-encrypted SQLite connection with WAL mode. */
export function createDatabaseConnection(dbKey?: string | null): BetterSqliteDatabase {
  const { databasePath } = resolveDatabaseEnv()

  // Ensure directory exists
  mkdirSync(dirname(databasePath), { recursive: true })

  // Create connection and key it immediately
  const sqlite = new SqlCipherDatabase(databasePath)

  // Resolve encryption key: explicit parameter > environment variable
  const resolvedKey = dbKey ?? process.env.APP_DB_KEY ?? null

  if (resolvedKey) {
    sqlite.pragma(`key = '${resolvedKey.replace(/'/g, "''")}'`)
    sqlite.pragma("cipher_compatibility = 4")
  }

  // Enable WAL mode for better concurrent performance
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  // Cast to the shape downstream repositories expect.
  // Runtime API is identical; only TypeScript types differ at the boundary.
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
