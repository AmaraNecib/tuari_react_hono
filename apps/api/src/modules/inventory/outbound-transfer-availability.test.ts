/**
 * The outbound write gate (issue #450).
 *
 * The item picker offers DEFINITIONS and enforces one availability rule:
 * `resolveItemOffer(outboundPickUsage(source))`, i.e. active AND holding stock at
 * the chosen source. The write gate must accept exactly what that rule offers.
 *
 * These tests drive the real `InventoryService.createOutboundTransfer` over the
 * production schema, because the two defects they pin are both about which rows
 * the write path touches:
 *
 *   1. it passed an item DEFINITION id where an inventory ENTRY id was expected,
 *      so a consumable transfer hit the wrong balance (or none at all);
 *   2. it listed asset units at the source without narrowing to the definition.
 *
 * Fixtures are inserted by raw SQL so a definition id can be made to collide with
 * an unrelated entry id — the only way to make the old code corrupt a wrong row
 * deterministically instead of failing on a lookup miss.
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"

import {
  outboundPickUsage,
  resolveItemOffer,
  type InventoryItemOfferSource,
} from "@tuari/contracts"

import { ensureDatabaseSchema } from "../../infrastructure/database/schema"
import { BetterSqlite3Executor } from "../../infrastructure/database/sqlite-executor"
import { createInventoryRepository } from "./adapters/sqlite-inventory.repository"
import { InventoryError } from "./inventory.errors"
import type { InventoryRepository } from "./inventory.repository"
import { InventoryService } from "./inventory.service"
import type { InventoryAttachmentStorage } from "./inventory.storage"
import type { MutationAuditContext } from "../company/company.types"

const NOW = "2026-06-01T00:00:00.000Z"
const LATER = "2026-06-01T00:10:00.000Z"
const AUDIT: MutationAuditContext = { actorUserId: "user-1", actorLabel: "test", transactionId: "tx-1" }

async function createEnv(): Promise<{ db: Database.Database; repository: InventoryRepository; service: InventoryService }> {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  // The production bootstrap, not the base schema: `OUTBOUND_SALE` is only a
  // valid movement type after the outbound-transfer migration.
  await ensureDatabaseSchema(new BetterSqlite3Executor(db))
  const repository = createInventoryRepository(db)
  // `createOutboundTransfer` requires a debt gate to exist. These fixtures carry
  // no debt (`debtAmountDzd` omitted), so the stub must never be called.
  const debtService = {
    createDebtAccount: () => {
      throw new Error("debt service was not expected to be called")
    },
    createDebtEntry: () => {
      throw new Error("debt service was not expected to be called")
    },
  }
  const service = new InventoryService(repository, {} as unknown as InventoryAttachmentStorage, debtService)
  return { db, repository, service }
}

function seedWarehouse(db: Database.Database, id: string, name = id): void {
  db.prepare(`INSERT INTO "warehouse" ("id", "name", "status", "created_at", "updated_at") VALUES (?, ?, 'ACTIVE', ?, ?)`).run(id, name, NOW, NOW)
}

function seedProject(db: Database.Database, id: string): void {
  db.prepare(`INSERT INTO "project" ("id", "name", "status", "created_at", "updated_at") VALUES (?, ?, 'ACTIVE', ?, ?)`).run(id, id, NOW, NOW)
}

function seedCounterparty(db: Database.Database, id: string): void {
  db.prepare(`INSERT INTO "external_counterparty" ("id", "full_name", "phone_number", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?)`).run(id, "مشتر", "0218000000", NOW, NOW)
}

function seedGroup(db: Database.Database, id: string): void {
  db.prepare(`INSERT INTO "inventory_invoice_group" ("id", "supplier_name", "created_at", "updated_at") VALUES (?, 'مورد', ?, ?)`).run(id, NOW, NOW)
}

function seedDefinition(db: Database.Database, input: { id: string; itemType: "CONSUMABLE" | "ASSET"; isActive?: boolean }): void {
  db.prepare(
    `INSERT INTO "inventory_item_definition" ("id", "name", "item_type", "unit", "is_active", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.id, input.id, input.itemType, input.itemType === "CONSUMABLE" ? "قطعة" : null, input.isActive === false ? 0 : 1, NOW, NOW)
}

function seedEntry(db: Database.Database, input: { id: string; invoiceGroupId: string; itemDefinitionId: string; itemType: "CONSUMABLE" | "ASSET" }): void {
  db.prepare(
    `INSERT INTO "inventory_entry" ("id", "invoice_group_id", "item_definition_id", "item_type", "item_name", "unit", "quantity", "total_price_dzd", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  ).run(input.id, input.invoiceGroupId, input.itemDefinitionId, input.itemType, input.id, input.itemType === "CONSUMABLE" ? "قطعة" : null, NOW, NOW)
}

function seedBalance(db: Database.Database, input: { id: string; entryId: string; itemDefinitionId: string; warehouseId?: string; projectId?: string; quantity: number; createdAt?: string }): void {
  db.prepare(
    `INSERT INTO "inventory_consumable_balance" ("id", "inventory_entry_id", "item_definition_id", "warehouse_id", "project_id", "quantity", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.id, input.entryId, input.itemDefinitionId, input.warehouseId ?? null, input.projectId ?? null, input.quantity, input.createdAt ?? NOW, NOW)
}

function seedAsset(db: Database.Database, input: { id: string; entryId: string; warehouseId?: string; projectId?: string; updatedAt?: string }): void {
  db.prepare(
    `INSERT INTO "inventory_asset_unit" ("id", "inventory_entry_id", "asset_name", "purchase_price_dzd", "current_warehouse_id", "current_project_id", "created_at", "updated_at") VALUES (?, ?, ?, 100, ?, ?, ?, ?)`,
  ).run(input.id, input.entryId, input.id, input.warehouseId ?? null, input.projectId ?? null, NOW, input.updatedAt ?? NOW)
}

const SOURCE_AT_WAREHOUSE = (warehouseId: string): InventoryItemOfferSource => ({ locationType: "WAREHOUSE", warehouseId })
const SOURCE_AT_PROJECT = (projectId: string): InventoryItemOfferSource => ({ locationType: "PROJECT", projectId })

type Env = Awaited<ReturnType<typeof createEnv>>
const envs: Database.Database[] = []

afterEach(() => {
  while (envs.length > 0) {
    envs.pop()?.close()
  }
})

async function openEnv(): Promise<Env> {
  const env = await createEnv()
  envs.push(env.db)
  return env
}

describe("createOutboundTransfer resolves a definition to its stock rows (#450)", () => {
  it("decrements the balance of the picked definition, not an entry that shares its id", async () => {
    const env = await openEnv()
    seedWarehouse(env.db, "wh-1")
    seedCounterparty(env.db, "buyer")
    seedGroup(env.db, "g")
    seedDefinition(env.db, { id: "def-a", itemType: "CONSUMABLE" })
    seedDefinition(env.db, { id: "def-b", itemType: "CONSUMABLE" })
    // The trap: definition `def-a` and this entry share an id string. The old
    // code looked a balance up by `inventoryEntryId = def-a` and would find
    // definition B's balance here.
    seedEntry(env.db, { id: "entry-a", invoiceGroupId: "g", itemDefinitionId: "def-a", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "def-a", invoiceGroupId: "g", itemDefinitionId: "def-b", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-a", entryId: "entry-a", itemDefinitionId: "def-a", warehouseId: "wh-1", quantity: 100 })
    seedBalance(env.db, { id: "bal-b", entryId: "def-a", itemDefinitionId: "def-b", warehouseId: "wh-1", quantity: 50 })

    env.service.createOutboundTransfer(
      {
        fromType: "WAREHOUSE",
        fromId: "wh-1",
        counterpartyId: "buyer",
        transferType: "SALE",
        items: [{ itemId: "def-a", quantity: 10 }],
      },
      AUDIT,
    )

    const balances = env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })
    expect(balances.find((balance) => balance.id === "bal-a")?.quantity).toBe(90)
    expect(balances.find((balance) => balance.id === "bal-b")?.quantity).toBe(50)

    // The movement must name the real entry, never the definition id it was picked by.
    const movements = env.repository.listAllMovements({})
    expect(movements).toHaveLength(1)
    expect(movements[0]!.movementType).toBe("OUTBOUND_SALE")
    expect(movements[0]!.inventoryEntryId).toBe("entry-a")
    expect(movements[0]!.quantity).toBe(10)
  })

  it("consumes a definition's stock across every balance at the source", async () => {
    const env = await openEnv()
    seedWarehouse(env.db, "wh-1")
    seedCounterparty(env.db, "buyer")
    seedGroup(env.db, "g")
    seedDefinition(env.db, { id: "def-split", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "entry-old", invoiceGroupId: "g", itemDefinitionId: "def-split", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "entry-new", invoiceGroupId: "g", itemDefinitionId: "def-split", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-old", entryId: "entry-old", itemDefinitionId: "def-split", warehouseId: "wh-1", quantity: 30, createdAt: NOW })
    seedBalance(env.db, { id: "bal-new", entryId: "entry-new", itemDefinitionId: "def-split", warehouseId: "wh-1", quantity: 70, createdAt: LATER })

    env.service.createOutboundTransfer(
      {
        fromType: "WAREHOUSE",
        fromId: "wh-1",
        counterpartyId: "buyer",
        transferType: "SALE",
        items: [{ itemId: "def-split", quantity: 50 }],
      },
      AUDIT,
    )

    const balances = env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })
    // Oldest stock first: the first balance is emptied and deleted, the second
    // keeps the remainder. No row is left below its source total.
    expect(balances.find((balance) => balance.id === "bal-old")).toBeUndefined()
    expect(balances.find((balance) => balance.id === "bal-new")?.quantity).toBe(50)

    const movements = env.repository.listAllMovements({})
    expect(movements.map((movement) => [movement.inventoryEntryId, movement.quantity]).sort()).toEqual([
      ["entry-new", 20],
      ["entry-old", 30],
    ])
  })

  it("moves only the picked definition's asset units, not the first units at the source", async () => {
    const env = await openEnv()
    seedWarehouse(env.db, "wh-1")
    seedCounterparty(env.db, "buyer")
    seedGroup(env.db, "g")
    seedDefinition(env.db, { id: "def-tool", itemType: "ASSET" })
    seedDefinition(env.db, { id: "def-mixer", itemType: "ASSET" })
    seedEntry(env.db, { id: "entry-tool", invoiceGroupId: "g", itemDefinitionId: "def-tool", itemType: "ASSET" })
    seedEntry(env.db, { id: "entry-mixer", invoiceGroupId: "g", itemDefinitionId: "def-mixer", itemType: "ASSET" })
    seedAsset(env.db, { id: "asset-tool", entryId: "entry-tool", warehouseId: "wh-1", updatedAt: NOW })
    // Sorts first by `updatedAt DESC`, so the old unfiltered slice picked this one.
    seedAsset(env.db, { id: "asset-mixer", entryId: "entry-mixer", warehouseId: "wh-1", updatedAt: LATER })

    env.service.createOutboundTransfer(
      {
        fromType: "WAREHOUSE",
        fromId: "wh-1",
        counterpartyId: "buyer",
        transferType: "SALE",
        items: [{ itemId: "def-tool", quantity: 1 }],
      },
      AUDIT,
    )

    expect(env.repository.getAssetUnitById("asset-tool")?.currentWarehouseId).toBeNull()
    expect(env.repository.getAssetUnitById("asset-mixer")?.currentWarehouseId).toBe("wh-1")

    const movements = env.repository.listAllMovements({})
    expect(movements).toHaveLength(1)
    expect(movements[0]!.assetUnitId).toBe("asset-tool")
    expect(movements[0]!.inventoryEntryId).toBe("entry-tool")
  })
})

describe("the outbound write gate accepts exactly what the picker offers (#450)", () => {
  const FIXTURES: Array<{ id: string; itemType: "CONSUMABLE" | "ASSET"; isActive?: boolean; balanceAt?: "wh-1" | "prj-1"; assetAt?: "wh-1" }> = [
    { id: "c-instock", itemType: "CONSUMABLE", balanceAt: "wh-1" },
    { id: "a-instock", itemType: "ASSET", assetAt: "wh-1" },
    { id: "c-elsewhere", itemType: "CONSUMABLE", balanceAt: "prj-1" },
    { id: "c-archived", itemType: "CONSUMABLE", isActive: false, balanceAt: "wh-1" },
    { id: "c-empty", itemType: "CONSUMABLE" },
  ]

  it("agrees with the paged picker for a warehouse source", async () => {
    const env = await openEnv()
    seedWarehouse(env.db, "wh-1")
    seedProject(env.db, "prj-1")
    seedCounterparty(env.db, "buyer")
    seedGroup(env.db, "g")
    for (const fixture of FIXTURES) {
      seedDefinition(env.db, fixture)
      const entryId = `entry-${fixture.id}`
      if (fixture.balanceAt || fixture.assetAt) {
        seedEntry(env.db, { id: entryId, invoiceGroupId: "g", itemDefinitionId: fixture.id, itemType: fixture.itemType })
      }
      if (fixture.balanceAt === "wh-1") seedBalance(env.db, { id: `bal-${fixture.id}`, entryId, itemDefinitionId: fixture.id, warehouseId: "wh-1", quantity: 10 })
      if (fixture.balanceAt === "prj-1") seedBalance(env.db, { id: `bal-${fixture.id}`, entryId, itemDefinitionId: fixture.id, projectId: "prj-1", quantity: 10 })
      if (fixture.assetAt === "wh-1") seedAsset(env.db, { id: `asset-${fixture.id}`, entryId, warehouseId: "wh-1" })
    }

    const source = SOURCE_AT_WAREHOUSE("wh-1")
    const offeredIds = new Set(
      env.repository.listItemDefinitionsPaged({ filter: resolveItemOffer(outboundPickUsage(source)), limit: 50 }).items.map((item) => item.id),
    )

    const acceptedIds = new Set<string>()
    for (const fixture of FIXTURES) {
      try {
        env.service.createOutboundTransfer(
          {
            fromType: "WAREHOUSE",
            fromId: "wh-1",
            counterpartyId: "buyer",
            transferType: "SALE",
            items: [{ itemId: fixture.id, quantity: 1 }],
          },
          AUDIT,
        )
        acceptedIds.add(fixture.id)
      } catch (error) {
        // Rejected by the gate. A wrong error class (e.g. NOT_FOUND from a broken
        // definition lookup) must not count as a rejection, or this parity would
        // be satisfied by the very bug it guards against.
        expect(error).toBeInstanceOf(InventoryError)
        expect((error as InventoryError).appError.code).toBe("BUSINESS_RULE")
      }
    }

    expect([...offeredIds].sort()).toEqual(["a-instock", "c-instock"])
    expect([...acceptedIds].sort()).toEqual([...offeredIds].sort())
  })

  it("agrees with the paged picker for a project source", async () => {
    const env = await openEnv()
    seedWarehouse(env.db, "wh-1")
    seedProject(env.db, "prj-1")
    seedCounterparty(env.db, "buyer")
    seedGroup(env.db, "g")
    seedDefinition(env.db, { id: "c-at-prj", itemType: "CONSUMABLE" })
    seedDefinition(env.db, { id: "c-at-wh", itemType: "CONSUMABLE" })
    seedDefinition(env.db, { id: "a-at-prj", itemType: "ASSET" })
    seedEntry(env.db, { id: "e-cprj", invoiceGroupId: "g", itemDefinitionId: "c-at-prj", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-cwh", invoiceGroupId: "g", itemDefinitionId: "c-at-wh", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-aprj", invoiceGroupId: "g", itemDefinitionId: "a-at-prj", itemType: "ASSET" })
    seedBalance(env.db, { id: "b-cprj", entryId: "e-cprj", itemDefinitionId: "c-at-prj", projectId: "prj-1", quantity: 10 })
    seedBalance(env.db, { id: "b-cwh", entryId: "e-cwh", itemDefinitionId: "c-at-wh", warehouseId: "wh-1", quantity: 10 })
    seedAsset(env.db, { id: "asset-aprj", entryId: "e-aprj", projectId: "prj-1" })

    // The project columns are a different arm of the shared source predicate; a
    // swap here would ship silently without this case.
    const source = SOURCE_AT_PROJECT("prj-1")
    const offeredIds = new Set(
      env.repository.listItemDefinitionsPaged({ filter: resolveItemOffer(outboundPickUsage(source)), limit: 50 }).items.map((item) => item.id),
    )
    expect([...offeredIds].sort()).toEqual(["a-at-prj", "c-at-prj"])

    const acceptedIds = new Set<string>()
    for (const itemId of ["c-at-prj", "c-at-wh", "a-at-prj"]) {
      try {
        env.service.createOutboundTransfer(
          { fromType: "PROJECT", fromId: "prj-1", counterpartyId: "buyer", transferType: "SALE", items: [{ itemId, quantity: 1 }] },
          AUDIT,
        )
        acceptedIds.add(itemId)
      } catch (error) {
        expect(error).toBeInstanceOf(InventoryError)
      }
    }

    expect([...acceptedIds].sort()).toEqual([...offeredIds].sort())
  })
})

describe("outbound consumption semantics and guards (#450)", () => {
  function seedBase(env: Env): void {
    seedWarehouse(env.db, "wh-1")
    seedCounterparty(env.db, "buyer")
    seedGroup(env.db, "g")
  }

  function transfer(env: Env, items: Array<{ itemId: string; quantity: number }>): void {
    env.service.createOutboundTransfer(
      { fromType: "WAREHOUSE", fromId: "wh-1", counterpartyId: "buyer", transferType: "SALE", items },
      AUDIT,
    )
  }

  it("rejects a request above the total across balances, and accepts exactly the total", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-b1", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-b1", invoiceGroupId: "g", itemDefinitionId: "def-b1", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-b2", invoiceGroupId: "g", itemDefinitionId: "def-b1", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-b1", entryId: "e-b1", itemDefinitionId: "def-b1", warehouseId: "wh-1", quantity: 3, createdAt: NOW })
    seedBalance(env.db, { id: "bal-b2", entryId: "e-b2", itemDefinitionId: "def-b1", warehouseId: "wh-1", quantity: 2, createdAt: LATER })

    expect(() => transfer(env, [{ itemId: "def-b1", quantity: 6 }])).toThrow(/غير متوفرة/)
    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })).toHaveLength(2)

    transfer(env, [{ itemId: "def-b1", quantity: 5 }])
    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })).toHaveLength(0)
    expect(env.repository.listAllMovements({}).map((movement) => movement.quantity).sort((a, b) => a - b)).toEqual([2, 3])
  })

  it("consumes two lines of the same definition against one balance", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-two", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-two", invoiceGroupId: "g", itemDefinitionId: "def-two", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-two", entryId: "e-two", itemDefinitionId: "def-two", warehouseId: "wh-1", quantity: 10 })

    transfer(env, [{ itemId: "def-two", quantity: 6 }, { itemId: "def-two", quantity: 4 }])

    // The gate re-reads the stock inside the loop, so the second line sees the
    // first's decrement instead of double-spending the same balance.
    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })).toHaveLength(0)
    const movements = env.repository.listAllMovements({})
    expect(movements.map((movement) => movement.quantity).sort((a, b) => b - a)).toEqual([6, 4])
    expect(movements.every((movement) => movement.inventoryEntryId === "e-two")).toBe(true)
  })

  it("moves a definition's asset units with one movement per unit and leaves other definitions alone", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-units", itemType: "ASSET" })
    seedEntry(env.db, { id: "e-units", invoiceGroupId: "g", itemDefinitionId: "def-units", itemType: "ASSET" })
    seedAsset(env.db, { id: "asset-old", entryId: "e-units", warehouseId: "wh-1", updatedAt: NOW })
    seedAsset(env.db, { id: "asset-new", entryId: "e-units", warehouseId: "wh-1", updatedAt: LATER })
    seedDefinition(env.db, { id: "def-other", itemType: "ASSET" })
    seedEntry(env.db, { id: "e-other", invoiceGroupId: "g", itemDefinitionId: "def-other", itemType: "ASSET" })
    seedAsset(env.db, { id: "asset-other", entryId: "e-other", warehouseId: "wh-1", updatedAt: "2026-06-01T00:20:00.000Z" })

    transfer(env, [{ itemId: "def-units", quantity: 2 }])

    expect(env.repository.getAssetUnitById("asset-old")?.currentWarehouseId).toBeNull()
    expect(env.repository.getAssetUnitById("asset-new")?.currentWarehouseId).toBeNull()
    expect(env.repository.getAssetUnitById("asset-other")?.currentWarehouseId).toBe("wh-1")

    const movements = env.repository.listAllMovements({})
    expect(movements).toHaveLength(2)
    expect(movements.every((movement) => movement.quantity === 1 && movement.inventoryEntryId === "e-units")).toBe(true)
    expect([...movements.map((movement) => movement.assetUnitId)].sort()).toEqual(["asset-new", "asset-old"])
  })

  it("rolls back a partial transfer when a later item is unavailable", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-ok", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-ok", invoiceGroupId: "g", itemDefinitionId: "def-ok", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-ok", entryId: "e-ok", itemDefinitionId: "def-ok", warehouseId: "wh-1", quantity: 10 })
    seedDefinition(env.db, { id: "def-empty", itemType: "CONSUMABLE" })

    expect(() => transfer(env, [{ itemId: "def-ok", quantity: 4 }, { itemId: "def-empty", quantity: 1 }])).toThrow()

    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" }).find((balance) => balance.id === "bal-ok")?.quantity).toBe(10)
    expect(env.repository.listAllMovements({})).toHaveLength(0)
    expect(env.repository.listOutboundTransfers()).toHaveLength(0)
  })

  it("refuses a non-positive quantity before writing anything", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-zero", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-zero", invoiceGroupId: "g", itemDefinitionId: "def-zero", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-zero", entryId: "e-zero", itemDefinitionId: "def-zero", warehouseId: "wh-1", quantity: 10 })

    // The wire schema already enforces this; the service must not trust the wire.
    expect(() => transfer(env, [{ itemId: "def-zero", quantity: 0 }])).toThrow(/أكبر من صفر/)
    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" }).find((balance) => balance.id === "bal-zero")?.quantity).toBe(10)
    expect(env.repository.listOutboundTransfers()).toHaveLength(0)
  })

  it("rejects an id that is an inventory entry, not a definition", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-x", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "entry-not-def", invoiceGroupId: "g", itemDefinitionId: "def-x", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-x", entryId: "entry-not-def", itemDefinitionId: "def-x", warehouseId: "wh-1", quantity: 10 })

    // The inverse of the original confusion: an entry id is not a definition id.
    expect(() => transfer(env, [{ itemId: "entry-not-def", quantity: 1 }])).toThrow(/غير موجود/)
  })

  it("returns the create envelope the RPC contract declares", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-env", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-env", invoiceGroupId: "g", itemDefinitionId: "def-env", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-env", entryId: "e-env", itemDefinitionId: "def-env", warehouseId: "wh-1", quantity: 5 })

    // `inventoryOutboundTransfersCreate` declares `createEntityResultSchema`, so
    // a bare record is an ORPC output-validation failure on the client.
    const result = env.service.createOutboundTransfer(
      { fromType: "WAREHOUSE", fromId: "wh-1", counterpartyId: "buyer", transferType: "SALE", items: [{ itemId: "def-env", quantity: 1 }] },
      AUDIT,
    )

    expect(result).toMatchObject({
      success: true,
      message: expect.any(String),
      item: { fromType: "WAREHOUSE", fromId: "wh-1", counterpartyId: "buyer", transferType: "SALE", status: "COMPLETED" },
    })
  })
})

describe("fractional consumable quantities round through one rule (#450 round 4)", () => {
  function seedBase(env: Env): void {
    seedWarehouse(env.db, "wh-1")
    seedCounterparty(env.db, "buyer")
    seedGroup(env.db, "g")
  }

  function transfer(env: Env, items: Array<{ itemId: string; quantity: number }>): void {
    env.service.createOutboundTransfer(
      { fromType: "WAREHOUSE", fromId: "wh-1", counterpartyId: "buyer", transferType: "SALE", items },
      AUDIT,
    )
  }

  it("accepts a request equal to the sum of fractional balances (0.7 + 0.1 = 0.8)", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-frac", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-frac-1", invoiceGroupId: "g", itemDefinitionId: "def-frac", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-frac-2", invoiceGroupId: "g", itemDefinitionId: "def-frac", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-frac-1", entryId: "e-frac-1", itemDefinitionId: "def-frac", warehouseId: "wh-1", quantity: 0.7, createdAt: NOW })
    seedBalance(env.db, { id: "bal-frac-2", entryId: "e-frac-2", itemDefinitionId: "def-frac", warehouseId: "wh-1", quantity: 0.1, createdAt: LATER })

    // 0.7 + 0.1 is 0.7999999999999999 unrounded; the request must still match.
    transfer(env, [{ itemId: "def-frac", quantity: 0.8 }])

    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })).toHaveLength(0)
    expect(env.repository.listAllMovements({}).map((movement) => movement.quantity).sort((a, b) => a - b)).toEqual([0.1, 0.7])
  })

  it("leaves no float residual the picker would still offer after a full consume", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-dust", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-dust-1", invoiceGroupId: "g", itemDefinitionId: "def-dust", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-dust-2", invoiceGroupId: "g", itemDefinitionId: "def-dust", itemType: "CONSUMABLE" })
    // 0.1 + 0.2 is exactly 0.30000000000000004, so the pre-fix total check PASSES
    // and the residue is left by the subtraction: 0.2 - (0.3 - 0.1) is 2.78e-17.
    seedBalance(env.db, { id: "bal-dust-1", entryId: "e-dust-1", itemDefinitionId: "def-dust", warehouseId: "wh-1", quantity: 0.1, createdAt: NOW })
    seedBalance(env.db, { id: "bal-dust-2", entryId: "e-dust-2", itemDefinitionId: "def-dust", warehouseId: "wh-1", quantity: 0.2, createdAt: LATER })

    transfer(env, [{ itemId: "def-dust", quantity: 0.3 }])

    // The whole balance is consumed, so the source holds none of it and the
    // picker (the SQL `quantity > 0` predicate) must stop offering the definition.
    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })).toHaveLength(0)
    const offered = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer(outboundPickUsage(SOURCE_AT_WAREHOUSE("wh-1"))),
      limit: 50,
    }).items
    expect(offered.map((item) => item.id)).not.toContain("def-dust")
  })

  it("leaves the exact remainder on a genuine partial consume", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-part", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-part", invoiceGroupId: "g", itemDefinitionId: "def-part", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-part", entryId: "e-part", itemDefinitionId: "def-part", warehouseId: "wh-1", quantity: 0.7 })

    // 0.7 - 0.2 is 0.49999999999999994 unrounded; the stored remainder is 0.5.
    transfer(env, [{ itemId: "def-part", quantity: 0.2 }])

    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" }).find((balance) => balance.id === "bal-part")?.quantity).toBe(0.5)
    expect(env.repository.listAllMovements({})[0]!.quantity).toBe(0.2)
  })

  it("keeps an inbound consumable transfer's fractional remainder exact", async () => {
    const env = await openEnv()
    seedBase(env)
    seedProject(env.db, "prj-1")
    seedDefinition(env.db, { id: "def-inbound", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-inbound", invoiceGroupId: "g", itemDefinitionId: "def-inbound", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-inbound", entryId: "e-inbound", itemDefinitionId: "def-inbound", warehouseId: "wh-1", quantity: 0.7 })

    // The sibling inbound path shares the subtraction rule, so a partial move
    // must also leave 0.5 rather than 0.49999999999999994.
    env.service.transferConsumable(
      { inventoryEntryId: "e-inbound", quantity: 0.2, fromWarehouseId: "wh-1", toProjectId: "prj-1" },
      AUDIT,
    )

    expect(env.repository.getConsumableBalanceByEntryAndLocation({ inventoryEntryId: "e-inbound", warehouseId: "wh-1" })?.quantity).toBe(0.5)
    expect(env.repository.getConsumableBalanceByEntryAndLocation({ inventoryEntryId: "e-inbound", projectId: "prj-1" })?.quantity).toBe(0.2)
  })

  it("rounds a noisy request before comparing it with the available total", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-noisy", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-noisy", invoiceGroupId: "g", itemDefinitionId: "def-noisy", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-noisy", entryId: "e-noisy", itemDefinitionId: "def-noisy", warehouseId: "wh-1", quantity: 0.3 })

    // A wire-legal request `0.1 + 0.2` is 0.30000000000000004; it must still
    // match a 0.3 balance rather than be rejected as an over-request.
    transfer(env, [{ itemId: "def-noisy", quantity: 0.1 + 0.2 }])

    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" })).toHaveLength(0)
    expect(env.repository.listAllMovements({})[0]!.quantity).toBe(0.3)
  })

  it("rejects a request below the storage quantum instead of writing a zero movement", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-dust", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-dust", invoiceGroupId: "g", itemDefinitionId: "def-dust", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-dust", entryId: "e-dust", itemDefinitionId: "def-dust", warehouseId: "wh-1", quantity: 0.5 })

    // 4e-7 rounds to 0: writing it would leave the balance untouched and record
    // a zero-quantity OUTBOUND_SALE the movement schema forbids.
    expect(() => transfer(env, [{ itemId: "def-dust", quantity: 0.0000004 }])).toThrow(/أصغر من الدقة/)
    expect(env.repository.listConsumableBalancesByLocation({ warehouseId: "wh-1" }).find((balance) => balance.id === "bal-dust")?.quantity).toBe(0.5)
    expect(env.repository.listAllMovements({})).toHaveLength(0)
  })

  it("rejects an inbound request below the storage quantum before touching a balance", async () => {
    const env = await openEnv()
    seedBase(env)
    seedProject(env.db, "prj-1")
    seedDefinition(env.db, { id: "def-sub", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-sub", invoiceGroupId: "g", itemDefinitionId: "def-sub", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-sub", entryId: "e-sub", itemDefinitionId: "def-sub", warehouseId: "wh-1", quantity: 0.5 })

    // A zero would be written to the target balance and violate the DB CHECK.
    expect(() =>
      env.service.transferConsumable(
        { inventoryEntryId: "e-sub", quantity: 0.0000004, fromWarehouseId: "wh-1", toProjectId: "prj-1" },
        AUDIT,
      ),
    ).toThrow(/أصغر من الدقة/)
    expect(env.repository.getConsumableBalanceByEntryAndLocation({ inventoryEntryId: "e-sub", warehouseId: "wh-1" })?.quantity).toBe(0.5)
  })

  it("keeps an inbound movement equal to its balance deltas on a noisy request", async () => {
    const env = await openEnv()
    seedBase(env)
    seedProject(env.db, "prj-1")
    seedDefinition(env.db, { id: "def-delta", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-delta", invoiceGroupId: "g", itemDefinitionId: "def-delta", itemType: "CONSUMABLE" })
    seedBalance(env.db, { id: "bal-delta", entryId: "e-delta", itemDefinitionId: "def-delta", warehouseId: "wh-1", quantity: 0.5 })

    // 7-decimal requests are legal input; the rounded quantity must be what both
    // the balances and the movement record, or the two drift apart.
    env.service.transferConsumable(
      { inventoryEntryId: "e-delta", quantity: 0.1000004, fromWarehouseId: "wh-1", toProjectId: "prj-1" },
      AUDIT,
    )
    env.service.transferConsumable(
      { inventoryEntryId: "e-delta", quantity: 0.2000004, fromWarehouseId: "wh-1", toProjectId: "prj-1" },
      AUDIT,
    )

    expect(env.repository.getConsumableBalanceByEntryAndLocation({ inventoryEntryId: "e-delta", warehouseId: "wh-1" })?.quantity).toBe(0.2)
    expect(env.repository.getConsumableBalanceByEntryAndLocation({ inventoryEntryId: "e-delta", projectId: "prj-1" })?.quantity).toBe(0.3)
    // Each movement records the same rounded quantity the balances moved by
    // (0.5 - 0.1 - 0.2 = 0.2 at the source, 0.1 + 0.2 = 0.3 at the target).
    expect(env.repository.listAllMovements({}).map((movement) => movement.quantity).sort((a, b) => a - b)).toEqual([0.1, 0.2])
  })

  it("rejects an inbound request above a fractional stored balance", async () => {
    const env = await openEnv()
    seedBase(env)
    seedProject(env.db, "prj-1")
    seedDefinition(env.db, { id: "def-short", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-short", invoiceGroupId: "g", itemDefinitionId: "def-short", itemType: "CONSUMABLE" })
    // A legacy 7-decimal row must not be rounded up into a 0.5 request.
    seedBalance(env.db, { id: "bal-short", entryId: "e-short", itemDefinitionId: "def-short", warehouseId: "wh-1", quantity: 0.4999996 })

    expect(() =>
      env.service.transferConsumable(
        { inventoryEntryId: "e-short", quantity: 0.5, fromWarehouseId: "wh-1", toProjectId: "prj-1" },
        AUDIT,
      ),
    ).toThrow(/غير متوفرة/)
    expect(env.repository.getConsumableBalanceByEntryAndLocation({ inventoryEntryId: "e-short", warehouseId: "wh-1" })?.quantity).toBe(0.4999996)
  })

  it("treats a sub-quantum balance as empty in both the picker and the gate", async () => {
    const env = await openEnv()
    seedBase(env)
    seedDefinition(env.db, { id: "def-ghost", itemType: "CONSUMABLE" })
    seedEntry(env.db, { id: "e-ghost", invoiceGroupId: "g", itemDefinitionId: "def-ghost", itemType: "CONSUMABLE" })
    // The residual the pre-fix subtraction could leave: below the quantum, so
    // neither surface may treat it as stock.
    seedBalance(env.db, { id: "bal-ghost", entryId: "e-ghost", itemDefinitionId: "def-ghost", warehouseId: "wh-1", quantity: 5e-7 })

    const source = SOURCE_AT_WAREHOUSE("wh-1")
    const offered = env.repository.listItemDefinitionsPaged({ filter: resolveItemOffer(outboundPickUsage(source)), limit: 50 }).items
    expect(offered.map((item) => item.id)).not.toContain("def-ghost")
    expect(() => transfer(env, [{ itemId: "def-ghost", quantity: 1 }])).toThrow(/غير متوفر/)
  })
})
