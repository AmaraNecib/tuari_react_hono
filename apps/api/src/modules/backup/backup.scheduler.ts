/**
 * Startup scheduling for the daily backup (#430).
 *
 * The snapshot copies the whole database, so it is real work that should not
 * compete with the boot path. The copy itself now runs on a dedicated
 * connection in a worker thread (`backup.snapshot.ts`) and does not block the
 * event loop, but the run is still deferred to a later turn and gated on
 * readiness: the first `/health` response proves the desktop can proceed, and a
 * fallback timer covers a deployment nobody probes. `runDueBackup` itself is
 * left as the single run path; this module only decides WHEN it is allowed to
 * start.
 */
import type { BackupService } from "./backup.types";

export type StartupBackupService = Pick<BackupService, "runDueBackup">;

export type StartupBackupOptions = {
  /**
   * Defers the run off the current turn. Defaults to `setImmediate`, which runs
   * the snapshot after the current event-loop turn has flushed — never
   * synchronously on the path that gates readiness.
   */
  schedule?: (run: () => void) => unknown;
  /** Fallback delay for a deployment with no health poller. Defaults to 30s. */
  fallbackDelayMs?: number;
  /** Fallback timer (injectable for tests). Defaults to `setTimeout`. */
  setTimer?: (
    run: () => void,
    delayMs: number,
  ) => { unref?: () => void } | undefined;
  /** Error sink (injectable for tests). Defaults to `console.error`. */
  log?: (message: string, cause?: unknown) => void;
};

export type StartupBackup = {
  /** The first `/health` response was served: readiness is proven. Idempotent. */
  onHealthServed: () => void;
  /** The server is listening: arm the fallback for an unprobed install. */
  onServerListening: () => void;
  /** Whether a run has already been scheduled (observability/tests). */
  hasScheduled: () => boolean;
};

export const createStartupBackup = (
  service: StartupBackupService,
  options: StartupBackupOptions = {},
): StartupBackup => {
  const schedule = options.schedule ?? ((run) => setImmediate(run));
  const fallbackDelayMs = options.fallbackDelayMs ?? 30_000;
  const setTimer =
    options.setTimer ?? ((run, delayMs) => setTimeout(run, delayMs));
  const log =
    options.log ?? ((message, cause) => console.error(message, cause));

  let scheduled = false;

  const start = () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      void service
        .runDueBackup()
        .catch((error) => log("[backup] unexpected failure", error));
    });
  };

  return {
    onHealthServed: start,
    onServerListening: () => {
      // An install nobody probes (a bare `pnpm dev:api`, a manual install)
      // would otherwise never back up. The timer is unref'd so it never holds
      // the process open on its own. The optional chain covers an injected
      // timer that returns nothing.
      setTimer(start, fallbackDelayMs)?.unref?.();
    },
    hasScheduled: () => scheduled,
  };
};
