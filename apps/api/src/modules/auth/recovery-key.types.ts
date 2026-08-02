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

/** Payload for inserting a new recovery key record. */
export interface RecoveryKeyInsert {
  id: string;
  prefix: string;
  keyHash: string;
  status: RecoveryKeyStatus;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Persistence boundary for recovery keys.
 *
 * All database operations the service needs. Implemented by
 * `SqliteRecoveryKeyPort`; the service depends on this interface only.
 */
export interface RecoveryKeyPort {
  insertKey(input: RecoveryKeyInsert): Promise<void>;
  findKeyByHash(hash: string): Promise<RecoveryKeyRecord | null>;
  updateKeyStatus(id: string, status: "CONSUMED" | "REVOKED"): Promise<void>;
  countAvailableKeys(): Promise<number>;
  listAllKeys(): Promise<RecoveryKeyRecord[]>;
}
