/**
 * FifoLock — a minimal promise-chain FIFO mutex.
 *
 * The API runs every module on ONE better-sqlite3 connection, and
 * better-sqlite3 throws if a raw `BEGIN` is issued while another
 * transaction is open on that connection. Before #288 every module
 * that opened a transaction hand-rolled this same promise-chain lock
 * (account repo, recovery-key port, payment adapter, invoice adapter)
 * with subtle divergence. This is the single shared primitive: the
 * composition root creates ONE instance and injects it into every
 * component that opens a transaction on the shared connection, so at
 * most one transaction is open at a time.
 *
 * Two sections exist:
 *
 * - `run` (async, FIFO): the transaction openers (account, payment,
 *   invoice, recovery-key, bootstrap) queue behind the lock and hold
 *   it for the whole duration of their transaction. A queued run can
 *   additionally be bounded with `timeoutMs` (issue #322) so a
 *   never-settling transaction op cannot leave every queued caller
 *   hanging forever: the queued operation rejects after the bound and
 *   abandons its slot. NOTE the bound applies to the WAIT for a turn
 *   only — a holder that starts and never settles still owns the
 *   connection (it cannot be cancelled), but every waiting caller
 *   fails loudly instead of stalling indefinitely.
 *
 * - `runSync` (sync, guarded — issue #322): synchronous writers
 *   (better-sqlite3 `db.transaction()` sites in the company,
 *   inventory, invoice, invoice-debt and update-history modules)
 *   cannot await the promise queue, so instead of queueing they
 *   either execute immediately or throw. A sync writer that runs
 *   while another flow holds the lock would be silently absorbed
 *   into that flow's open transaction as a SAVEPOINT and rolled back
 *   with it — the throw turns that silent corruption into a loud,
 *   debuggable failure (the issue's "detection mechanism").
 *
 * Guarantees:
 *   - FIFO: `run` callbacks execute in call order, never interleaved.
 *   - A rejecting operation never poisons the chain: `tail` only ever
 *     resolves (via `release`), so `previous.then(operation)` skips a
 *     dead tail and the slot always releases the lock.
 *   - Loudly non-reentrant: calling `run` on the SAME lock while already
 *     inside a `run` execution context (an AsyncLocalStorage check) throws
 *     immediately instead of deadlocking. A nested `run` that is awaited
 *     would wait on a tail that can only resolve after the outer operation
 *     finishes — a permanent hang blocking every transaction app-wide.
 *     Components that need transaction-scoped callbacks hand out an
 *     unlocked view instead (see SqliteRecoveryKeyPort.unlocked()).
 *   - `runSync` distinguishes "inside our own run" (join the open
 *     transaction — the deliberate join-outer pattern used by the
 *     payment/invoice module flows) from "another flow holds the lock"
 *     (throws {@link FifoLockBusyError}). The guard is per-lock (the lock
 *     instance is stored, not a global flag), so independent locks never
 *     false-positive; it is best-effort — a nested call attached to a
 *     promise created OUTSIDE the run's async context bypasses it (no
 *     realistic caller does this; the escape hatch is the unlocked-view
 *     pattern).
 *   - ACCEPTED precedence inversion: a sync writer may run ahead of
 *     earlier-QUEUED `run` operations when the lock is free (no
 *     transaction is open yet, so nothing can be joined). Sync code
 *     cannot wait, so this is inherent; for the single-user desktop
 *     workload a sync writer jumping a queued-but-unstarted async run is
 *     harmless.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface FifoLock {
  /** Run `operation` after every previously queued operation completes. */
  run<T>(operation: () => Promise<T>): Promise<T>;
  /**
   * Synchronous critical section for writers that cannot await the queue:
   *
   * - inside this lock's own `run` → execute immediately (the caller owns
   *   the open transaction; the writer deliberately joins it);
   * - lock free → execute immediately (safe: sync code cannot interleave,
   *   so check + execute is atomic with respect to the event loop);
   * - lock held by ANOTHER flow → throw {@link FifoLockBusyError} instead
   *   of silently joining that flow's transaction (issue #322 detection
   *   mechanism).
   */
  runSync<T>(operation: () => T): T;
}

export interface FifoLockOptions {
  /**
   * Optional bound (ms) on how long a queued `run` waits for its turn.
   * On expiry the queued operation rejects with a descriptive error and
   * abandons its slot (it never executes; the chain still releases).
   * Must be a positive integer. Defaults to unbounded. The account
   * bcrypt window (~100ms) is far below any sane bound — this exists to
   * keep a never-settling transaction op from leaving every queued
   * writer hanging forever. Note it bounds the WAIT for a turn, not the
   * holder's execution (a hung holder cannot be cancelled).
   */
  timeoutMs?: number;
}

/**
 * Thrown by {@link FifoLock.runSync} when another flow holds the lock.
 * Distinct type so callers (and the error-mapping layer) can distinguish
 * "connection busy — retry" from ordinary failures.
 */
export class FifoLockBusyError extends Error {
  constructor() {
    super(
      "FifoLock: connection busy — another flow holds the shared-connection lock. Refusing to execute now: this writer would join that flow's open transaction (or run while its lock is held) and could be silently rolled back with it.",
    );
    this.name = "FifoLockBusyError";
  }
}

/** The lock instance whose `run` is currently executing, if any. */
const runContext = new AsyncLocalStorage<FifoLock>();

export function createFifoLock(options: FifoLockOptions = {}): FifoLock {
  const { timeoutMs } = options;
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`FifoLock: timeoutMs must be a positive integer, got ${timeoutMs}.`);
  }
  /** Tail of the queue — only ever resolved by `release`, never rejected. */
  let tail: Promise<void> = Promise.resolve();
  /** Number of `run` operations currently EXECUTING (not merely queued). */
  let activeCount = 0;

  const lock: FifoLock = {
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (runContext.getStore() === lock) {
        throw new Error(
          "FifoLock.run is not reentrant: a nested run would deadlock the shared-connection queue.",
        );
      }
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });

      return runContext.run(lock, () =>
        new Promise<T>((resolve, reject) => {
          let started = false;
          let abandoned = false;
          let timer: NodeJS.Timeout | undefined;
          if (timeoutMs !== undefined) {
            timer = setTimeout(() => {
              if (!started) {
                // The slot never got its turn within the bound — reject the
                // caller and abandon the slot (release happens when the
                // slot's turn arrives, so the chain keeps flowing).
                abandoned = true;
                reject(
                  new Error(
                    `FifoLock: timed out after ${timeoutMs}ms waiting for the shared-connection lock.`,
                  ),
                );
              }
            }, timeoutMs);
            timer.unref();
          }

          previous
            .then(() => {
              if (abandoned) {
                release();
                return;
              }
              started = true;
              if (timer !== undefined) clearTimeout(timer);
              activeCount++;
              // Convert a synchronous throw (how raw better-sqlite3 failures
              // surface) into a rejection so the slot always releases.
              Promise.resolve()
                .then(operation)
                .then(
                  (value) => {
                    activeCount--;
                    release();
                    resolve(value);
                  },
                  (error) => {
                    activeCount--;
                    release();
                    reject(error);
                  },
                );
            })
            .catch(() => {
              // `previous` only ever resolves (release), so this is
              // defensive — it guarantees the slot is never leaked.
              release();
            });
        }),
      );
    },

    runSync<T>(operation: () => T): T {
      if (runContext.getStore() === lock) {
        // Inside our own run: the caller owns the open transaction, so a
        // nested writer deliberately joins it (join-outer pattern).
        return operation();
      }
      if (activeCount > 0) {
        throw new FifoLockBusyError();
      }
      return operation();
    },
  };

  return lock;
}

/**
 * Run a synchronous better-sqlite3 transaction under the connection-wide
 * lock (issue #322). Shared by every adapter with sync transaction sites so
 * a future module cannot forget the guard: free/own-run → execute now,
 * foreign-held → {@link FifoLockBusyError} instead of silently joining an
 * unrelated open transaction.
 */
export function runSyncTransaction<T>(
  lock: FifoLock,
  run: (fn: () => T) => T,
  fn: () => T,
): T {
  return lock.runSync(() => run(fn));
}
