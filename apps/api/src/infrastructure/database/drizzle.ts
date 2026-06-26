import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

import * as schema from "../../schema";

/** Drizzle instance configured with the app schema. */
export type AppDrizzle = ReturnType<typeof drizzle<never>> & { $client: Database.Database };

/** Create a Drizzle ORM instance from an existing better-sqlite3 connection. */
export function createDrizzleFromSqlite(sqlite: Database.Database): AppDrizzle {
  return drizzle(sqlite, { schema }) as unknown as AppDrizzle;
}
