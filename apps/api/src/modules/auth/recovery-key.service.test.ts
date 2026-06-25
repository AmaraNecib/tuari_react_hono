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

function createTestEnv() {
  const dbDir = mkdtempSync(join(tmpdir(), "recovery-key-test-"))
  const dbPath = join(dbDir, "test.sqlite")
  const rawDb = new Database(dbPath)
  rawDb.pragma("foreign_keys = ON")
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt)
  }
  const db = drizzle(rawDb as any, { schema })
  const service = new RecoveryKeyService(db, rawDb)
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
    it("generates 3 initial keys", () => {
      const keys = env.service.generateKeys()
      expect(keys).toHaveLength(3)
      for (const k of keys) {
        expect(k.key).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/)
        expect(k.prefix).toHaveLength(4)
        expect(k.createdAt).toBeTruthy()
      }
    })

    it("does not exceed max pool size", () => {
      env.service.generateKeys() // 3
      env.service.generateKeys() // generates 2 more (max 5, had 3)
      const status = env.service.getPoolStatus()
      expect(status.availableCount).toBe(5)
      // Third call should generate 0
      env.service.generateKeys()
      const status2 = env.service.getPoolStatus()
      expect(status2.availableCount).toBe(5)
    })

    it("generates unique keys", () => {
      const keys = env.service.generateKeys()
      const keyStrings = keys.map((k) => k.key)
      expect(new Set(keyStrings).size).toBe(keyStrings.length)
    })
  })

  describe("consumeKey", () => {
    it("consumes a valid key", () => {
      const keys = env.service.generateKeys()
      const result = env.service.consumeKey(keys[0]!.key)
      expect(result).toBe(true)
      const status = env.service.getPoolStatus()
      expect(status.availableCount).toBe(2)
    })

    it("rejects an invalid key", () => {
      env.service.generateKeys()
      const result = env.service.consumeKey("0000-0000-0000")
      expect(result).toBe(false)
      const status = env.service.getPoolStatus()
      expect(status.availableCount).toBe(3)
    })

    it("rejects a key twice (one-time use)", () => {
      const keys = env.service.generateKeys()
      expect(env.service.consumeKey(keys[0]!.key)).toBe(true)
      expect(env.service.consumeKey(keys[0]!.key)).toBe(false)
    })
  })

  describe("revokeKey", () => {
    it("revokes an available key", () => {
      const keys = env.service.generateKeys()
      const status = env.service.getPoolStatus()
      const keyId = status.maskedKeys[0]!.id
      const result = env.service.revokeKey(keyId)
      expect(result).toBe(true)
      const after = env.service.getPoolStatus()
      expect(after.availableCount).toBe(2)
    })

    it("cannot revoke a consumed key", () => {
      const keys = env.service.generateKeys()
      env.service.consumeKey(keys[0]!.key)
      const status = env.service.getPoolStatus()
      const consumedKey = status.maskedKeys.find((k) => k.status === "CONSUMED")
      expect(consumedKey).toBeTruthy()
      const result = env.service.revokeKey(consumedKey!.id)
      expect(result).toBe(false)
    })

    it("cannot revoke a non-existent key", () => {
      const result = env.service.revokeKey("non-existent-id")
      expect(result).toBe(false)
    })
  })

  describe("getPoolStatus", () => {
    it("returns empty pool initially", () => {
      const status = env.service.getPoolStatus()
      expect(status.availableCount).toBe(0)
      expect(status.totalCount).toBe(0)
      expect(status.maxPoolSize).toBe(5)
      expect(status.maskedKeys).toHaveLength(0)
    })

    it("shows masked keys with correct status", () => {
      const keys = env.service.generateKeys()
      const status = env.service.getPoolStatus()
      expect(status.maskedKeys).toHaveLength(3)
      for (const mk of status.maskedKeys) {
        expect(mk.prefix).toHaveLength(4)
        expect(mk.status).toBe("AVAILABLE")
      }
    })

    it("reflects consumed and revoked keys", () => {
      const keys = env.service.generateKeys()
      env.service.consumeKey(keys[0]!.key)
      const status = env.service.getPoolStatus()
      const consumed = status.maskedKeys.find((k) => k.status === "CONSUMED")
      expect(consumed).toBeTruthy()
      expect(status.availableCount).toBe(2)
    })
  })
})
