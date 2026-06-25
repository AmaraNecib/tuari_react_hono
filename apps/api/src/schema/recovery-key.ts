/**
 * RecoveryKey — database table for recovery key metadata.
 *
 * Recovery keys are one-time-use app-layer credentials that authorize
 * a password reset. They are independent from the DB encryption key.
 *
 * Storage: verification hashes (never plain-text keys).
 * Keys are shown once at generation, then masked permanently.
 */
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Recovery key metadata stored in the database.
 * The plain-text key is shown once at generation then discarded.
 * Only the hash and prefix are stored for later verification.
 */
export const recoveryKey = sqliteTable("recovery_key", {
  /** Unique identifier for this recovery key record. */
  id: text("id").primaryKey(),
  /** Key prefix (first 4 chars) for visual identification when masked. */
  prefix: text("prefix").notNull(),
  /** SHA-256 hash of the full recovery key (for verification). */
  keyHash: text("key_hash").notNull(),
  /** Current status: AVAILABLE, CONSUMED, or REVOKED. */
  status: text("status").notNull().default("AVAILABLE"),
  /** Timestamp when the key was consumed (null if unused). */
  consumedAt: text("consumed_at"),
  /** Timestamp when the key was revoked (null if not revoked). */
  revokedAt: text("revoked_at"),
  /** Timestamp when the key was generated. */
  createdAt: text("created_at").notNull(),
});
