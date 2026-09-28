/**
 * DrizzleAssetChargeRepository against a REAL in-memory sqlite database.
 *
 * Pins the production adapter's behaviour that the in-memory double cannot:
 *   - insertion-order (rowid) chain ordering even when several writes land in
 *     the same millisecond;
 *   - the charge update + revision append commit together (and roll back
 *     together);
 *   - a write inside our own `withTransaction` joins it as a SAVEPOINT
 *     (issue #322/#348 discipline) rather than opening a second transaction.
 */
import { beforeEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"

import { schemaStatements } from "../../../infrastructure/database/schema-definitions"
import { createFifoLock } from "../../../infrastructure/database/fifo-lock"
import { createAssetChargeRepository } from "./sqlite-asset-charge.repository"

const NOW = "2026-06-01T00:00:00.000Z"

function createTestEnv() {
  const rawDb = new Database(":memory:")
  rawDb.pragma("foreign_keys = ON")
  for (const statement of schemaStatements) {
    rawDb.exec(statement)
  }

  const insertProject = rawDb.prepare(
    `INSERT INTO "project" ("id", "name", "status", "created_at", "updated_at") VALUES (?, ?, 'ACTIVE', ?, ?)`,
  )
  insertProject.run("project-a", "مشروع أ", NOW, NOW)
  insertProject.run("project-b", "مشروع ب", NOW, NOW)

  rawDb.prepare(
    `INSERT INTO "inventory_item_definition" ("id", "name", "item_type", "is_active", "created_at", "updated_at") VALUES ('def-1', 'مثقاب', 'ASSET', 1, ?, ?)`,
  ).run(NOW, NOW)
  rawDb.prepare(
    `INSERT INTO "inventory_invoice_group" ("id", "supplier_name", "created_at", "updated_at") VALUES ('group-1', 'مورد', ?, ?)`,
  ).run(NOW, NOW)
  rawDb.prepare(
    `INSERT INTO "inventory_entry" ("id", "invoice_group_id", "item_definition_id", "item_type", "item_name", "quantity", "total_price_dzd", "created_at", "updated_at") VALUES ('entry-1', 'group-1', 'def-1', 'ASSET', 'مثقاب', 1, 100000, ?, ?)`,
  ).run(NOW, NOW)
  rawDb.prepare(
    `INSERT INTO "inventory_asset_unit" ("id", "inventory_entry_id", "asset_name", "purchase_price_dzd", "created_at", "updated_at") VALUES ('asset-1', 'entry-1', 'مثقاب', 100000, ?, ?)`,
  ).run(NOW, NOW)

  const repository = createAssetChargeRepository(rawDb, createFifoLock())
  return { rawDb, repository }
}

const AUDIT = { actorUserId: "user-1", actorLabel: "مدير", transactionId: "tx-1" }

describe("DrizzleAssetChargeRepository (#413)", () => {
  let env: ReturnType<typeof createTestEnv>
  beforeEach(() => {
    env = createTestEnv()
  })

  it("keeps insertion order for a unit's chain even within one millisecond", () => {
    env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 })
    env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-b", amountDzd: 80_000 })
    env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 60_000 })

    expect(env.repository.listChargesByUnit("asset-1").map((charge) => charge.amountDzd)).toEqual([
      60_000,
      80_000,
      100_000,
    ])
  })

  it("returns the most recent live amount and ignores voided ones", () => {
    const first = env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 })
    env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-b", amountDzd: 40_000 })

    env.repository.updateCharge(
      first.id,
      { status: "VOID", voidedAt: NOW, voidedBy: "مدير", voidReason: null, updatedAt: NOW },
      { chargeId: first.id, previousAmountDzd: 100_000, newAmountDzd: null, actorLabel: "مدير" },
      AUDIT,
    )

    expect(env.repository.getLastChargeAmount("asset-1")).toBe(40_000)
  })

  it("appends a revision and updates the charge in one commit", () => {
    const charge = env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 })

    const updated = env.repository.updateCharge(
      charge.id,
      { amountDzd: 75_000, updatedAt: NOW },
      {
        chargeId: charge.id,
        previousAmountDzd: 100_000,
        newAmountDzd: 75_000,
        reason: "خصم",
        actorUserId: "user-1",
        actorLabel: "مدير",
      },
      AUDIT,
    )

    expect(updated?.amountDzd).toBe(75_000)
    expect(env.repository.listRevisions(charge.id)).toHaveLength(1)
    expect(env.repository.listRevisions(charge.id)[0]).toMatchObject({
      previousAmountDzd: 100_000,
      newAmountDzd: 75_000,
      reason: "خصم",
    })
  })

  it("refuses to update or append a revision to an already voided charge", () => {
    // `AND status='LIVE'` in the UPDATE: a second process that voided the row
    // after the reader's snapshot must leave it untouched (#422 round 4).
    const charge = env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 })
    env.repository.updateCharge(
      charge.id,
      { status: "VOID", voidedAt: NOW, voidedBy: "مدير", voidReason: null, updatedAt: NOW },
      { chargeId: charge.id, previousAmountDzd: 100_000, newAmountDzd: null, actorLabel: "مدير" },
      AUDIT,
    )

    const stale = env.repository.updateCharge(
      charge.id,
      { amountDzd: 7, updatedAt: NOW },
      { chargeId: charge.id, previousAmountDzd: 100_000, newAmountDzd: 7 },
      AUDIT,
    )

    expect(stale).toBeNull()
    expect(env.repository.getChargeById(charge.id)?.status).toBe("VOID")
    expect(env.repository.getChargeById(charge.id)?.amountDzd).toBe(100_000)
    // Only the void revision exists — the stale write appended nothing.
    expect(env.repository.listRevisions(charge.id)).toHaveLength(1)
  })

  it("resolves the project name once and attaches it to every row of the project", () => {
    env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 })
    env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 80_000 })

    const charges = env.repository.listChargesByProject("project-a")

    expect(charges).toHaveLength(2)
    expect(charges.every((charge) => charge.projectName === "مشروع أ")).toBe(true)
    // A different project's charge is not leaked into the list.
    expect(env.repository.listChargesByProject("project-b")).toHaveLength(0)
  })

  it("rolls the charge and its revision back together when the outer transaction throws", () => {
    expect(() =>
      env.repository.withTransaction(() => {
        const charge = env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 })
        env.repository.updateCharge(
          charge.id,
          { amountDzd: 10, updatedAt: NOW },
          { chargeId: charge.id, previousAmountDzd: 100_000, newAmountDzd: 10 },
          AUDIT,
        )
        throw new Error("boom")
      }),
    ).toThrowError("boom")

    expect(env.repository.listChargesByUnit("asset-1")).toHaveLength(0)
  })

  it("enforces the foreign keys: an unknown unit cannot be charged", () => {
    expect(() => env.repository.createCharge({ assetUnitId: "missing", projectId: "project-a", amountDzd: 1 }))
      .toThrowError(/FOREIGN KEY/i)
  })

  it("refuses to delete a project that still has a charge, keeping the record", () => {
    env.repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 })

    expect(() =>
      env.rawDb.prepare('DELETE FROM "project" WHERE "id" = ?').run("project-a"),
    ).toThrowError(/FOREIGN KEY/i)

    // The project and its charge are both still there.
    expect(env.repository.listChargesByProject("project-a")).toHaveLength(1)
    expect(env.rawDb.prepare('SELECT COUNT(*) AS n FROM "project" WHERE "id" = ?').get("project-a")).toEqual({ n: 1 })
  })
})
