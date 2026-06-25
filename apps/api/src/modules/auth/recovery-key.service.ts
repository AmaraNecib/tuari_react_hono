/**
 * RecoveryKeyService — manages recovery key lifecycle.
 *
 * Recovery keys are one-time-use app-layer credentials that authorize
 * a password reset. They are independent from the DB encryption key
 * and survive DB password changes.
 *
 * Flow:
 * 1. Admin generates 3 initial keys (shown once, then masked)
 * 2. Keys can be used to reset the app password (one-time use)
 * 3. Admin can revoke keys without using them
 * 4. Admin can generate new keys (max 5 in pool)
 */
import { createHash, randomBytes } from "node:crypto"
import { eq, and, sql } from "drizzle-orm"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "../../schema"
import { createAlgeriaTimestamp } from "../company/company-time"

/** Recovery key prefix format: first 4 hex chars of the key. */
const KEY_PREFIX_LENGTH = 4
/** Recovery key segment length (3 segments of 4 chars). */
const KEY_SEGMENT_LENGTH = 6
/** Number of key segments. */
const KEY_SEGMENTS = 3
/** Maximum number of available keys in the pool. */
const MAX_KEY_POOL = 5
/** Default number of keys to generate on first setup. */
const INITIAL_KEY_COUNT = 3

/** Status values for recovery keys. */
export type RecoveryKeyStatus = "AVAILABLE" | "CONSUMED" | "REVOKED"

/** Recovery key record as stored in the database. */
export interface RecoveryKeyRecord {
  id: string
  prefix: string
  keyHash: string
  status: RecoveryKeyStatus
  consumedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** Result of generating recovery keys (plain-text keys, shown once). */
export interface GeneratedRecoveryKey {
  /** Full plain-text key (e.g., "a1b2-c3d4-e5f6"). Only shown once. */
  key: string
  /** Key prefix for visual identification when masked. */
  prefix: string
  /** When the key was generated. */
  createdAt: string
}

/** Recovery key pool status for the Settings UI. */
export interface RecoveryKeyPoolStatus {
  /** Number of keys available for use. */
  availableCount: number
  /** Total keys ever generated. */
  totalCount: number
  /** Maximum allowed keys in the pool. */
  maxPoolSize: number
  /** Masked keys (e.g., "a1b2-****-****") for display. */
  maskedKeys: Array<{ id: string; prefix: string; status: RecoveryKeyStatus }>
}

/**
 * Generate a recovery key in PREFIX-XXXX-XXXX-XXXX format.
 * The key is cryptographically random hex characters.
 */
/** Generate a recovery key string in PREFIX-XXXX-XXXX-XXXX format with 128-bit entropy. */
function generateRecoveryKeyString(): string {
  // 16 bytes = 32 hex chars → 3 segments of 6 hex chars (128 bits of entropy)
  const bytes = randomBytes(16)
  const hex = bytes.toString("hex")
  const segments: string[] = []
  for (let i = 0; i < KEY_SEGMENTS; i++) {
    segments.push(hex.slice(i * KEY_SEGMENT_LENGTH, (i + 1) * KEY_SEGMENT_LENGTH))
  }
  return segments.join("-")
}

/** Compute SHA-256 hash of a recovery key for storage. */
function hashRecoveryKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

/**
 * Service for managing recovery key lifecycle.
 *
 * Uses Drizzle for queries and raw SQLite handle for transactions.
 */
/**
 * Service for managing recovery key lifecycle.
 *
 * Uses Drizzle for queries and raw SQLite handle for transactions.
 * Keys are one-time-use app-layer credentials that authorize password resets.
 */
export class RecoveryKeyService {
  constructor(
    private readonly db: BetterSQLite3Database<any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly raw: any,
  ) {}

  /** Count of available keys in the pool. */
  private countAvailable(): number {
    const result = this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.recoveryKey)
      .where(eq(schema.recoveryKey.status, "AVAILABLE"))
      .all()
    return result[0]?.value ?? 0
  }

  /**
   * Generate recovery keys. On first setup, generates INITIAL_KEY_COUNT keys.
   * Can replenish up to MAX_KEY_POOL total available keys.
   *
   * Returns plain-text keys (shown once, then masked in the database).
   */
  generateKeys(): GeneratedRecoveryKey[] {
    const available = this.countAvailable()
    const toGenerate = Math.min(INITIAL_KEY_COUNT, MAX_KEY_POOL - available)

    if (toGenerate <= 0) {
      return []
    }

    const keys: GeneratedRecoveryKey[] = []
    const timestamp = createAlgeriaTimestamp()

    // Atomic: generate all keys in a single transaction
    this.raw.transaction(() => {
      for (let i = 0; i < toGenerate; i++) {
        const plainKey = generateRecoveryKeyString()
        const prefix = plainKey.slice(0, KEY_PREFIX_LENGTH)
        const keyHash = hashRecoveryKey(plainKey)

        this.db
          .insert(schema.recoveryKey)
          .values({
            id: crypto.randomUUID(),
            prefix,
            keyHash,
            status: "AVAILABLE",
            consumedAt: null,
            revokedAt: null,
            createdAt: timestamp,
          })
          .run()

        keys.push({ key: plainKey, prefix, createdAt: timestamp })
      }
    })()

    return keys
  }

  /**
   * Consume a recovery key (one-time use).
   * Returns true if the key is valid and was consumed, false otherwise.
   */
  consumeKey(plainKey: string): boolean {
    const keyHash = hashRecoveryKey(plainKey)
    const timestamp = createAlgeriaTimestamp()

    // Atomic: read + update in a single transaction
    let consumed = false
    this.raw.transaction(() => {
      const row = this.db
        .select()
        .from(schema.recoveryKey)
        .where(
          and(
            eq(schema.recoveryKey.keyHash, keyHash),
            eq(schema.recoveryKey.status, "AVAILABLE"),
          ),
        )
        .limit(1)
        .all()[0]

      if (!row) return

      this.db
        .update(schema.recoveryKey)
        .set({ status: "CONSUMED", consumedAt: timestamp })
        .where(
          and(
            eq(schema.recoveryKey.id, row.id),
            eq(schema.recoveryKey.status, "AVAILABLE"),
          ),
        )
        .run()
      consumed = true
    })()

    return consumed
  }

  /**
   * Revoke a recovery key without using it.
   * Returns true if the key was found and revoked, false otherwise.
   */
  revokeKey(keyId: string): boolean {
    const timestamp = createAlgeriaTimestamp()

    // Atomic: read + update in a single transaction
    let revoked = false
    this.raw.transaction(() => {
      const row = this.db
        .select()
        .from(schema.recoveryKey)
        .where(
          and(
            eq(schema.recoveryKey.id, keyId),
            eq(schema.recoveryKey.status, "AVAILABLE"),
          ),
        )
        .limit(1)
        .all()[0]

      if (!row) return

      this.db
        .update(schema.recoveryKey)
        .set({ status: "REVOKED", revokedAt: timestamp })
        .where(
          and(
            eq(schema.recoveryKey.id, keyId),
            eq(schema.recoveryKey.status, "AVAILABLE"),
          ),
        )
        .run()
      revoked = true
    })()

    return revoked
  }

  /**
   * Get the current pool status for the Settings UI.
   * Shows masked keys (prefix + asterisks) and counts.
   */
  getPoolStatus(): RecoveryKeyPoolStatus {
    const all = this.db
      .select()
      .from(schema.recoveryKey)
      .all()

    const availableCount = all.filter((k) => k.status === "AVAILABLE").length

    return {
      availableCount,
      totalCount: all.length,
      maxPoolSize: MAX_KEY_POOL,
      maskedKeys: all.map((k) => ({
        id: k.id,
        prefix: k.prefix,
        status: k.status as RecoveryKeyStatus,
      })),
    }
  }
}
