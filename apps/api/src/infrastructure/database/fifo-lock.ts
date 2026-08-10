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
 * Guarantees:
 *   - FIFO: `run` callbacks execute in call order, never interleaved.
 *   - A rejecting operation never poisons the chain: `tail` only ever
 *     resolves (via `release`), so `previous.then(operation)` skips a
 *     dead tail and `finally` always releases the lock.
 *   - Reentrant `run` inside a held lock would deadlock by design —
 *     components that need transaction-scoped callbacks hand out an
 *     unlocked view instead (see SqliteRecoveryKeyPort.unlocked()).
 */
export interface FifoLock {
  /** Run `operation` after every previously queued operation completes. */
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export function createFifoLock(): FifoLock {
  /** Tail of the queue — only ever resolved by `release`, never rejected. */
  let tail: Promise<void> = Promise.resolve();

  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      return previous.then(operation).finally(release);
    },
  };
}
