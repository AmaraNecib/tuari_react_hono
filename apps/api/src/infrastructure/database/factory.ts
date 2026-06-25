import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import SqlCipherDatabase from "better-sqlite3-sqlcipher"

import { resolveDatabaseEnv } from "../config/database-env"

/**
 * Create a database connection using better-sqlite3-sqlcipher.
 *
 * better-sqlite3-sqlcipher is a fork of better-sqlite3 with identical API.
 * The TypeScript types differ, but we cast to the expected type since
 * the runtime behavior is the same.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDatabaseConnection(): any {
  const { databasePath } = resolveDatabaseEnv()

  // Ensure directory exists
  mkdirSync(dirname(databasePath), { recursive: true })

  // Create and return database connection (SQLCipher-compatible)
  return new SqlCipherDatabase(databasePath)
}
