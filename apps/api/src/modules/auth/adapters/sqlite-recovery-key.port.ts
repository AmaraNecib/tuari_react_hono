/**
 * SqliteRecoveryKeyPort — Drizzle/SQLite implementation of RecoveryKeyPort.
 *
 * This is the ONLY production code in the auth module that touches Drizzle or
 * the recovery key table schema. The service talks to the port interface,
 * never to a database handle.
 *
 * Concurrency model: the driver is a single synchronous connection and the
 * port methods are async, so concurrent flows would interleave at await
 * points (exactly what the old fully-synchronous service could not do).
 * Every public method therefore runs through a FIFO lock that reproduces
 * the old single-threaded semantics:
 *   - `updateKeyStatus` is a guarded check-and-set (`WHERE status =
 *     'AVAILABLE'`) returning whether it flipped the row, so a stale writer
 *     can never overwrite an already-consumed/revoked key;
 *   - `withTransaction` wraps a multi-statement flow in BEGIN IMMEDIATE /
 *     COMMIT / ROLLBACK (better-sqlite3 transactions are synchronous, so an
 *     async flow must own the begin/commit itself — same pattern as
 *     bootstrap.service). The callback receives an unlocked view of the
 *     port bound to the same connection. Holding the lock for the whole
 *     flow also guarantees no other port call can join the transaction and
 *     be silently rolled back by its failure (guarantee applies to
 *     port-owned transactions; an externally-opened transaction on the
 *     shared connection is joined instead of failed — see withTransaction).
 */
import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import * as schema from "../../../schema";
import { createAlgeriaTimestamp } from "../../company/company-time";
import type {
  RecoveryKeyInsert,
  RecoveryKeyPort,
  RecoveryKeyRecord,
  RecoveryKeyStatus,
} from "../recovery-key.types";

/** Map a Drizzle row to the domain record type (status is a free text column). */
function toRecord(row: typeof schema.recoveryKey.$inferSelect): RecoveryKeyRecord {
  return {
    id: row.id,
    prefix: row.prefix,
    keyHash: row.keyHash,
    status: row.status as RecoveryKeyStatus,
    consumedAt: row.consumedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export class SqliteRecoveryKeyPort implements RecoveryKeyPort {
  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    private readonly raw: BetterSqliteDatabase,
  ) {}

  /** Tail of the FIFO lock. Each call chains onto it and releases in `finally`. */
  private lockTail: Promise<void> = Promise.resolve();

  /**
   * Run an operation under the FIFO lock. All public methods go through this
   * so no statement can execute while another flow holds an open transaction.
   */
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.lockTail;
    let release!: () => void;
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    return previous.then(operation, operation).finally(release);
  }

  // -- Locked public methods (used outside a transaction) --------------------

  insertKey(input: RecoveryKeyInsert): Promise<void> {
    return this.serialized(async () => {
      this.db.insert(schema.recoveryKey).values(input).run();
    });
  }

  findKeyByHash(hash: string): Promise<RecoveryKeyRecord | null> {
    return this.serialized(() => this.findKeyByHashUnlocked(hash));
  }

  updateKeyStatus(id: string, status: Exclude<RecoveryKeyStatus, "AVAILABLE">): Promise<boolean> {
    return this.serialized(() => this.updateKeyStatusUnlocked(id, status));
  }

  countAvailableKeys(): Promise<number> {
    return this.serialized(() => this.countAvailableKeysUnlocked());
  }

  listAllKeys(): Promise<RecoveryKeyRecord[]> {
    return this.serialized(() => this.listAllKeysUnlocked());
  }

  withTransaction<T>(run: (tx: RecoveryKeyPort) => Promise<T>): Promise<T> {
    return this.serialized(async () => {
      // If a transaction was already opened OUTSIDE the port (e.g. a
      // bootstrap flow on the shared connection), join it instead of
      // BEGINning a second one — better-sqlite3 would throw. The caller
      // participates in that outer transaction (its COMMIT/ROLLBACK wins).
      const nested = this.raw.inTransaction;
      if (!nested) {
        this.raw.exec("BEGIN IMMEDIATE");
      }
      try {
        const result = await run(this.unlocked());
        if (!nested) {
          this.raw.exec("COMMIT");
        }
        return result;
      } catch (error) {
        if (!nested) {
          this.raw.exec("ROLLBACK");
        }
        throw error;
      }
    });
  }

  // -- Unlocked internals (execute on the shared connection as-is) -----------

  private findKeyByHashUnlocked(hash: string): Promise<RecoveryKeyRecord | null> {
    const row = this.db
      .select()
      .from(schema.recoveryKey)
      .where(eq(schema.recoveryKey.keyHash, hash))
      .limit(1)
      .all()[0];
    return Promise.resolve(row ? toRecord(row) : null);
  }

  private updateKeyStatusUnlocked(
    id: string,
    status: Exclude<RecoveryKeyStatus, "AVAILABLE">,
  ): Promise<boolean> {
    const timestamp = createAlgeriaTimestamp();
    const set =
      status === "CONSUMED"
        ? { status, consumedAt: timestamp }
        : { status, revokedAt: timestamp };
    // Guarded check-and-set: only flip keys that are still AVAILABLE, so a
    // concurrent consume/revoke of the same key cannot be overwritten.
    const result = this.db
      .update(schema.recoveryKey)
      .set(set)
      .where(and(eq(schema.recoveryKey.id, id), eq(schema.recoveryKey.status, "AVAILABLE")))
      .run();
    return Promise.resolve(result.changes > 0);
  }

  private countAvailableKeysUnlocked(): Promise<number> {
    const result = this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.recoveryKey)
      .where(eq(schema.recoveryKey.status, "AVAILABLE"))
      .all();
    return Promise.resolve(result[0]?.value ?? 0);
  }

  private listAllKeysUnlocked(): Promise<RecoveryKeyRecord[]> {
    return Promise.resolve(this.db.select().from(schema.recoveryKey).all().map(toRecord));
  }

  /**
   * Unlocked view handed to a withTransaction callback. Runs on the same
   * connection inside the open transaction (taking the lock again would
   * deadlock); withTransaction itself is deliberately not reentrant.
   *
   * Keep this view in sync with the locked public methods above: same
   * operations, no lock (the caller already holds it).
   */
  private unlocked(): RecoveryKeyPort {
    return {
      insertKey: async (input) => {
        this.db.insert(schema.recoveryKey).values(input).run();
      },
      findKeyByHash: (hash) => this.findKeyByHashUnlocked(hash),
      updateKeyStatus: (id, status) => this.updateKeyStatusUnlocked(id, status),
      countAvailableKeys: () => this.countAvailableKeysUnlocked(),
      listAllKeys: () => this.listAllKeysUnlocked(),
      withTransaction: () => {
        throw new Error("RecoveryKeyPort.withTransaction is not reentrant");
      },
    };
  }
}
