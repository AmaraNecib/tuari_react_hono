import { describe, expect, it, vi } from "vitest"

import type { InventoryRepository } from "./inventory.repository"
import type { InventoryAttachmentStorage } from "./inventory.storage"
import { InventoryService } from "./inventory.service"
import { AssetChargeService } from "./asset-charge.service"
import { createInMemoryAssetChargeRepository } from "./adapters/in-memory-asset-charge.repository"

/**
 * Transfer ↔ charge integration (#413): the transfer path is the only place a
 * placement charge is born. These tests drive the real InventoryService over a
 * minimal in-memory inventory double + the in-memory charge adapter, so the
 * "warehouse writes none" and "same placement reference" rules are pinned
 * end-to-end without a database.
 */
function createHarness() {
  const chargeRepository = createInMemoryAssetChargeRepository()
  const movements: Array<Record<string, unknown>> = []

  const asset = {
    id: "asset-1",
    inventoryEntryId: "entry-1",
    assetName: "مثقاب",
    assetTag: null,
    serialNumber: null,
    condition: null,
    purchaseDate: null,
    purchasePriceDzd: 100_000,
    currentWarehouseId: "wh-1" as string | null,
    currentProjectId: null as string | null,
    currentLocationLabel: "المستودع: رئيسي",
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }

  const repository = {
    warehouseExists: (id: string) => id === "wh-1" || id === "wh-2",
    projectExists: (id: string) => id.startsWith("project-"),
    getAssetUnitById: () => ({ ...asset }),
    updateAssetUnitLocation: (_id: string, location: { currentWarehouseId?: string | null; currentProjectId?: string | null }) => {
      asset.currentWarehouseId = location.currentWarehouseId ?? null
      asset.currentProjectId = location.currentProjectId ?? null
      return { ...asset }
    },
    createMovement: vi.fn((data: Record<string, unknown>) => {
      const movement = { id: `movement-${movements.length + 1}`, ...data, createdAt: "2026-01-01T00:00:00.000Z" }
      movements.push(movement)
      return movement
    }),
    listMovementsByAssetUnitId: () => movements,
    getEntryById: () => ({ id: "entry-1", invoiceGroupId: "group-1" }),
    getInvoiceGroupById: () => ({ id: "group-1" }),
    withTransaction: <T,>(callback: () => T) => callback(),
  } as unknown as InventoryRepository

  const chargeService = new AssetChargeService(chargeRepository, repository)
  const service = new InventoryService(
    repository,
    {} as InventoryAttachmentStorage,
    undefined,
    undefined,
    chargeService,
  )

  return { service, chargeRepository, movements }
}

const AUDIT = { actorUserId: "user-1", actorLabel: "مدير", transactionId: "tx-1" }

describe("InventoryService.transferAsset — placement charges (#413)", () => {
  it("writes no charge when the destination is a warehouse", () => {
    const { service, chargeRepository } = createHarness()

    service.transferAsset({ assetUnitId: "asset-1", toWarehouseId: "wh-2" }, AUDIT)

    expect(chargeRepository._charges.size).toBe(0)
  })

  it("charges the purchase price on the first project placement", () => {
    const { service, chargeRepository, movements } = createHarness()

    service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a" }, AUDIT)

    const charges = [...chargeRepository._charges.values()]
    expect(charges).toHaveLength(1)
    expect(charges[0]).toMatchObject({
      assetUnitId: "asset-1",
      projectId: "project-a",
      amountDzd: 100_000,
      status: "LIVE",
      // The charge belongs to the placement: it points at the transfer movement.
      movementId: (movements[0] as { id: string }).id,
    })
  })

  it("defaults the second project placement to the previous amount", () => {
    const { service, chargeRepository } = createHarness()

    service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: 80_000 }, AUDIT)
    service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-b" }, AUDIT)

    const amounts = [...chargeRepository._charges.values()].map((charge) => charge.amountDzd).sort()
    expect(amounts).toEqual([80_000, 80_000])
  })

  it("honours an explicit zero (free placement)", () => {
    const { service, chargeRepository } = createHarness()

    service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: 0 }, AUDIT)

    expect([...chargeRepository._charges.values()][0]?.amountDzd).toBe(0)
  })

  it("keeps each project's own charge when the unit moves on", () => {
    const { service, chargeRepository } = createHarness()

    service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: 100_000 }, AUDIT)
    service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-b", chargeAmountDzd: 60_000 }, AUDIT)
    service.transferAsset({ assetUnitId: "asset-1", toWarehouseId: "wh-1" }, AUDIT)

    const byProject = new Map([...chargeRepository._charges.values()].map((charge) => [charge.projectId, charge.amountDzd]))
    expect(byProject.get("project-a")).toBe(100_000)
    expect(byProject.get("project-b")).toBe(60_000)
    expect(chargeRepository._charges.size).toBe(2)
  })

  it("rolls the charge back with the transfer when the charge is rejected", () => {
    const { service, chargeRepository } = createHarness()

    // A non-finite amount passes the wire gate only in a mis-wired caller; the
    // service must reject it and the transfer transaction must leave no charge.
    expect(() =>
      service.transferAsset(
        { assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: Number.NaN },
        AUDIT,
      ),
    ).toThrowError(/مبلغ صالح/)
    expect(chargeRepository._charges.size).toBe(0)
  })
})
