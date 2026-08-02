/**
 * SqliteRecoveryKeyPort — Drizzle/SQLite implementation of RecoveryKeyPort.
 *
 * This is the ONLY place in the auth module that touches Drizzle or the
 * recovery key table schema. The service talks to the port interface, never
 * to a database handle.
 *
 * Concurrency: recovery keys are one-time-use credentials. `updateKeyStatus`
 * is a guarded check-and-set (`WHERE status = 'AVAILABLE'`) so a stale writer
 * can never overwrite an already-consumed/revoked key; `withTransaction` uses
 * BEGIN IMMEDIATE (better-sqlite3 transactions are synchronous, so an async
 * flow must own the begin/commit itself — same pattern as bootstrap.service).
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

  // Serializes withTransaction flows. The port is async but the driver is a
  // single synchronous connection, so concurrent flows would interleave at
  // await points (e.g. two generateKeys calls both counting 0 and inserting
  // 3 → 6 keys). A FIFO lock reproduces the old fully-synchronous behavior.
  private transactionQueue: Promise<void> = Promise.resolve();
  async insertKey(input: RecoveryKeyInsert): Promise<void> {
    this.db.insert(schema.recoveryKey).values(input).run();
  }

  async findKeyByHash(hash: string): Promise<RecoveryKeyRecord | null> {
    const row = this.db
      .select()
      .from(schema.recoveryKey)
      .where(eq(schema.recoveryKey.keyHash, hash))
      .limit(1)
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async updateKeyStatus(id: string, status: "CONSUMED" | "REVOKED"): Promise<boolean> {
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
    return result.changes > 0;
  }

  async countAvailableKeys(): Promise<number> {
    const result = this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.recoveryKey)
      .where(eq(schema.recoveryKey.status, "AVAILABLE"))
      .all();
    return result[0]?.value ?? 0;
  }

  async listAllKeys(): Promise<RecoveryKeyRecord[]> {
    return this.db.select().from(schema.recoveryKey).all().map(toRecord);
  }

  async withTransaction<T>(run: () => Promise<T>): Promise<T> {
    // FIFO lock: wait for any in-flight flow to finish before starting ours.
    const previous = this.transactionQueue;
    let release!: () => void;
    this.transactionQueue = new Promise<void>((resolve) => (release = resolve));
    await previous;

    // Join an already-open transaction instead of BEGINning a second one on
    // the shared connection (better-sqlite3 would throw).
    const nested = this.raw.inTransaction;
    if (!nested) {
      this.raw.exec("BEGIN IMMEDIATE");
    }
    try {
      const result = await run();
      if (!nested) {
        this.raw.exec("COMMIT");
      }
      return result;
    } catch (error) {
      if (!nested) {
        this.raw.exec("ROLLBACK");
      }
      throw error;
    } finally {
      release();
    }
  }
}
