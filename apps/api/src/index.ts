import { serve } from "@hono/node-server";

import { createApp } from "./app/create-app";
import { createAppDependencies } from "./app/dependencies";
import { env } from "./infrastructure/config/runtime-env";
import { createDatabaseConnection } from "./infrastructure/database/factory";
import { createDrizzleFromSqlite } from "./infrastructure/database/drizzle";
import { ensureDatabaseSchema } from "./infrastructure/database/schema";
import { BetterSqlite3Executor } from "./infrastructure/database/sqlite-executor";

async function main() {
  // Create a single shared SQLite connection for the entire app.
  // Both raw SQL (migrations, company/inventory repos) and Drizzle
  // (auth, account) share this handle.
  const sqlite = createDatabaseConnection();
  const executor = new BetterSqlite3Executor(sqlite);

  // Run schema migrations with raw executor
  await ensureDatabaseSchema(executor);

  // Create Drizzle connection from the same handle
  const drizzleDb = createDrizzleFromSqlite(sqlite);

  // Pass the shared handle — no second connection is opened
  const appDependencies = await createAppDependencies(sqlite, drizzleDb);
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
