/**
 * RecoveryKeyService tests — generate, consume, revoke, pool status.
 *
 * Uses file-based SQLite per PRD decision (not in-memory).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { schemaStatements } from "../../infrastructure/database/schema-definitions"
import * as schema from "../../schema"
import { RecoveryKeyService } from "./recovery-key.service"
import { SqliteRecoveryKeyPort } from "./adapters/sqlite-recovery-key.port"

/** Create a test environment with file-based SQLite and RecoveryKeyService. */
function createTestEnv() {
  const dbDir = mkdtempSync(join(tmpdir(), "recovery-key-test-"))
  const dbPath = join(dbDir, "test.sqlite")
  const rawDb = new Database(dbPath)
  rawDb.pragma("foreign_keys = ON")
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt)
  }
  const db = drizzle(rawDb, { schema })
  const service = new RecoveryKeyService(new SqliteRecoveryKeyPort(db, rawDb))
  return {
    service,
    teardown: () => {
      rawDb.close()
      rmSync(dbDir, { recursive: true, force: true })
    },
  }
}

describe("RecoveryKeyService", () => {
  let env: ReturnType<typeof createTestEnv>

  beforeEach(() => {
    env = createTestEnv()
  })

  afterEach(() => {
    env.teardown()
  })

  describe("generateKeys", () => {
    it("generates 3 initial keys", async () => {
      const keys = await env.service.generateKeys()
      expect(keys).toHaveLength(3)
      for (const k of keys) {
        expect(k.key).toMatch(/^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}$/)
        expect(k.prefix).toHaveLength(4)
        expect(k.createdAt).toBeTruthy()
      }
    })

    it("does not exceed max pool size", async () => {
      await env.service.generateKeys() // 3
      await env.service.generateKeys() // generates 2 more (max 5, had 3)
      const status = await env.service.getPoolStatus()
      expect(status.availableCount).toBe(5)
      // Third call should generate 0
      await env.service.generateKeys()
      const status2 = await env.service.getPoolStatus()
      expect(status2.availableCount).toBe(5)
    })

    it("generates unique keys", async () => {
      const keys = await env.service.generateKeys()
      const keyStrings = keys.map((k) => k.key)
      expect(new Set(keyStrings).size).toBe(keyStrings.length)
    })

    it("concurrent generate calls cannot overshoot the pool", async () => {
      const results = await Promise.allSettled([
        env.service.generateKeys(),
        env.service.generateKeys(),
      ])
      // Both calls succeed (the second joins the first's transaction); the
      // pool must never exceed MAX_KEY_POOL regardless of interleaving.
      for (const r of results) {
        expect(r.status).toBe("fulfilled")
      }
      const status = await env.service.getPoolStatus()
      expect(status.availableCount).toBeLessThanOrEqual(5)
    })
  })

  describe("consumeKey", () => {
    it("consumes a valid key", async () => {
      const keys = await env.service.generateKeys()
      const result = await env.service.consumeKey(keys[0]!.key)
      expect(result).toBe(true)
      const status = await env.service.getPoolStatus()
      expect(status.availableCount).toBe(2)
    })

    it("rejects an invalid key", async () => {
      await env.service.generateKeys()
      const result = await env.service.consumeKey("0000-0000-0000")
      expect(result).toBe(false)
      const status = await env.service.getPoolStatus()
      expect(status.availableCount).toBe(3)
    })

    it("rejects a key twice (one-time use)", async () => {
      const keys = await env.service.generateKeys()
      expect(await env.service.consumeKey(keys[0]!.key)).toBe(true)
      expect(await env.service.consumeKey(keys[0]!.key)).toBe(false)
    })

    it("consuming the same key concurrently succeeds only once", async () => {
      const keys = await env.service.generateKeys()
      const plainKey = keys[0]!.key
      const results = await Promise.all([
        env.service.consumeKey(plainKey),
        env.service.consumeKey(plainKey),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
      const status = await env.service.getPoolStatus()
      const consumed = status.maskedKeys.find((k) => k.status === "CONSUMED")
      expect(consumed).toBeTruthy()
      expect(status.availableCount).toBe(2)
    })
  })

  describe("revokeKey", () => {
    it("revokes an available key", async () => {
      const keys = await env.service.generateKeys()
      const status = await env.service.getPoolStatus()
      const keyId = status.maskedKeys[0]!.id
      const result = await env.service.revokeKey(keyId)
      expect(result).toBe(true)
      const after = await env.service.getPoolStatus()
      expect(after.availableCount).toBe(2)
    })

    it("cannot revoke a consumed key", async () => {
      const keys = await env.service.generateKeys()
      await env.service.consumeKey(keys[0]!.key)
      const status = await env.service.getPoolStatus()
      const consumedKey = status.maskedKeys.find((k) => k.status === "CONSUMED")
      expect(consumedKey).toBeTruthy()
      const result = await env.service.revokeKey(consumedKey!.id)
      expect(result).toBe(false)
    })

    it("cannot revoke a non-existent key", async () => {
      const result = await env.service.revokeKey("non-existent-id")
      expect(result).toBe(false)
    })
  })

  describe("getPoolStatus", () => {
    it("returns empty pool initially", async () => {
      const status = await env.service.getPoolStatus()
      expect(status.availableCount).toBe(0)
      expect(status.totalCount).toBe(0)
      expect(status.maxPoolSize).toBe(5)
      expect(status.maskedKeys).toHaveLength(0)
    })

    it("shows masked keys with correct status", async () => {
      const keys = await env.service.generateKeys()
      const status = await env.service.getPoolStatus()
      expect(status.maskedKeys).toHaveLength(3)
      for (const mk of status.maskedKeys) {
        expect(mk.prefix).toHaveLength(4)
        expect(mk.status).toBe("AVAILABLE")
      }
    })

    it("reflects consumed and revoked keys", async () => {
      const keys = await env.service.generateKeys()
      await env.service.consumeKey(keys[0]!.key)
      const keyId = (await env.service.getPoolStatus()).maskedKeys[1]!.id
      await env.service.revokeKey(keyId)
      const status = await env.service.getPoolStatus()
      const consumed = status.maskedKeys.find((k) => k.status === "CONSUMED")
      const revoked = status.maskedKeys.find((k) => k.status === "REVOKED")
      expect(consumed).toBeTruthy()
      expect(revoked).toBeTruthy()
      expect(status.availableCount).toBe(1)
    })
  })
})
