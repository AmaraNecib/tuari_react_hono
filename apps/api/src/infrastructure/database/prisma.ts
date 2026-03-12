import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

import { resolveDatabaseEnv } from "../config/database-env";

const database = resolveDatabaseEnv();
const databaseDirectory = dirname(database.databasePath);

if (!existsSync(databaseDirectory)) {
  mkdirSync(databaseDirectory, { recursive: true });
}

export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3(
    {
      url: database.databasePath,
    },
    {
      timestampFormat: "iso8601",
    },
  ),
});
