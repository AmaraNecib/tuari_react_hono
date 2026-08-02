/**
 * SqliteRecoveryKeyPort tests — transactional and concurrency primitives.
 *
 * The service tests exercise the adapter through the service; these tests
 * pin the adapter's own contracts: guarded check-and-set, transaction
 * rollback, lock release after failure, and loud reentrancy rejection.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRecoveryKeyTestEnv } from "../test-helpers/recovery-key-env";

const insert = (id: string, keyHash: string) => ({
  id,
  prefix: id.slice(0, 4),
  keyHash,
  status: "AVAILABLE" as const,
  consumedAt: null,
  revokedAt: null,
  createdAt: "2026-01-01T00:00:00.000+01:00",
});

describe("SqliteRecoveryKeyPort", () => {
  let env: ReturnType<typeof createRecoveryKeyTestEnv>;

  beforeEach(() => {
    env = createRecoveryKeyTestEnv();
  });

  afterEach(() => {
    env.teardown();
  });

  it("updateKeyStatus is a guarded check-and-set", async () => {
    const { port } = env;
    await port.insertKey(insert("key-1", "hash-1"));

    expect(await port.updateKeyStatus("key-1", "CONSUMED")).toBe(true);
    // Already consumed: a second flip (or a revoke) must not overwrite it.
    expect(await port.updateKeyStatus("key-1", "CONSUMED")).toBe(false);
    expect(await port.updateKeyStatus("key-1", "REVOKED")).toBe(false);
    // Unknown id: no-op, reported as failure.
    expect(await port.updateKeyStatus("missing", "REVOKED")).toBe(false);
  });

  it("findKeyByHash returns null for an unknown hash", async () => {
    const { port } = env;
    await port.insertKey(insert("key-1", "hash-1"));
    expect(await port.findKeyByHash("hash-1")).toMatchObject({ id: "key-1" });
    expect(await port.findKeyByHash("nope")).toBeNull();
  });

  it("withTransaction rolls back partial writes and releases the lock", async () => {
    const { port } = env;

    const attempt = port.withTransaction(async (tx) => {
      await tx.insertKey(insert("key-1", "hash-1"));
      throw new Error("boom");
    });
    await expect(attempt).rejects.toThrow("boom");

    // All-or-nothing: the insert inside the failed flow is gone.
    expect(await port.listAllKeys()).toEqual([]);

    // The lock was released: the next flow runs normally.
    await port.withTransaction(async (tx) => {
      await tx.insertKey(insert("key-2", "hash-2"));
    });
    expect(await port.listAllKeys()).toHaveLength(1);
  });

  it("rejects reentrant withTransaction loudly instead of hanging", async () => {
    const { port } = env;
    const result = await Promise.race([
      port
        .withTransaction(async (tx) => {
          await tx.withTransaction(async () => {});
        })
        .then(
          () => "resolved",
          () => "rejected",
        ),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed-out"), 1000)),
    ]);
    expect(result).toBe("rejected");
  });
});
