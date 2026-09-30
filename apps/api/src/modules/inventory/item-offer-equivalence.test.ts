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
  resolveItemOffer,
  type InventoryItemUsage,
} from "@tuari/contracts"

import { schemaStatements } from "../../infrastructure/database/schema-definitions"
import { createInventoryRepository } from "./adapters/sqlite-inventory.repository"
import type { InventoryRepository } from "./inventory.repository"
import { InventoryService } from "./inventory.service"
import type { InventoryAttachmentStorage } from "./inventory.storage"
import { InventoryError } from "./inventory.errors"

const NOW = "2026-06-01T00:00:00.000Z"

type Fixture = { id: string; name: string; itemType: "CONSUMABLE" | "ASSET"; isActive: boolean }

const FIXTURES: Fixture[] = [
  { id: "c-active", name: "إسمنت", itemType: "CONSUMABLE", isActive: true },
  { id: "a-active", name: "مثقاب", itemType: "ASSET", isActive: true },
  { id: "c-archived", name: "جير", itemType: "CONSUMABLE", isActive: false },
  { id: "a-archived", name: "خلاطة", itemType: "ASSET", isActive: false },
]

const USAGES: InventoryItemUsage[] = [
  invoiceLineUsage("CONSUMABLE"),
  invoiceLineUsage("ASSET"),
  { surface: "STOCK_REFERENCE" },
]

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
        expect(
          offered.has(fixture.id),
          `${JSON.stringify(usage)} should ${matchesItemOfferFilter(filter, fixture) ? "" : "NOT "}offer ${fixture.id}`,
        ).toBe(matchesItemOfferFilter(filter, fixture))
      }
    }
  })

  it("excludes a definition for each filter field (the traps that must fail if SQL forgets a field)", () => {
    const env = createEnv()
    envs.push(env)

    // itemTypes field: the consumable usage never offers the asset.
    const consumable = collectOfferedIds(env.repository, invoiceLineUsage("CONSUMABLE"))
    expect(consumable).toEqual(new Set(["c-active"]))

    // activeOnly field: neither usage offers the archived consumable.
    expect(consumable.has("c-archived")).toBe(false)
    expect(collectOfferedIds(env.repository, invoiceLineUsage("ASSET"))).toEqual(new Set(["a-active"]))

    // A usage that allows both types still excludes both archived ones.
    expect(collectOfferedIds(env.repository, { surface: "STOCK_REFERENCE" })).toEqual(
      new Set(["c-active", "a-active"]),
    )
  })

  it("counts every match in total, not just the page", () => {
    const env = createEnv()
    envs.push(env)

    const page = env.repository.listItemDefinitionsPaged({
      filter: resolveItemOffer({ surface: "STOCK_REFERENCE" }),
      limit: 1,
    })

    expect(page.items).toHaveLength(1)
    expect(page.total).toBe(2)
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
        cursor,
        limit: 1,
      })
      seen.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor ?? undefined
      if (++guard > 50) throw new Error("paging did not terminate")
    } while (cursor)

    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toEqual(["c-active", "dup-a", "dup-b"])
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

    // A definition no entry references may still change type.
    expect(
      service.updateItemDefinition({ id: "a-active", itemType: "CONSUMABLE", unit: "قطعة" }, audit).success,
    ).toBe(true)
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
