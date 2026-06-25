import { serve } from "@hono/node-server";

import { createApp } from "./app/create-app";
import { createAppDependencies } from "./app/dependencies";
import { env } from "./infrastructure/config/runtime-env";
import { createDatabaseConnection } from "./infrastructure/database/factory";
import { createDrizzleFromSqlite } from "./infrastructure/database/drizzle";
import { ensureDatabaseSchema } from "./infrastructure/database/schema";
import { BetterSqlite3Executor } from "./infrastructure/database/sqlite-executor";

async function main() {
  // Create raw better-sqlite3 connection for migrations and Drizzle
  const sqlite = createDatabaseConnection();
  const executor = new BetterSqlite3Executor(sqlite);

  // Run schema migrations with raw executor
  await ensureDatabaseSchema(executor);

  // Create Drizzle connection for the rest of the app
  const drizzleDb = createDrizzleFromSqlite(sqlite);

  const appDependencies = await createAppDependencies(drizzleDb);
  const app = createApp(appDependencies, {
    allowedOrigins: env.allowedOrigins,
    trustProxyHeaders: env.trustProxyHeaders,
  });

  serve(
    {
      fetch: app.fetch,
      port: env.port,
      hostname: env.host,
    },
    (info) => {
      console.log(`API listening on http://${info.address}:${info.port}`);
    },
  );
}

main().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
