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
 *
 * The service owns the business logic (key generation, hashing, pool rules,
 * validation) and delegates all persistence to a `RecoveryKeyPort`.
 */
import { createHash, randomBytes } from "node:crypto";
import { createAlgeriaTimestamp } from "../company/company-time";
import type {
  RecoveryKeyPort,
  RecoveryKeyStatus,
} from "./recovery-key.types";

/** Recovery key prefix format: first 4 hex chars of the key. */
const KEY_PREFIX_LENGTH = 4;
/** Recovery key segment length (3 segments of 6 chars). */
const KEY_SEGMENT_LENGTH = 6;
/** Number of key segments. */
const KEY_SEGMENTS = 3;
/** Maximum number of available keys in the pool. */
const MAX_KEY_POOL = 5;
/** Default number of keys to generate on first setup. */
const INITIAL_KEY_COUNT = 3;

/** Result of generating recovery keys (plain-text keys, shown once). */
export interface GeneratedRecoveryKey {
  /** Full plain-text key (e.g., "a1b2-c3d4-e5f6"). Only shown once. */
  key: string;
  /** Key prefix for visual identification when masked. */
  prefix: string;
  /** When the key was generated. */
  createdAt: string;
}

/** Recovery key pool status for the Settings UI. */
export interface RecoveryKeyPoolStatus {
  /** Number of keys available for use. */
  availableCount: number;
  /** Total keys ever generated. */
  totalCount: number;
  /** Maximum allowed keys in the pool. */
  maxPoolSize: number;
  /** Masked keys (e.g., "a1b2-****-****") for display. */
  maskedKeys: Array<{ id: string; prefix: string; status: RecoveryKeyStatus }>;
}

/**
 * Generate a recovery key string in XXXXXX-XXXXXX-XXXXXX format.
 * 3 segments of 6 hex chars = 18 hex chars = 72 bits of entropy
 * (randomBytes(16) is sliced; the extra bytes are discarded).
 */
function generateRecoveryKeyString(): string {
  // 18 hex chars = 72 bits of entropy
  const bytes = randomBytes(16);
  const hex = bytes.toString("hex");
  const segments: string[] = [];
  for (let i = 0; i < KEY_SEGMENTS; i++) {
    segments.push(hex.slice(i * KEY_SEGMENT_LENGTH, (i + 1) * KEY_SEGMENT_LENGTH));
  }
  return segments.join("-");
}

/** Compute SHA-256 hash of a recovery key for storage. */
function hashRecoveryKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Service for managing recovery key lifecycle.
 *
 * Keys are one-time-use app-layer credentials that authorize password resets.
 * All persistence goes through the injected `RecoveryKeyPort`.
 */
export class RecoveryKeyService {
  constructor(private readonly port: RecoveryKeyPort) {}

  /**
   * Generate recovery keys. On first setup, generates INITIAL_KEY_COUNT keys.
   * Can replenish up to MAX_KEY_POOL total available keys.
   *
   * Returns plain-text keys (shown once, then masked in the database).
   * Count + inserts run inside a single transaction so concurrent calls
   * cannot overshoot the pool and a mid-loop failure leaves no partial pool.
   */
  async generateKeys(): Promise<GeneratedRecoveryKey[]> {
    const keys: GeneratedRecoveryKey[] = [];
    const timestamp = createAlgeriaTimestamp();

    await this.port.withTransaction(async (tx) => {
      const available = await tx.countAvailableKeys();
      const toGenerate = Math.min(INITIAL_KEY_COUNT, MAX_KEY_POOL - available);

      if (toGenerate <= 0) {
        return;
      }

      for (let i = 0; i < toGenerate; i++) {
        const plainKey = generateRecoveryKeyString();
        const prefix = plainKey.slice(0, KEY_PREFIX_LENGTH);
        const keyHash = hashRecoveryKey(plainKey);

        await tx.insertKey({
          id: crypto.randomUUID(),
          prefix,
          keyHash,
          status: "AVAILABLE",
          consumedAt: null,
          revokedAt: null,
          createdAt: timestamp,
        });

        keys.push({ key: plainKey, prefix, createdAt: timestamp });
      }
    });

    return keys;
  }

  /**
   * Consume a recovery key (one-time use).
   * Returns true if the key is valid and was consumed, false otherwise.
   */
  async consumeKey(plainKey: string): Promise<boolean> {
    const keyHash = hashRecoveryKey(plainKey);
    const record = await this.port.findKeyByHash(keyHash);

    if (!record || record.status !== "AVAILABLE") {
      return false;
    }

    return this.port.updateKeyStatus(record.id, "CONSUMED");
  }

  /**
   * Revoke a recovery key without using it.
   * Returns true if the key was found and revoked, false otherwise.
   */
  async revokeKey(keyId: string): Promise<boolean> {
    const record = (await this.port.listAllKeys()).find((k) => k.id === keyId);

    if (!record || record.status !== "AVAILABLE") {
      return false;
    }

    return this.port.updateKeyStatus(record.id, "REVOKED");
  }

  /**
   * Get the current pool status for the Settings UI.
   * Shows masked keys (prefix + asterisks) and counts.
   */
  async getPoolStatus(): Promise<RecoveryKeyPoolStatus> {
    const all = await this.port.listAllKeys();
    const availableCount = all.filter((k) => k.status === "AVAILABLE").length;

    return {
      availableCount,
      totalCount: all.length,
      maxPoolSize: MAX_KEY_POOL,
      maskedKeys: all.map((k) => ({
        id: k.id,
        prefix: k.prefix,
        status: k.status,
      })),
    };
  }
}
