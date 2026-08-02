import { serve } from "@hono/node-server";

import { createApp } from "./app/create-app";
import { createAppDependencies } from "./app/dependencies";
import { createAppConfig } from "./config";
import { createAuth } from "./infrastructure/auth/auth";
import { createDatabaseConnection } from "./infrastructure/database/factory";
import { createDrizzleFromSqlite } from "./infrastructure/database/drizzle";
import { ensureDatabaseSchema } from "./infrastructure/database/schema";
import { BetterSqlite3Executor } from "./infrastructure/database/sqlite-executor";

async function main() {
  // Single validated config — env + optional TUARI_CONFIG_FILE merge. Every
  // consumer (server bind, transport security, auth, dependencies) reads from
  // this one injected AppConfig instead of separate env singletons.
  const config = createAppConfig();

  // Create a single shared SQLite connection for the entire app.
  const sqlite = createDatabaseConnection();
  const executor = new BetterSqlite3Executor(sqlite);

  // Run schema migrations with raw executor
  await ensureDatabaseSchema(executor);

  // Create Drizzle connection from the same handle
  const drizzleDb = createDrizzleFromSqlite(sqlite);

  // Create better-auth from the shared Drizzle handle
  const auth = createAuth(drizzleDb, config);

  // Pass shared handle + auth — no duplicate connections
  const appDependencies = await createAppDependencies(sqlite, drizzleDb, auth, config);
  const app = createApp(appDependencies, {
    allowedOrigins: config.allowedOrigins,
    trustProxyHeaders: config.trustProxyHeaders,
  });

  serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
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
