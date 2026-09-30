/**
 * The anti-drift test for the item-offer rule.
 *
 * The offer rule is data (`resolveItemOffer`) evaluated in two places: compiled
 * to SQL by the inventory repository for the paged picker, and in JS by
 * `matchesItemOfferFilter` at the write gate. This pins that the two evaluators
 * agree for EVERY fixture definition and EVERY usage — a definition appears in
 * the SQL result if and only if the JS evaluator accepts it.
 *
 * The fixture set deliberately includes one definition that EACH filter field
 * excludes (an asset for the consumable usage's `itemTypes`; an archived
 * definition for `activeOnly`), so adding a filter field without teaching the
 * SQL compiler fails this suite.
 */
import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"

import {
  invoiceLineUsage,
  matchesItemOfferFilter,
  outboundPickUsage,
  resolveItemOffer,
  type InventoryItemUsage,
  type ItemOfferCandidate,
} from "@tuari/contracts"

import { encodeCursor } from "../shared/cursor"
import { schemaStatements } from "../../infrastructure/database/schema-definitions"
import { createInventoryRepository } from "./adapters/sqlite-inventory.repository"
import type { InventoryRepository } from "./inventory.repository"
import { InventoryService } from "./inventory.service"
import type { InventoryAttachmentStorage } from "./inventory.storage"
import { InventoryError } from "./inventory.errors"

const NOW = "2026-06-01T00:00:00.000Z"

type Fixture = {
  id: string
  name: string
  itemType: "CONSUMABLE" | "ASSET"
  isActive: boolean
  /** Where the definition physically sits, as the availability rule reads it. */
  stock?: { warehouseId?: string; projectId?: string }
}

const FIXTURES: Fixture[] = [
  { id: "c-active", name: "إسمنت", itemType: "CONSUMABLE", isActive: true, stock: { warehouseId: "wh-1" } },
  { id: "a-active", name: "مثقاب", itemType: "ASSET", isActive: true, stock: { warehouseId: "wh-1" } },
  // Archived yet still physically present: availability must not rescue it.
  { id: "c-archived", name: "جير", itemType: "CONSUMABLE", isActive: false, stock: { warehouseId: "wh-1" } },
  { id: "a-archived", name: "خلاطة", itemType: "ASSET", isActive: false },
  // Stock only at the project source (the other half of the availability rule).
  { id: "p-active", name: "رمل", itemType: "CONSUMABLE", isActive: true, stock: { projectId: "prj-1" } },
]

const USAGES: InventoryItemUsage[] = [
  invoiceLineUsage("CONSUMABLE"),
  invoiceLineUsage("ASSET"),
  { surface: "STOCK_REFERENCE" },
  outboundPickUsage({ locationType: "WAREHOUSE", warehouseId: "wh-1" }),
  outboundPickUsage({ locationType: "PROJECT", projectId: "prj-1" }),
]

/** The JS evaluator's view of a fixture; must mirror what the SQL rows say. */
function candidateOf(fixture: Fixture): ItemOfferCandidate {
  return {
    itemType: fixture.itemType,
    isActive: fixture.isActive,
    stockWarehouseIds: fixture.stock?.warehouseId ? [fixture.stock.warehouseId] : [],
    stockProjectIds: fixture.stock?.projectId ? [fixture.stock.projectId] : [],
  }
}

/**
 * The availability evidence lives in the balance/asset tables, so the SQL
 * evaluator reads it from here; each fixture's `stock` is where its row goes.
 */
function seedStock(db: Database.Database): void {
  const insertWarehouse = db.prepare(
    `INSERT INTO "warehouse" ("id", "name", "status", "created_at", "updated_at") VALUES (?, ?, 'ACTIVE', ?, ?)`,
  )
  insertWarehouse.run("wh-1", "المستودع المركزي", NOW, NOW)
  insertWarehouse.run("wh-2", "مستودع فارغ", NOW, NOW)
  db.prepare(
    `INSERT INTO "project" ("id", "name", "status", "created_at", "updated_at") VALUES (?, ?, 'ACTIVE', ?, ?)`,
  ).run("prj-1", "مشروع التوسعة", NOW, NOW)
  db.prepare(
    `INSERT INTO "inventory_invoice_group" ("id", "supplier_name", "created_at", "updated_at") VALUES ('g-stock', 'مورد', ?, ?)`,
  ).run(NOW, NOW)

  const insertEntry = db.prepare(
    `INSERT INTO "inventory_entry" ("id", "invoice_group_id", "item_definition_id", "item_type", "item_name", "unit", "quantity", "total_price_dzd", "created_at", "updated_at") VALUES (?, 'g-stock', ?, ?, ?, ?, 1, 0, ?, ?)`,
  )
  const insertBalance = db.prepare(
    `INSERT INTO "inventory_consumable_balance" ("id", "inventory_entry_id", "item_definition_id", "warehouse_id", "project_id", "quantity", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  const insertAsset = db.prepare(
    `INSERT INTO "inventory_asset_unit" ("id", "inventory_entry_id", "asset_name", "purchase_price_dzd", "current_warehouse_id", "current_project_id", "created_at", "updated_at") VALUES (?, ?, ?, 100, ?, ?, ?, ?)`,
  )

  for (const fixture of FIXTURES) {
    if (!fixture.stock) continue
    const entryId = `entry-${fixture.id}`
    const warehouseId = fixture.stock.warehouseId ?? null
    const projectId = fixture.stock.projectId ?? null
    insertEntry.run(
      entryId,
      fixture.id,
      fixture.itemType,
      fixture.name,
      fixture.itemType === "CONSUMABLE" ? "قطعة" : null,
      NOW,
      NOW,
    )
    if (fixture.itemType === "CONSUMABLE") {
      insertBalance.run(`bal-${fixture.id}`, entryId, fixture.id, warehouseId, projectId, NOW, NOW)
    } else {
      insertAsset.run(`asset-${fixture.id}`, entryId, fixture.name, warehouseId, projectId, NOW, NOW)
    }
  }
}

function createEnv(): { db: Database.Database; repository: InventoryRepository } {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  for (const statement of schemaStatements) {
    db.exec(statement)
  }

  // The schema's unit CHECK requires a unit for CONSUMABLE definitions.
  const insert = db.prepare(
    `INSERT INTO "inventory_item_definition" ("id", "name", "item_type", "unit", "is_active", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const fixture of FIXTURES) {
    insert.run(
      fixture.id,
      fixture.name,
      fixture.itemType,
      fixture.itemType === "CONSUMABLE" ? "قطعة" : null,
      fixture.isActive ? 1 : 0,
      NOW,
      NOW,
    )
  }

  seedStock(db)

  return { db, repository: createInventoryRepository(db) }
}

/** Pages through the whole filtered set, exercising the cursor at limit 2. */
function collectOfferedIds(repository: InventoryRepository, usage: InventoryItemUsage): Set<string> {
  const ids = new Set<string>()
  let cursor: string | undefined
  let guard = 0

  do {
    const page = repository.listItemDefinitionsPaged({
      filter: resolveItemOffer(usage),
      cursor,
      limit: 2,
    })
    for (const item of page.items) {
      ids.add(item.id)
    }
    cursor = page.nextCursor ?? undefined
    if (++guard > 50) {
      throw new Error("paging did not terminate")
    }
  } while (cursor)

  return ids
}

const envs: Array<{ db: Database.Database }> = []

afterEach(() => {
  while (envs.length > 0) {
    envs.pop()?.db.close()
  }
})

describe("item-offer rule: SQL path equals JS path", () => {
  it("agrees for every fixture definition and every usage", () => {
    const env = createEnv()
    envs.push(env)

    for (const usage of USAGES) {
      const filter = resolveItemOffer(usage)
      const offered = collectOfferedIds(env.repository, usage)

      for (const fixture of FIXTURES) {
        const candidate = candidateOf(fixture)
        expect(
          offered.has(fixture.id),
          `${JSON.stringify(usage)} should ${matchesItemOfferFilter(filter, candidate) ? "" : "NOT "}offer ${fixture.id}`,
        ).toBe(matchesItemOfferFilter(filter, candidate))
      }
    }
  })

  it("excludes a definition for each filter field (the traps that must fail if SQL forgets a field)", () => {
    const env = createEnv()
    envs.push(env)

    // itemTypes field: the consumable usage never offers the asset.
    const consumable = collectOfferedIds(env.repository, invoiceLineUsage("CONSUMABLE"))
    expect(consumable).toEqual(new Set(["c-active", "p-active"]))

    // activeOnly field: neither usage offers the archived consumable.
    expect(consumable.has("c-archived")).toBe(false)
    expect(collectOfferedIds(env.repository, invoiceLineUsage("ASSET"))).toEqual(new Set(["a-active"]))

    // A usage that allows both types still excludes both archived ones.
    expect(collectOfferedIds(env.repository, { surface: "STOCK_REFERENCE" })).toEqual(
      new Set(["c-active", "a-active", "p-active"]),
    )
  })

  it("offers only what is in stock and active at the chosen source", () => {
    const env = createEnv()
    envs.push(env)

    // Only c-active and a-active hold stock at wh-1; c-archived also sits there
    // but is archived; p-active is stocked at the project, not here.
    expect(
      collectOfferedIds(env.repository, outboundPickUsage({ locationType: "WAREHOUSE", warehouseId: "wh-1" })),
    ).toEqual(new Set(["c-active", "a-active"]))

    // The other half of the rule: only p-active holds stock at prj-1.
    expect(
      collectOfferedIds(env.repository, outboundPickUsage({ locationType: "PROJECT", projectId: "prj-1" })),
    ).toEqual(new Set(["p-active"]))

    // A source with nothing returns nothing, not the whole catalog.
    expect(
      collectOfferedIds(env.repository, outboundPickUsage({ locationType: "WAREHOUSE", warehouseId: "wh-2" })),
    ).toEqual(new Set())
  })

  it("counts every match in total, not just the page", () => {
    const env = createEnv()
    envs.push(env)

    const page = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      limit: 1,
    })

    expect(page.items).toHaveLength(1)
    expect(page.total).toBe(3)
    expect(page.nextCursor).not.toBeNull()
  })

  it("keeps a total order across pages when names collide", () => {
    const env = createEnv()
    envs.push(env)
    const insert = env.db.prepare(
      `INSERT INTO "inventory_item_definition" ("id", "name", "item_type", "unit", "is_active", "created_at", "updated_at") VALUES (?, ?, 'CONSUMABLE', 'قطعة', 1, ?, ?)`,
    )
    // Two identical names: only the id tiebreak gives a stable order.
    insert.run("dup-a", "طلاء", NOW, NOW)
    insert.run("dup-b", "طلاء", NOW, NOW)

    const seen: string[] = []
    let cursor: string | undefined
    let guard = 0
    do {
      const page = env.repository.listItemDefinitionsPaged({
        filter: resolveItemOffer(invoiceLineUsage("CONSUMABLE")),
        search: "طلاء",
        cursor,
        limit: 1,
      })
      seen.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor ?? undefined
      if (++guard > 50) throw new Error("paging did not terminate")
    } while (cursor)

    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toEqual(["dup-a", "dup-b"])
  })

  it("refuses to flip a definition's type while entries reference it", () => {
    const env = createEnv()
    envs.push(env)

    // An entry references the active consumable, so its type is now a fact the
    // offer rule has already read for a stored row.
    env.db
      .prepare(
        `INSERT INTO "inventory_invoice_group" ("id", "supplier_name", "created_at", "updated_at") VALUES ('g1', 'مورد', ?, ?)`,
      )
      .run(NOW, NOW)
    env.db
      .prepare(
        `INSERT INTO "inventory_entry" ("id", "invoice_group_id", "item_definition_id", "item_type", "item_name", "unit", "quantity", "total_price_dzd", "created_at", "updated_at") VALUES ('e1', 'g1', 'c-active', 'CONSUMABLE', 'إسمنت', 'قطعة', 1, 100, ?, ?)`,
      )
      .run(NOW, NOW)

    const service = new InventoryService(env.repository, {} as unknown as InventoryAttachmentStorage)
    const audit = { actorUserId: "u1", actorLabel: "T", transactionId: crypto.randomUUID() }

    expect(() =>
      service.updateItemDefinition({ id: "c-active", itemType: "ASSET" }, audit),
    ).toThrowError(InventoryError)

    try {
      service.updateItemDefinition({ id: "c-active", itemType: "ASSET" }, audit)
    } catch (error) {
      expect((error as InventoryError).appError.code).toBe("CONFLICT")
    }

    // A definition no entry references may still change type (a-archived has
    // never been stocked, so no inventory_entry points at it).
    expect(
      service.updateItemDefinition({ id: "a-archived", itemType: "CONSUMABLE", unit: "قطعة" }, audit).success,
    ).toBe(true)
  })

  it("matches a non-prefix substring, proving the pattern is %term%", () => {
    const env = createEnv()
    envs.push(env)

    // "منت" is inside "إسمنت" (إس + منت) but is not a prefix: a `term%`
    // regression would return nothing here.
    expect(
      env.repository
        .listItemDefinitionsPaged({
          filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
          search: "منت",
          limit: 10,
        })
        .items.map((item) => item.id),
    ).toEqual(["c-active"])
  })

  it("trims the search term before matching", () => {
    const env = createEnv()
    envs.push(env)

    const page = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      search: "  إسمنت  ",
      limit: 10,
    })
    expect(page.items.map((item) => item.id)).toEqual(["c-active"])
  })

  it("scopes the page, total and next cursor to the search term", () => {
    const env = createEnv()
    envs.push(env)

    const page = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      search: "إسمنت",
      limit: 10,
    })

    expect(page.items.map((item) => item.id)).toEqual(["c-active"])
    expect(page.total).toBe(1)
    expect(page.nextCursor).toBeNull()
  })

  it("matches LIKE wildcards in the search literally, not as patterns", () => {
    const env = createEnv()
    envs.push(env)

    for (const wildcard of ["%", "_"]) {
      const page = env.repository.listItemDefinitionsPaged({
        filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
        search: wildcard,
        limit: 10,
      })
      // No fixture name contains a literal % or _; an unescaped wildcard would
      // match every definition (and inflate the total).
      expect(page.items, `search "${wildcard}"`).toEqual([])
      expect(page.total, `search "${wildcard}"`).toBe(0)
    }
  })

  it("pages every search match across the cursor chain", () => {
    const env = createEnv()
    envs.push(env)
    const insert = env.db.prepare(
      `INSERT INTO "inventory_item_definition" ("id", "name", "item_type", "unit", "is_active", "created_at", "updated_at") VALUES (?, ?, 'CONSUMABLE', 'قطعة', 1, ?, ?)`,
    )
    insert.run("cement-white", "إسمنت أبيض", NOW, NOW)
    insert.run("cement-black", "إسمنت أسود", NOW, NOW)

    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = env.repository.listItemDefinitionsPaged({
        filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
        search: "إسمنت",
        cursor,
        limit: 1,
      })
      seen.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)

    // Fixture c-active is also "إسمنت", so the search spans three rows.
    expect(seen).toEqual(["c-active", "cement-white", "cement-black"])
  })

  it("resets a cursor produced for a different usage instead of skipping options", () => {
    const env = createEnv()
    envs.push(env)

    // Page 1 of the two-type stock reference holds a cursor for that filter.
    const first = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      limit: 1,
    })
    expect(first.nextCursor).not.toBeNull()

    // Reusing it for the asset-only usage must restart, not resume a position
    // that has no meaning for the new filter.
    const second = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer(invoiceLineUsage("ASSET")),
      cursor: first.nextCursor ?? undefined,
      limit: 1,
    })
    expect(second.cursorReset).toBe(true)
    expect(second.items.map((item) => item.id)).toEqual(["a-active"])
  })

  it("resets an undecodable cursor instead of throwing", () => {
    const env = createEnv()
    envs.push(env)

    const page = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      cursor: "!!!not-a-valid-cursor",
      limit: 1,
    })
    expect(page.cursorReset).toBe(true)
    expect(page.items.map((item) => item.id)).toEqual(["c-active"])
  })

  it("resets a scope-less cursor from another source instead of trusting its position", () => {
    const env = createEnv()
    envs.push(env)

    // A cursor from an endpoint that does not fingerprint its query carries no
    // scope. Trusting its (sortKey, id) here would silently skip options for a
    // query the cursor was never produced for.
    const foreignCursor = encodeCursor({ sortKey: "إسمنت", id: "c-active" })

    const page = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      cursor: foreignCursor,
      limit: 1,
    })

    expect(page.cursorReset).toBe(true)
    expect(page.items.map((item) => item.id)).toEqual(["c-active"])
  })

  it("resets a cursor produced for a different source instead of returning a wrong page", () => {
    const env = createEnv()
    envs.push(env)

    const first = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer(outboundPickUsage({ locationType: "WAREHOUSE", warehouseId: "wh-1" })),
      limit: 1,
    })
    expect(first.nextCursor).not.toBeNull()

    // Reusing the warehouse cursor for the project source has no meaning.
    const second = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer(outboundPickUsage({ locationType: "PROJECT", projectId: "prj-1" })),
      cursor: first.nextCursor ?? undefined,
      limit: 1,
    })

    expect(second.cursorReset).toBe(true)
    expect(second.items.map((item) => item.id)).toEqual(["p-active"])
  })

  it("resets a cursor produced for a different search instead of returning a wrong page", () => {
    const env = createEnv()
    envs.push(env)

    const first = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      limit: 1,
    })
    expect(first.items.map((item) => item.id)).toEqual(["c-active"])
    expect(first.nextCursor).not.toBeNull()

    // Reuse the (unsearched) cursor with a different search.
    const second = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      search: "مثقاب",
      cursor: first.nextCursor ?? undefined,
      limit: 1,
    })

    expect(second.cursorReset).toBe(true)
    expect(second.items.map((item) => item.id)).toEqual(["a-active"])
  })
})
