/**
 * SqliteRecoveryKeyPort — Drizzle/SQLite implementation of RecoveryKeyPort.
 *
 * This is the ONLY place in the auth module that touches Drizzle or the
 * recovery key table schema. The service talks to the port interface, never
 * to a database handle.
 */
import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
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
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

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

  async updateKeyStatus(id: string, status: "CONSUMED" | "REVOKED"): Promise<void> {
    const timestamp = createAlgeriaTimestamp();
    const set =
      status === "CONSUMED"
        ? { status, consumedAt: timestamp }
        : { status, revokedAt: timestamp };
    this.db.update(schema.recoveryKey).set(set).where(eq(schema.recoveryKey.id, id)).run();
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
}
