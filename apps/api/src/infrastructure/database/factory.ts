import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import SqlCipherDatabase from "better-sqlite3-sqlcipher"

import { resolveDatabaseEnv } from "../config/database-env"

/**
 * Create a database connection using better-sqlite3-sqlcipher.
 *
 * The connection is keyed immediately (if APP_DB_KEY is set) so every
 * caller receives an encrypted-ready handle. If no key is provided the
 * database is opened in plaintext mode (backwards compatibility during
 * migration or in development).
 *
 * better-sqlite3-sqlcipher is API-compatible with better-sqlite3.
 * The TypeScript types differ at the boundary; we cast once here so
 * downstream code sees the familiar better-sqlite3 shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDatabaseConnection(dbKey?: string | null): any {
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

  return sqlite
}
