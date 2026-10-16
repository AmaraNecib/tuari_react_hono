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
      } catch {
        // Rejected by the gate; recorded by absence.
      }
    }

    expect([...offeredIds].sort()).toEqual(["a-instock", "c-instock"])
    expect([...acceptedIds].sort()).toEqual([...offeredIds].sort())
  })
})
