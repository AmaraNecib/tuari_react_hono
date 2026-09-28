import { describe, expect, it } from "vitest"

import { AssetChargeService } from "./asset-charge.service"
import { createInMemoryAssetChargeRepository } from "./adapters/in-memory-asset-charge.repository"
import { InventoryError } from "./inventory.errors"
import type { InventoryAssetChargeAssetLookup } from "./asset-charge.types"

function createLookup(overrides?: Partial<InventoryAssetChargeAssetLookup>): InventoryAssetChargeAssetLookup {
  return {
    getAssetUnitById: (id) => (id === "asset-1" ? { id: "asset-1", purchasePriceDzd: 100_000 } : null),
    projectExists: (id) => id.startsWith("project-"),
    ...overrides,
  }
}

function createHarness(lookup: InventoryAssetChargeAssetLookup = createLookup()) {
  const repository = createInMemoryAssetChargeRepository()
  return { repository, service: new AssetChargeService(repository, lookup) }
}

const AUDIT = { actorUserId: "user-1", actorLabel: "مدير", transactionId: "tx-1" }

describe("AssetChargeService — placement defaults (#413)", () => {
  it("first placement defaults to the unit's purchase price", () => {
    const { service } = createHarness()

    expect(service.resolveDefault({ assetUnitId: "asset-1" })).toEqual({
      assetUnitId: "asset-1",
      amountDzd: 100_000,
      purchasePriceDzd: 100_000,
      source: "PURCHASE_PRICE",
    })

    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a" }, AUDIT)
    expect(charge.amountDzd).toBe(100_000)
  })

  it("second placement defaults to the previous amount, not the purchase price", () => {
    const { service } = createHarness()
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 80_000 }, AUDIT)

    expect(service.resolveDefault({ assetUnitId: "asset-1" })).toEqual({
      assetUnitId: "asset-1",
      amountDzd: 80_000,
      purchasePriceDzd: 100_000,
      source: "LAST_CHARGE",
    })

    const second = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-b" }, AUDIT)
    expect(second.amountDzd).toBe(80_000)
  })

  it("an explicit zero is a free placement, not a request for the default", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 0 }, AUDIT)
    expect(charge.amountDzd).toBe(0)
    expect(service.resolveDefault({ assetUnitId: "asset-1" }).source).toBe("LAST_CHARGE")
  })

  it("allows an amount above the purchase price (warned in the UI, never blocked)", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 150_000 }, AUDIT)
    expect(charge.amountDzd).toBe(150_000)
  })

  it("rejects a negative or non-finite amount", () => {
    const { service } = createHarness()
    expect(() => service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: -1 }, AUDIT))
      .toThrowError(/مبلغ صالح/)
    expect(() => service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.POSITIVE_INFINITY }, AUDIT))
      .toThrowError(/مبلغ صالح/)
  })

  it("rejects an unknown asset and an unknown project", () => {
    const { service } = createHarness()
    expect(() => service.resolveDefault({ assetUnitId: "missing" })).toThrowError(/الأصل/)
    expect(() => service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "nope" }, AUDIT)).toThrowError(/المشروع/)
  })

  it("fails clearly when the resolved default is above the shared money bound", () => {
    // A corrupt/oversized purchase price must not reach the wire as an invalid
    // payload: the resolved default is validated against the contract's bound.
    const { service } = createHarness(
      createLookup({
        getAssetUnitById: (id) => ({ id, purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1 }),
      }),
    )

    expect(() => service.resolveDefault({ assetUnitId: "asset-1" })).toThrowError(/خارج النطاق/)
    expect(() =>
      service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a" }, AUDIT),
    ).toThrowError(/خارج النطاق/)
  })

  it("reads back a legacy above-bound purchase price when the amount comes from a last charge", () => {
    // A row stored before the write gate existed. The echoed price must not
    // make the default unreadable; only USING it as the amount is refused.
    const { service } = createHarness(
      createLookup({
        getAssetUnitById: (id) => ({ id, purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1 }),
      }),
    )
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 80_000 }, AUDIT)

    expect(service.resolveDefault({ assetUnitId: "asset-1" })).toEqual({
      assetUnitId: "asset-1",
      amountDzd: 80_000,
      purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1,
      source: "LAST_CHARGE",
    })
  })
})

describe("AssetChargeService — chain, corrections and total (#413)", () => {
  it("keeps a placement chain per unit: A 100k → B 80k → C 60k", () => {
    const { service } = createHarness()
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 }, AUDIT)
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-b", amountDzd: 80_000 }, AUDIT)
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-c", amountDzd: 60_000 }, AUDIT)

    const amounts = service.listByUnit({ assetUnitId: "asset-1" }).items.map((charge) => charge.amountDzd)
    expect(amounts).toEqual([60_000, 80_000, 100_000])
  })

  it("records a correction as from → to with actor and optional reason", () => {
    const { service, repository } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 }, AUDIT)

    const updated = service.updateCharge(
      { chargeId: charge.id, amountDzd: 75_000, reason: "خصم استعمال" },
      AUDIT,
    )

    expect(updated.item.amountDzd).toBe(75_000)
    expect(updated.item.revisions).toHaveLength(1)
    expect(updated.item.revisions[0]).toMatchObject({
      previousAmountDzd: 100_000,
      newAmountDzd: 75_000,
      reason: "خصم استعمال",
      actorUserId: "user-1",
      actorLabel: "مدير",
    })
    expect(repository._revisions.size).toBe(1)
  })

  it("voids a charge (from → null) and excludes it from the project total", () => {
    const { service } = createHarness()
    const live = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 }, AUDIT)
    const other = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 40_000 }, AUDIT)

    const voided = service.voidCharge({ chargeId: live.id, reason: "خطأ إدخال" }, AUDIT)
    expect(voided.item.status).toBe("VOID")
    expect(voided.item.revisions[0]).toMatchObject({ previousAmountDzd: 100_000, newAmountDzd: null })

    const project = service.listByProject({ projectId: "project-a" })
    expect(project.charges.map((charge) => charge.id)).toEqual([other.id])
    expect(project.totalDzd).toBe(40_000)
  })

  it("refuses to edit or void an already voided charge", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a" }, AUDIT)
    service.voidCharge({ chargeId: charge.id }, AUDIT)

    expect(() => service.updateCharge({ chargeId: charge.id, amountDzd: 1 }, AUDIT)).toThrowError(/ملغى/)
    expect(() => service.voidCharge({ chargeId: charge.id }, AUDIT)).toThrowError(/ملغى/)
  })

  it("rejects an invalid correction payload before touching the repository", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a" }, AUDIT)

    expect(() => service.updateCharge({ chargeId: charge.id, amountDzd: -5 }, AUDIT)).toThrowError(/مبلغ صحيح/)
  })

  it("defaults an omitted audit context and normalizes a blank correction reason", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a" }, AUDIT)

    const updated = service.updateCharge({ chargeId: charge.id, amountDzd: 1, reason: "   " })

    expect(updated.item.revisions[0]?.reason).toBeNull()
    expect(updated.item.revisions[0]?.actorUserId).toBeNull()
  })

  it("rejects an invalid void payload and an unknown charge id", () => {
    const { service } = createHarness()

    expect(() => service.voidCharge({ chargeId: "" }, AUDIT)).toThrowError(/غير صالح/)
    expect(() => service.updateCharge({ chargeId: "missing", amountDzd: 1 }, AUDIT)).toThrowError(/الاحتساب/)
    expect(() => service.voidCharge({ chargeId: "missing" }, AUDIT)).toThrowError(/الاحتساب/)
  })

  it("sums only live charges for the project total", () => {
    const { service } = createHarness()
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 30_000 }, AUDIT)
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 12_500 }, AUDIT)
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-b", amountDzd: 999_000 }, AUDIT)

    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(42_500)
    expect(service.listByProject({ projectId: "project-b" }).totalDzd).toBe(999_000)
  })

  it("refuses a project total above the shared money bound instead of emitting it", () => {
    // Each charge is legal at the bound, but their sum is not representable by
    // the `totalDzd` output contract. The cost view must fail with a typed
    // error, never return an out-of-contract number (#422 round 2).
    const { service } = createHarness()
    service.createPlacementCharge(
      { assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER },
      AUDIT,
    )
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 1 }, AUDIT)

    expect(() => service.listByProject({ projectId: "project-a" })).toThrowError(InventoryError)

    let thrown: unknown
    try {
      service.getProjectCharges({ projectId: "project-a" })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(InventoryError)
    expect((thrown as InventoryError).appError.code).toBe("BUSINESS_RULE")
    expect((thrown as InventoryError).appError.fieldErrors[0]?.field).toBe("totalDzd")
  })

  it("returns a project total that lands exactly on the shared money bound", () => {
    const { service } = createHarness()
    service.createPlacementCharge(
      { assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER },
      AUDIT,
    )
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 0 }, AUDIT)

    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("keeps a near-bound project total exact instead of folding it through a lossy multiply", () => {
    // The shared roundMoney must not run `value * 100` at this magnitude (the
    // old helper returned MAX - 2 for an input of MAX - 1).
    const { service } = createHarness()
    service.createPlacementCharge(
      { assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER - 1 },
      AUDIT,
    )

    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER - 1)
  })

  it("rounds the project total at the money boundary (0.1 + 0.2 = 0.3)", () => {
    // Without the roundMoney boundary the raw sum leaks float noise
    // (0.30000000000000004) into the project cost view.
    const { service } = createHarness()
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 0.1 }, AUDIT)
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 0.2 }, AUDIT)

    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(0.3)
  })

  it("returns a 404 for an unknown project in the cost view", () => {
    const { service } = createHarness()
    expect(() => service.listByProject({ projectId: "project-unknown" })).not.toThrow()
    expect(() => service.listByProject({ projectId: "nope" })).toThrowError(/المشروع/)
  })

  it("wraps the default and the project charges in entity results", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 12_000 }, AUDIT)

    const defaultResult = service.getDefault({ assetUnitId: "asset-1" })
    expect(defaultResult.success).toBe(true)
    expect(defaultResult.item.amountDzd).toBe(12_000)

    const projectResult = service.getProjectCharges({ projectId: "project-a" })
    expect(projectResult.success).toBe(true)
    expect(projectResult.item.totalDzd).toBe(12_000)
    expect(projectResult.item.charges[0]?.id).toBe(charge.id)
  })
})
