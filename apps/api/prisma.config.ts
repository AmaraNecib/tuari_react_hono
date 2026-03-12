import "dotenv/config";

import { defineConfig } from "prisma/config";

import { resolveDatabaseEnv } from "./src/infrastructure/config/database-env";

const database = resolveDatabaseEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: database.databaseUrl,
  },
});
