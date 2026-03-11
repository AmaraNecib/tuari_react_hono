import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

import { env } from "../config/env";

const databaseDirectory = dirname(env.appDbPath);

if (!existsSync(databaseDirectory)) {
  mkdirSync(databaseDirectory, { recursive: true });
}

export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3(
    {
      url: env.appDbPath,
    },
    {
      timestampFormat: "iso8601",
    },
  ),
});
