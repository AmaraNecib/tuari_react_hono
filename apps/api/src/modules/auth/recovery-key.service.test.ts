/**
 * RecoveryKeyService tests — generate, consume, revoke, pool status.
 *
 * Uses file-based SQLite per PRD decision (not in-memory).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRecoveryKeyTestEnv } from "./test-helpers/recovery-key-env";

describe("RecoveryKeyService", () => {
  let env: ReturnType<typeof createRecoveryKeyTestEnv>;

  beforeEach(() => {
    env = createRecoveryKeyTestEnv();
  });

  afterEach(() => {
    env.teardown();
  });

  describe("generateKeys", () => {
    it("generates 3 initial keys", async () => {
      const keys = await env.service.generateKeys();
      expect(keys).toHaveLength(3);
      for (const k of keys) {
        expect(k.key).toMatch(/^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}$/);
        expect(k.prefix).toHaveLength(4);
        expect(k.createdAt).toBeTruthy();
      }
    });

    it("does not exceed max pool size and returns [] at full pool", async () => {
      await env.service.generateKeys(); // 3
      await env.service.generateKeys(); // generates 2 more (max 5, had 3)
      const status = await env.service.getPoolStatus();
      expect(status.availableCount).toBe(5);
      // Third call should generate 0 and return an empty list
      const empty = await env.service.generateKeys();
      expect(empty).toEqual([]);
      const status2 = await env.service.getPoolStatus();
      expect(status2.availableCount).toBe(5);
    });

    it("generates exactly 1 key when the pool has 4 available", async () => {
      await env.service.generateKeys(); // 3
      await env.service.generateKeys(); // 5
      const status = await env.service.getPoolStatus();
      await env.service.revokeKey(status.maskedKeys[0]!.id); // 4 available
      const more = await env.service.generateKeys();
      expect(more).toHaveLength(1);
      const after = await env.service.getPoolStatus();
      expect(after.availableCount).toBe(5);
    });

    it("generates unique keys", async () => {
      const keys = await env.service.generateKeys();
      const keyStrings = keys.map((k) => k.key);
      expect(new Set(keyStrings).size).toBe(keyStrings.length);
    });

    it("concurrent generate calls cannot overshoot the pool", async () => {
      const results = await Promise.allSettled([0, 1, 2].map(() => env.service.generateKeys()));
      // The FIFO lock serializes the flows: 3 + 2 + 0 = 5, all succeed.
      for (const r of results) {
        expect(r.status).toBe("fulfilled");
      }
      const status = await env.service.getPoolStatus();
      expect(status.availableCount).toBe(5);
    });
  });

  describe("consumeKey", () => {
    it("consumes a valid key", async () => {
      const keys = await env.service.generateKeys();
      const result = await env.service.consumeKey(keys[0]!.key);
      expect(result).toBe(true);
      const status = await env.service.getPoolStatus();
      expect(status.availableCount).toBe(2);
    });

    it("rejects an invalid key", async () => {
      await env.service.generateKeys();
      const result = await env.service.consumeKey("0000-0000-0000");
      expect(result).toBe(false);
      const status = await env.service.getPoolStatus();
      expect(status.availableCount).toBe(3);
    });

    it("rejects an empty key", async () => {
      await env.service.generateKeys();
      const result = await env.service.consumeKey("");
      expect(result).toBe(false);
    });

    it("is case-sensitive (hash is exact)", async () => {
      const keys = await env.service.generateKeys();
      const result = await env.service.consumeKey(keys[0]!.key.toUpperCase());
      expect(result).toBe(false);
    });

    it("rejects a revoked key", async () => {
      const keys = await env.service.generateKeys();
      const status = await env.service.getPoolStatus();
      await env.service.revokeKey(status.maskedKeys[0]!.id);
      expect(await env.service.consumeKey(keys[0]!.key)).toBe(false);
    });

    it("rejects a key twice (one-time use)", async () => {
      const keys = await env.service.generateKeys();
      expect(await env.service.consumeKey(keys[0]!.key)).toBe(true);
      expect(await env.service.consumeKey(keys[0]!.key)).toBe(false);
    });

    it("consuming the same key concurrently succeeds only once", async () => {
      const keys = await env.service.generateKeys();
      const plainKey = keys[0]!.key;
      const results = await Promise.all([
        env.service.consumeKey(plainKey),
        env.service.consumeKey(plainKey),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const status = await env.service.getPoolStatus();
      const consumed = status.maskedKeys.find((k) => k.status === "CONSUMED");
      expect(consumed).toBeTruthy();
      expect(status.availableCount).toBe(2);
    });

    it("concurrent consume + revoke of the same key: exactly one wins", async () => {
      const keys = await env.service.generateKeys();
      const id = (await env.service.getPoolStatus()).maskedKeys[0]!.id;
      const [consumed, revoked] = await Promise.all([
        env.service.consumeKey(keys[0]!.key),
        env.service.revokeKey(id),
      ]);
      expect([consumed, revoked].filter(Boolean)).toHaveLength(1);
      const status = await env.service.getPoolStatus();
      expect(status.maskedKeys[0]!.status).not.toBe("AVAILABLE");
    });
  });

  describe("revokeKey", () => {
    it("revokes an available key", async () => {
      const keys = await env.service.generateKeys();
      const status = await env.service.getPoolStatus();
      const keyId = status.maskedKeys[0]!.id;
      const result = await env.service.revokeKey(keyId);
      expect(result).toBe(true);
      const after = await env.service.getPoolStatus();
      expect(after.availableCount).toBe(2);
    });

    it("cannot revoke a consumed key", async () => {
      const keys = await env.service.generateKeys();
      await env.service.consumeKey(keys[0]!.key);
      const status = await env.service.getPoolStatus();
      const consumedKey = status.maskedKeys.find((k) => k.status === "CONSUMED");
      expect(consumedKey).toBeTruthy();
      const result = await env.service.revokeKey(consumedKey!.id);
      expect(result).toBe(false);
    });

    it("cannot revoke a non-existent key", async () => {
      const result = await env.service.revokeKey("non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("getPoolStatus", () => {
    it("returns empty pool initially", async () => {
      const status = await env.service.getPoolStatus();
      expect(status.availableCount).toBe(0);
      expect(status.totalCount).toBe(0);
      expect(status.maxPoolSize).toBe(5);
      expect(status.maskedKeys).toHaveLength(0);
    });

    it("shows masked keys with correct status", async () => {
      const keys = await env.service.generateKeys();
      const status = await env.service.getPoolStatus();
      expect(status.maskedKeys).toHaveLength(3);
      for (const mk of status.maskedKeys) {
        expect(mk.prefix).toHaveLength(4);
        expect(mk.status).toBe("AVAILABLE");
      }
      expect(status.maskedKeys[0]!.prefix).toBe(keys[0]!.key.slice(0, 4));
    });

    it("reflects consumed and revoked keys", async () => {
      const keys = await env.service.generateKeys();
      await env.service.consumeKey(keys[0]!.key);
      const keyId = (await env.service.getPoolStatus()).maskedKeys[1]!.id;
      await env.service.revokeKey(keyId);
      const status = await env.service.getPoolStatus();
      const consumed = status.maskedKeys.find((k) => k.status === "CONSUMED");
      const revoked = status.maskedKeys.find((k) => k.status === "REVOKED");
      expect(consumed).toBeTruthy();
      expect(revoked).toBeTruthy();
      expect(status.availableCount).toBe(1);
    });

    it("stamps exactly the transition timestamp on each record", async () => {
      const keys = await env.service.generateKeys();
      await env.service.consumeKey(keys[0]!.key);
      const id = (await env.service.getPoolStatus()).maskedKeys[1]!.id;
      await env.service.revokeKey(id);

      const rows = env.rawDb
        .prepare('SELECT "status", "consumed_at", "revoked_at" FROM "recovery_key"')
        .all() as Array<{
        status: string;
        consumed_at: string | null;
        revoked_at: string | null;
      }>;

      const consumedRow = rows.find((r) => r.status === "CONSUMED")!;
      expect(consumedRow.consumed_at).toBeTruthy();
      expect(consumedRow.revoked_at).toBeNull();

      const revokedRow = rows.find((r) => r.status === "REVOKED")!;
      expect(revokedRow.revoked_at).toBeTruthy();
      expect(revokedRow.consumed_at).toBeNull();
    });
  });
});
