/**
 * RecoveryKey — domain/persistence types for the recovery key lifecycle.
 *
 * Recovery keys are one-time-use app-layer credentials that authorize a
 * password reset. They are independent from the DB encryption key.
 * This module owns the persistence boundary (`RecoveryKeyPort`); business
 * logic (generation, hashing, pool rules) lives in RecoveryKeyService.
 */

/** Status values for recovery keys. */
export type RecoveryKeyStatus = "AVAILABLE" | "CONSUMED" | "REVOKED";

/** Recovery key record as stored in the database. */
export interface RecoveryKeyRecord {
  id: string;
  prefix: string;
  keyHash: string;
  status: RecoveryKeyStatus;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Payload for inserting a new recovery key record (same shape as a record). */
export type RecoveryKeyInsert = RecoveryKeyRecord;

/**
 * Persistence boundary for recovery keys.
 *
 * All database operations the service needs. Implemented by
 * `SqliteRecoveryKeyPort`; the service depends on this interface only.
 *
 * Atomicity contract: recovery keys are one-time-use credentials, so
 * status transitions must be safe against concurrent consumers.
 * `updateKeyStatus` only flips the row when it is still AVAILABLE and
 * reports whether it did (guarded check-and-set), and `withTransaction`
 * gives the service an all-or-nothing scope for multi-write flows.
 */
export interface RecoveryKeyPort {
  insertKey(input: RecoveryKeyInsert): Promise<void>;
  findKeyByHash(hash: string): Promise<RecoveryKeyRecord | null>;
  /** Flip a key to CONSUMED/REVOKED. Returns false if it was no longer AVAILABLE. */
  updateKeyStatus(id: string, status: "CONSUMED" | "REVOKED"): Promise<boolean>;
  countAvailableKeys(): Promise<number>;
  listAllKeys(): Promise<RecoveryKeyRecord[]>;
  /** Run a flow atomically (all-or-nothing). The callback receives a tx-scoped
   * port bound to the same connection; not reentrant. */
  withTransaction<T>(run: (tx: RecoveryKeyPort) => Promise<T>): Promise<T>;
}
