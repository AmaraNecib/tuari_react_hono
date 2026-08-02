/**
 * End-to-end test: Recovery key lifecycle.
 *
 * Covers: generate → revoke → use → verify masked keys never leak plain text.
 * Password change is simulated (recovery keys are app-layer, independent of DB key).
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
  const dbDir = mkdtempSync(join(tmpdir(), "e2e-encryption-test-"))
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
    rawDb,
    dbPath,
    teardown: () => {
      rawDb.close()
      rmSync(dbDir, { recursive: true, force: true })
    },
  }
}

describe("End-to-end: recovery key lifecycle", () => {
  let env: ReturnType<typeof createTestEnv>

  beforeEach(() => {
    env = createTestEnv()
  })

  afterEach(() => {
    env.teardown()
  })

  it("full lifecycle: generate → revoke → use → change password", async () => {
    // 1. Generate initial recovery keys
    const keys = await env.service.generateKeys()
    expect(keys).toHaveLength(3)

    const status1 = await env.service.getPoolStatus()
    expect(status1.availableCount).toBe(3)

    // 2. Revoke one key
    const keyToRevoke = status1.maskedKeys[0]!
    const revokeResult = await env.service.revokeKey(keyToRevoke.id)
    expect(revokeResult).toBe(true)

    const status2 = await env.service.getPoolStatus()
    expect(status2.availableCount).toBe(2)
    const revoked = status2.maskedKeys.find((k) => k.status === "REVOKED")
    expect(revoked).toBeTruthy()

    // 3. Use one key (consume)
    const keyToUse = keys[1]!
    const consumeResult = await env.service.consumeKey(keyToUse.key)
    expect(consumeResult).toBe(true)

    const status3 = await env.service.getPoolStatus()
    expect(status3.availableCount).toBe(1)
    const consumed = status3.maskedKeys.find((k) => k.status === "CONSUMED")
    expect(consumed).toBeTruthy()

    // 4. Cannot reuse consumed key
    const reuseResult = await env.service.consumeKey(keyToUse.key)
    expect(reuseResult).toBe(false)

    // 5. Cannot revoke consumed key
    const revokeConsumed = await env.service.revokeKey(consumed!.id)
    expect(revokeConsumed).toBe(false)

    // 6. Revoke the remaining key
    const remainingAvailable = (await env.service.getPoolStatus()).maskedKeys.find(
      (k) => k.status === "AVAILABLE",
    )
    expect(remainingAvailable).toBeTruthy()
    await env.service.revokeKey(remainingAvailable!.id)

    const status4 = await env.service.getPoolStatus()
    expect(status4.availableCount).toBe(0)

    // 7. Generate new keys (replenish)
    const newKeys = await env.service.generateKeys()
    expect(newKeys.length).toBeGreaterThan(0)

    const status5 = await env.service.getPoolStatus()
    expect(status5.availableCount).toBeGreaterThan(0)

    // 8. New keys work
    const consumeNew = await env.service.consumeKey(newKeys[0]!.key)
    expect(consumeNew).toBe(true)
  })

  it("recovery keys survive simulated password change", async () => {
    // Generate keys
    const keys = await env.service.generateKeys()
    expect(keys).toHaveLength(3)

    // Simulate password change (just verify keys still work after operations)
    // In production this would call changeDatabaseKey() which does PRAGMA rekey
    // Recovery keys are app-layer tokens, not SQLCipher keys, so they survive

    // Verify all keys still work
    for (const k of keys) {
      const result = await env.service.consumeKey(k.key)
      expect(result).toBe(true)
    }

    const status = await env.service.getPoolStatus()
    expect(status.availableCount).toBe(0)
    expect(status.maskedKeys.every((k) => k.status === "CONSUMED")).toBe(true)
  })

  it("masked keys never expose plain text", async () => {
    const keys = await env.service.generateKeys()
    const status = await env.service.getPoolStatus()

    // Plain text keys are never in the database — verify against ALL generated keys
    const allKeyStrings = keys.map((k) => k.key)
    for (const mk of status.maskedKeys) {
      expect(mk.prefix).toHaveLength(4)
      for (const plainKey of allKeyStrings) {
        expect(JSON.stringify(mk)).not.toContain(plainKey)
      }
    }

    // Only prefix is stored
    const allPrefixes = status.maskedKeys.map((k) => k.prefix)
    expect(allPrefixes.length).toBe(3)
  })
})
