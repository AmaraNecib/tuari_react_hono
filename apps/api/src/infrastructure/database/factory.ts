import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import Database from "better-sqlite3"

import { resolveDatabaseEnv } from "../config/database-env"

/** Create a SQLite database connection. */
export function createDatabaseConnection(dbKey?: string | null): Database.Database {
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

  return sqlite
}

/**
 * Change the SQLCipher encryption key on an open database connection.
 * This re-encrypts the database in place via PRAGMA rekey.
 */
export function changeDatabaseKey(sqlite: Database.Database, newKey: string): void {
  sqlite.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`)
}
