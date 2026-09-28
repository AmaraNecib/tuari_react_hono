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

  // Daily local backup (#430): run AFTER the server is bound so a slow backup
  // cannot prevent the sidecar from answering /health. `runDueBackup` is
  // synchronous and never throws, so it cannot race an open transaction and a
  // failure only shows up on the `backupStatus` read (the app stays usable).
  void appDependencies.backupService
    .runDueBackup()
    .catch((error) => console.error("[backup] unexpected failure", error));

  // Graceful shutdown (issue #265): stop accepting requests (dropping idle
  // keep-alive connections so close() does not hang on them), then close the
  // shared database connection (better-sqlite3 checkpoints the WAL on
  // last-connection close) before exiting. A force-exit timer guards against
  // a stuck in-flight request keeping the process alive forever.
  installShutdownHook({
    stopServer: () =>
      new Promise<void>((resolve) => {
        // closeIdleConnections is present on the underlying http.Server but
        // not declared on the hono ServerType — guard with a cast.
        (server as unknown as { closeIdleConnections?: () => void }).closeIdleConnections?.()
        server.close(() => resolve())
      }),
    close: appDependencies.close,
  });
}

main().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
