import { describe, expect, it } from "vitest"

import { MAX_MONEY_DZD } from "@tuari/contracts"

import { InventoryError } from "./inventory.errors"
import type { InventoryRepository } from "./inventory.repository"
import { InventoryService } from "./inventory.service"
import type { InventoryAttachmentStorage } from "./inventory.storage"
import type { InventoryMovementValuationRow, InventoryValuationRow } from "./inventory.types"

/**
 * Report money bounds (#475).
 *
 * The generators sum money across stored rows; each row is a permissive read
 * (the DB CHECK only enforces `>= 0`), but the aggregate is COMPUTED at read
 * time and must refuse a total the safe-integer range cannot represent. The
 * fake repository feeds the rows directly, so the test pins the guard without a
 * real DB.
 */
function createService(input: {
  inventory?: InventoryValuationRow[]
  movements?: InventoryMovementValuationRow[]
}) {
  const repository = {
    listInventoryValuations: () => input.inventory ?? [],
    listMovementValuations: () => input.movements ?? [],
    resolveLocationLabel: () => "المستودع: رئيسي",
  } as unknown as InventoryRepository

  return new InventoryService(repository, {} as unknown as InventoryAttachmentStorage)
}

function valuation(overrides: Partial<InventoryValuationRow>): InventoryValuationRow {
  return {
    id: "entry-1",
    itemType: "ASSET",
    itemName: "أصل",
    quantity: 1,
    unitPriceDzd: 100,
    totalPriceDzd: 100,
    lastUpdated: "2026-06-01T00:00:00.000Z",
    documentDate: "2026-06-01T00:00:00.000Z",
    locationId: "loc-1",
    locationType: "WAREHOUSE",
    locationLabel: "المستودع: رئيسي",
    ...overrides,
  }
}

function movement(
  overrides: Partial<InventoryMovementValuationRow["movement"]>,
  unitPriceDzd: number | null,
): InventoryMovementValuationRow {
  return {
    movement: {
      id: "movement-1",
      movementType: "PURCHASE",
      itemType: "CONSUMABLE",
      inventoryEntryId: "entry-1",
      assetUnitId: null,
      quantity: 1,
      fromWarehouseId: null,
      fromProjectId: null,
      toWarehouseId: "loc-1",
      toProjectId: null,
      note: null,
      occurredAt: "2026-06-01T00:00:00.000Z",
      createdAt: "2026-06-01T00:00:00.000Z",
      ...overrides,
    },
    unitPriceDzd,
  }
}

function captureError(run: () => unknown): unknown {
  try {
    run()
    return null
  } catch (error) {
    return error
  }
}

function expectBusinessRule(error: unknown) {
  expect(error).toBeInstanceOf(InventoryError)
  expect((error as InventoryError).appError.code).toBe("BUSINESS_RULE")
}

describe("inventory report money bound (#475)", () => {
  it("refuses an inventory summary that sums past MAX_MONEY_DZD", () => {
    const service = createService({
      inventory: [
        valuation({ totalPriceDzd: MAX_MONEY_DZD }),
        valuation({ id: "entry-2", totalPriceDzd: 1 }),
      ],
    })

    expectBusinessRule(captureError(() => service.generateInventoryReport({})))
  })

  it("refuses the asset+consumable cross-sum even when each side is inside the bound", () => {
    // Each side lands exactly on the bound, so only the cross-sum can leave it.
    const service = createService({
      inventory: [
        valuation({ totalPriceDzd: MAX_MONEY_DZD }),
        valuation({
          id: "entry-2",
          itemType: "CONSUMABLE",
          itemName: "مادة",
          totalPriceDzd: MAX_MONEY_DZD,
        }),
      ],
    })

    expectBusinessRule(captureError(() => service.generateInventoryReport({})))
  })

  it("refuses a movement value whose quantity × unit price leaves the bound", () => {
    const service = createService({
      movements: [movement({ quantity: 2 }, MAX_MONEY_DZD)],
    })

    expectBusinessRule(captureError(() => service.generateMovementReport({})))
  })

  it("refuses a month total that leaves the bound across movement types", () => {
    // Each type is inside the bound; the month fold mixes them, so a movement
    // batch can overflow a month even when every per-type total is legal.
    const service = createService({
      movements: [
        movement({ id: "m-1", movementType: "PURCHASE" }, MAX_MONEY_DZD),
        movement(
          { id: "m-2", movementType: "TRANSFER", occurredAt: "2026-06-15T00:00:00.000Z" },
          MAX_MONEY_DZD,
        ),
      ],
    })

    expectBusinessRule(captureError(() => service.generateMovementReport({})))
  })

  it("refuses a destination total that leaves the bound across types and periods", () => {
    // byType and byPeriod both stay inside the bound; only the destination fold
    // (one destination, two types, two months) leaves it.
    const service = createService({
      movements: [
        movement({ id: "m-1", movementType: "PURCHASE" }, MAX_MONEY_DZD),
        movement(
          { id: "m-2", movementType: "TRANSFER", occurredAt: "2026-07-01T00:00:00.000Z" },
          MAX_MONEY_DZD,
        ),
      ],
    })

    expectBusinessRule(captureError(() => service.generateMovementReport({})))
  })

  it("refuses a consumable total that sums past the bound", () => {
    // The consumable accumulator sees these rows before the asset fold or the
    // cross-sum, so this exercises that guard rather than a later one.
    const service = createService({
      inventory: [
        valuation({ itemType: "CONSUMABLE", itemName: "مادة", totalPriceDzd: MAX_MONEY_DZD }),
        valuation({ id: "entry-2", itemType: "CONSUMABLE", itemName: "مادة", totalPriceDzd: 1 }),
      ],
    })

    expectBusinessRule(captureError(() => service.generateInventoryReport({})))
  })

  it("still aggregates a normal batch", () => {
    const service = createService({
      inventory: [
        valuation({ totalPriceDzd: 100 }),
        valuation({
          id: "entry-2",
          itemType: "CONSUMABLE",
          itemName: "مادة",
          totalPriceDzd: 20,
        }),
      ],
    })

    const report = service.generateInventoryReport({})
    expect(report.summary).toEqual({
      totalAssetsDzd: 100,
      totalConsumablesDzd: 20,
      totalValueDzd: 120,
    })
  })
})
