/**
 * End-to-end test: Recovery key lifecycle.
 *
 * Covers: generate → revoke → use → verify masked keys never leak plain text.
 *
 * Recovery keys are app-layer credentials independent of the DB encryption
 * key, so a real DB rekey is not exercised here: SQLCipher's `PRAGMA rekey`
 * is a no-op on the plain better-sqlite3 used by this workspace's tests
 * (the sqlcipher binding is not built — see database-key-manager.test.ts,
 * which covers the changeKey statements at the unit level). This suite
 * asserts what the app-layer lifecycle actually guarantees.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRecoveryKeyTestEnv } from "./test-helpers/recovery-key-env";

describe("End-to-end: recovery key lifecycle", () => {
  let env: ReturnType<typeof createRecoveryKeyTestEnv>;

  beforeEach(() => {
    env = createRecoveryKeyTestEnv();
  });

  afterEach(() => {
    env.teardown();
  });

  it("full lifecycle: generate → revoke → use → replenish", async () => {
    // 1. Generate initial recovery keys
    const keys = await env.service.generateKeys();
    expect(keys).toHaveLength(3);

    const status1 = await env.service.getPoolStatus();
    expect(status1.availableCount).toBe(3);

    // 2. Revoke one key
    const keyToRevoke = status1.maskedKeys[0]!;
    const revokeResult = await env.service.revokeKey(keyToRevoke.id);
    expect(revokeResult).toBe(true);

    const status2 = await env.service.getPoolStatus();
    expect(status2.availableCount).toBe(2);
    const revoked = status2.maskedKeys.find((k) => k.status === "REVOKED");
    expect(revoked).toBeTruthy();

    // 3. Use one key (consume)
    const keyToUse = keys[1]!;
    const consumeResult = await env.service.consumeKey(keyToUse.key);
    expect(consumeResult).toBe(true);

    const status3 = await env.service.getPoolStatus();
    expect(status3.availableCount).toBe(1);
    const consumed = status3.maskedKeys.find((k) => k.status === "CONSUMED");
    expect(consumed).toBeTruthy();

    // 4. Cannot reuse consumed key
    const reuseResult = await env.service.consumeKey(keyToUse.key);
    expect(reuseResult).toBe(false);

    // 5. Cannot revoke consumed key
    const revokeConsumed = await env.service.revokeKey(consumed!.id);
    expect(revokeConsumed).toBe(false);

    // 6. Revoke the remaining key
    const remainingAvailable = (await env.service.getPoolStatus()).maskedKeys.find(
      (k) => k.status === "AVAILABLE",
    );
    expect(remainingAvailable).toBeTruthy();
    await env.service.revokeKey(remainingAvailable!.id);

    const status4 = await env.service.getPoolStatus();
    expect(status4.availableCount).toBe(0);

    // 7. Generate new keys (replenish)
    const newKeys = await env.service.generateKeys();
    expect(newKeys.length).toBeGreaterThan(0);

    const status5 = await env.service.getPoolStatus();
    expect(status5.availableCount).toBeGreaterThan(0);

    // 8. New keys work
    const consumeNew = await env.service.consumeKey(newKeys[0]!.key);
    expect(consumeNew).toBe(true);
  });

  it("every generated key is sequentially consumable (pool drains to zero)", async () => {
    // Generate keys
    const keys = await env.service.generateKeys();
    expect(keys).toHaveLength(3);

    // Consume every generated key, one at a time — each must be accepted
    // exactly once (sequential consumption of the full pool).
    for (const k of keys) {
      const result = await env.service.consumeKey(k.key);
      expect(result).toBe(true);
    }

    const status = await env.service.getPoolStatus();
    expect(status.availableCount).toBe(0);
    expect(status.maskedKeys.every((k) => k.status === "CONSUMED")).toBe(true);
  });

  it("masked keys never expose plain text", async () => {
    const keys = await env.service.generateKeys();
    const status = await env.service.getPoolStatus();

    // Plain text keys are never in the database — verify against ALL generated keys
    const allKeyStrings = keys.map((k) => k.key);
    for (const mk of status.maskedKeys) {
      expect(mk.prefix).toHaveLength(4);
      for (const plainKey of allKeyStrings) {
        expect(JSON.stringify(mk)).not.toContain(plainKey);
      }
    }

    // Only the 4-char prefix is stored, matching each generated key
    const prefixes = status.maskedKeys.map((mk) => mk.prefix);
    expect(prefixes).toHaveLength(3);
    expect(new Set(prefixes)).toEqual(new Set(keys.map((k) => k.key.slice(0, 4))));
  });
});
