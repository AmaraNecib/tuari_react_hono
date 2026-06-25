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
 * The connection is keyed immediately (if dbKey is provided) so every
 * caller receives an encrypted-ready handle. If no key is provided the
 * database is opened in plaintext mode (backwards compatibility during
 * migration or in development).
 *
 * better-sqlite3-sqlcipher is API-compatible with better-sqlite3 but
 * has different TypeScript types. We cast at this boundary so downstream
 * code sees the familiar shape.
 */
export function createDatabaseConnection(dbKey?: string | null): BetterSqliteDatabase {
  const { databasePath } = resolveDatabaseEnv()

  // Ensure directory exists
  mkdirSync(dirname(databasePath), { recursive: true })

  // Create connection and key it immediately
  const sqlite = new SqlCipherDatabase(databasePath)

  if (dbKey) {
    sqlite.pragma(`key = '${dbKey.replace(/'/g, "''")}'`)
    sqlite.pragma("cipher_compatibility = 4")
  }

  // Enable WAL mode for better concurrent performance
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  // Cast to the shape downstream repositories expect.
  // Runtime API is identical; only TypeScript types differ at the boundary.
  return sqlite as unknown as BetterSqliteDatabase
}
