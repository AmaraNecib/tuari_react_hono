import { serve } from "@hono/node-server";

import { createApp } from "./app/create-app";
import { createAppDependencies } from "./app/dependencies";
import { installShutdownHook } from "./app/shutdown";
import { createAppConfig } from "./config";
import { createStartupBackup } from "./modules/backup/backup.scheduler";

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

  // Daily local backup (#430): the snapshot copies the whole database on a
  // dedicated connection in a worker thread, so it never blocks the event loop
  // or the readiness probe. It is still deferred to a later turn and gated on
  // the first `/health` response so the copy never competes with boot.
  // `createStartupBackup` owns that timing. It never throws, so a failure only
  // shows up on the `backupStatus` read and the app stays usable.
  const startupBackup = createStartupBackup(appDependencies.backupService);

  const server = serve(
    {
      // The health probe is the desktop shell's readiness gate. Detect it here
      // so the daily backup can be gated on the app proving readiness (see
      // below) — the snapshot must never run on the path that answers it.
      fetch: (request, env) => {
        const response = app.fetch(request, env);
        if (new URL(request.url).pathname === "/health") {
          startupBackup.onHealthServed();
        }
        return response;
      },
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      console.log(`API listening on http://${info.address}:${info.port}`);
      // Fallback so a deployment nobody probes still takes its daily backup.
      startupBackup.onServerListening();
    },
  );

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
