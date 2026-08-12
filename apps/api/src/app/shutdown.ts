/**
 * Graceful shutdown for the API bootstrap (issue #265).
 *
 * `index.ts` previously had no SIGINT/SIGTERM handler — `AppDependencies.close()`
 * (added in #198) was only exercised by tests. This helper wires a signal
 * handler that stops accepting requests, closes the shared database connection
 * (better-sqlite3 checkpoints the WAL on last-connection close), then exits.
 *
 * The handler is exposed separately (`createShutdownHandler`) so tests can
 * drive it directly with fakes — the install function is thin glue.
 */

export type ShutdownTargets = {
  /** Close the shared database connection (idempotent; flushes WAL). */
  close: () => void;
  /** Stop accepting new requests (server.close()). */
  stopServer: () => Promise<void> | void;
};

export type ShutdownOptions = {
  /** Signals to listen for. Defaults to SIGINT + SIGTERM. */
  signals?: NodeJS.Signals[];
  /** Logger (defaults to console.log). */
  log?: (message: string) => void;
  /** Process exit (defaults to process.exit). Injectable for tests. */
  exit?: (code?: number) => never;
  /**
   * Force-exit after this many ms if cleanup hangs (e.g. a stuck in-flight
   * request keeps the HTTP server open). Defaults to 5000.
   */
  forceExitTimeoutMs?: number;
};

/**
 * Create a shutdown handler for the given targets.
 *
 * The handler is idempotent (a second signal while shutting down is ignored)
 * and never throws: a failure to stop the server or close the connection is
 * logged and shutdown still proceeds.
 */
export function createShutdownHandler(
  targets: ShutdownTargets,
  options: ShutdownOptions = {},
): () => Promise<void> {
  const {
    log = (message: string) => console.log(message),
    exit = (code) => process.exit(code),
    forceExitTimeoutMs = 5000,
  } = options;
  let shuttingDown = false;

  return async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    log("Shutting down gracefully…");

    // Force-exit guard: if cleanup hangs (a stuck request keeps the server
    // open), exit anyway after the grace period so SIGTERM can never block
    // the process forever.
    const forceTimer = setTimeout(() => {
      log("Shutdown timed out — forcing exit");
      exit(1);
    }, forceExitTimeoutMs);
    forceTimer.unref();

    try {
      await targets.stopServer();
    } catch (error) {
      log(`Failed to stop the HTTP server cleanly: ${error instanceof Error ? error.message : String(error)}`);
    }

    clearTimeout(forceTimer);

    try {
      targets.close();
    } catch (error) {
      log(`Failed to close the database connection cleanly: ${error instanceof Error ? error.message : String(error)}`);
    }

    log("Shutdown complete");
    exit(0);
  };
}

/**
 * Install the shutdown handler on the given signals and return a cleanup
 * function that removes the listeners.
 */
export function installShutdownHook(
  targets: ShutdownTargets,
  options: ShutdownOptions = {},
): () => void {
  const { signals = ["SIGINT", "SIGTERM"] } = options;
  const handler = createShutdownHandler(targets, options);

  for (const signal of signals) {
    process.on(signal, handler);
  }

  return () => {
    for (const signal of signals) {
      process.off(signal, handler);
    }
  };
}
