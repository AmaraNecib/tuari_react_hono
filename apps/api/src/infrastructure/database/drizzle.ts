import { drizzle } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3-sqlcipher";

import * as schema from "../../schema";

/** Inferred type of a Drizzle instance configured with the app schema. */
export type AppDrizzle = ReturnType<typeof createDrizzleFromSqlite>;

/**
 * Create a Drizzle instance from an existing better-sqlite3-sqlcipher connection.
 * Both Drizzle and raw SQL share the same underlying SQLite file.
 *
 * better-sqlite3-sqlcipher is API-compatible with better-sqlite3.
 * We cast at the boundary since TypeScript types differ but runtime is identical.
 */
/** Create a Drizzle ORM instance from an existing SQLite connection. */
export function createDrizzleFromSqlite(sqlite: Database.Database) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return drizzle(sqlite as any, { schema });
}
