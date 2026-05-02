import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type Database from "better-sqlite3"

import { resolveDatabaseEnv } from "../config/database-env"

export async function createDatabaseConnection(): Promise<Database.Database> {
  const DatabaseConstructor = (await import("better-sqlite3")).default
  const { databasePath } = resolveDatabaseEnv()

  // Ensure directory exists
  mkdirSync(dirname(databasePath), { recursive: true })

  // Create and return database connection
  return new DatabaseConstructor(databasePath)
}
