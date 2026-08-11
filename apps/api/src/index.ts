import { serve } from "@hono/node-server";

import { createApp } from "./app/create-app";
import { createAppDependencies } from "./app/dependencies";
import { installShutdownHook } from "./app/shutdown";
import { createAppConfig } from "./config";

async function main() {
  // Single validated config — env + optional TUARI_CONFIG_FILE merge. Every
  // consumer (server bind, transport security, dependencies) reads from this
  // one injected AppConfig instead of separate env singletons.
  const config = createAppConfig();

  // Self-contained composition root: opens the database connection, runs the
  // schema migrations, builds Drizzle + better-auth, and wires every domain
  // service. No raw handles are created or passed here — the root keeps the
  // connection and hands the rest of the app narrow ports.
  const appDependencies = await createAppDependencies({}, config);

  const app = createApp(appDependencies, {
    allowedOrigins: config.allowedOrigins,
    trustProxyHeaders: config.trustProxyHeaders,
    authRateLimitMaxRequests: config.authRateLimitMaxRequests,
  });

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      console.log(`API listening on http://${info.address}:${info.port}`);
    },
  );

  // Graceful shutdown (issue #265): stop accepting requests, then close the
  // shared database connection (better-sqlite3 checkpoints the WAL on
  // last-connection close) before exiting.
  installShutdownHook({
    stopServer: () => new Promise<void>((resolve) => server.close(() => resolve())),
    close: appDependencies.close,
  });
}

main().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
