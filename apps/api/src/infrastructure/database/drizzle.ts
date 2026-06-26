import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import type { BetterSqliteDatabase } from "../../types/sqlite";

import * as schema from "../../schema";

/** Drizzle instance configured with the app schema. */
export type AppDrizzle = ReturnType<typeof drizzle<never>> & { $client: BetterSqliteDatabase };

/** Create a Drizzle ORM instance from an existing better-sqlite3 connection. */
export function createDrizzleFromSqlite(sqlite: BetterSqliteDatabase): AppDrizzle {
  return drizzle(sqlite, { schema }) as unknown as AppDrizzle;
}
