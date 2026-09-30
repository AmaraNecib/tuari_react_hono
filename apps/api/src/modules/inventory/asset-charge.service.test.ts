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

  it("attaches each charge's revisions to the unit chain (batched, oldest first)", () => {
    const { service } = createHarness()
    const first = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 100_000 }, AUDIT)
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-b", amountDzd: 80_000 }, AUDIT)
    service.updateCharge({ chargeId: first.id, amountDzd: 75_000, reason: "خصم" }, AUDIT)
    service.updateCharge({ chargeId: first.id, amountDzd: 60_000 }, AUDIT)

    const items = service.listByUnit({ assetUnitId: "asset-1" }).items

    // Newest first, and each charge carries its own revision chain in order.
    expect(items.map((charge) => charge.amountDzd)).toEqual([80_000, 60_000])
    expect(items[1]!.revisions.map((revision) => revision.newAmountDzd)).toEqual([75_000, 60_000])
    expect(items[0]!.revisions).toEqual([])
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

  it("refuses a placement that would push the live project total above the bound", () => {
    // Each charge is legal at the bound, but their sum is not representable by
    // the `totalDzd` output contract. The write is refused up front so the
    // project can never be left in a state whose total cannot be read (#422
    // round 4).
    const { service, repository } = createHarness()
    service.createPlacementCharge(
      { assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER },
      AUDIT,
    )

    let thrown: unknown
    try {
      service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 1 }, AUDIT)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(InventoryError)
    expect((thrown as InventoryError).appError.code).toBe("BUSINESS_RULE")
    // The typed error names the limit and the current total.
    expect((thrown as InventoryError).appError.message).toContain(String(Number.MAX_SAFE_INTEGER))
    // Nothing was written, so the total stays readable.
    expect(repository._charges.size).toBe(1)
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("refuses a correction that would push the live project total above the bound", () => {
    const { service, repository } = createHarness()
    // Seed two charges that together sit exactly on the bound, then try to
    // raise one of them past it.
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER - 1 })
    const second = repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 1 })

    expect(() => service.updateCharge({ chargeId: second.id, amountDzd: 2 }, AUDIT)).toThrowError(/الحد الأقصى/)
    // The rejected correction left the charge and the total unchanged.
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("refuses to emit a legacy project total above the shared money bound instead of returning it", () => {
    // A state written before the write-time gate existed (or by a foreign
    // writer): the read path still refuses to emit an out-of-contract number.
    const { service, repository } = createHarness()
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER })
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 1 })

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

  it("keeps the write gate and the read on ONE summation (MAX, 0.01, 0.49)", () => {
    // The write gate used to sum through SQLite while the read added in JS
    // newest-first. Each of these three passed the SQL write check, but the
    // JS read of the resulting project threw — an unreadable project total.
    // The invariant this pins: after ANY accepted write, reading the project
    // total must succeed (#422 round 5).
    const { service } = createHarness()
    const accepted: number[] = []

    for (const amountDzd of [Number.MAX_SAFE_INTEGER, 0.01, 0.49]) {
      try {
        service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd }, AUDIT)
        accepted.push(amountDzd)
      } catch (error) {
        expect(error).toBeInstanceOf(InventoryError)
        expect((error as InventoryError).appError.code).toBe("BUSINESS_RULE")
      }

      // Whatever was accepted, the total must still be readable.
      expect(() => service.listByProject({ projectId: "project-a" })).not.toThrow()
    }

    // The third charge is the one the divergent sums disagreed about: the read
    // would have thrown, so the write gate must refuse it up front.
    expect(accepted).toEqual([Number.MAX_SAFE_INTEGER, 0.01])
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

  it("treats a write that matched no live row as refused instead of resurrecting the charge", () => {
    // `updateCharge` on the repository carries `AND status='LIVE'`; when it
    // changes nothing the service must throw rather than report success.
    const { repository, service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 1_000 }, AUDIT)
    const staleRepository = { ...repository, updateCharge: () => null }
    const staleService = new AssetChargeService(staleRepository, createLookup())

    expect(() => staleService.updateCharge({ chargeId: charge.id, amountDzd: 5 }, AUDIT)).toThrowError(/ملغى/)
    expect(() => staleService.voidCharge({ chargeId: charge.id }, AUDIT)).toThrowError(/ملغى/)
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

describe("AssetChargeService — money boundary and bulk placements (#422 round 6)", () => {
  it("rounds a sub-cent placement at the write boundary so the stored amount equals the total", () => {
    // 0.005 is a legal non-negative amount at the wire gate, but storing it
    // as-is made the charge row disagree with the rounded project total.
    const { service } = createHarness()
    const charge = service.createPlacementCharge(
      { assetUnitId: "asset-1", projectId: "project-a", amountDzd: 0.005 },
      AUDIT,
    )

    expect(charge.amountDzd).toBe(0.01)
    const project = service.listByProject({ projectId: "project-a" })
    expect(project.charges[0]?.amountDzd).toBe(0.01)
    expect(project.totalDzd).toBe(0.01)
  })

  it("rounds a sub-cent correction at the write boundary (revision mirrors the stored amount)", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge(
      { assetUnitId: "asset-1", projectId: "project-a", amountDzd: 10 },
      AUDIT,
    )

    const updated = service.updateCharge({ chargeId: charge.id, amountDzd: 0.005 }, AUDIT)

    expect(updated.item.amountDzd).toBe(0.01)
    expect(updated.item.revisions[0]?.newAmountDzd).toBe(0.01)
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(0.01)
  })

  it("charges a batch of placements with ONE project read and a running total", () => {
    const { service, repository } = createHarness()
    let reads = 0
    const original = repository.listChargesByProject.bind(repository)
    repository.listChargesByProject = (projectId: string) => {
      reads += 1
      return original(projectId)
    }

    const charges = service.createPlacementCharges(
      {
        projectId: "project-a",
        placements: [
          { assetUnitId: "asset-1", movementId: "m-1" },
          { assetUnitId: "asset-1", movementId: "m-2" },
          { assetUnitId: "asset-1", movementId: "m-3" },
        ],
      },
      AUDIT,
    )

    expect(reads).toBe(1)
    expect(charges.map((charge) => charge.movementId)).toEqual(["m-1", "m-2", "m-3"])
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(300_000)
  })

  it("sums explicit batch amounts through the same money boundary", () => {
    const { service } = createHarness()
    service.createPlacementCharges(
      {
        projectId: "project-a",
        placements: [
          { assetUnitId: "asset-1", amountDzd: 0.005 },
          { assetUnitId: "asset-1", amountDzd: 0.2 },
        ],
      },
      AUDIT,
    )

    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(0.21)
  })

  it("refuses a batch whose running total would exceed the bound before writing it", () => {
    const { service, repository } = createHarness()
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER })

    expect(() =>
      service.createPlacementCharges(
        { projectId: "project-a", placements: [{ assetUnitId: "asset-1", movementId: "m-1" }] },
        AUDIT,
      ),
    ).toThrowError(/الحد الأقصى/)

    expect(repository._charges.size).toBe(1)
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("rejects a batch for an unknown project before reading or writing anything", () => {
    const { service } = createHarness()
    expect(() =>
      service.createPlacementCharges({ projectId: "nope", placements: [{ assetUnitId: "asset-1" }] }, AUDIT),
    ).toThrowError(/المشروع/)
  })
})

describe("AssetChargeService — batch gate equals the read, void and correction edges (#422 round 7)", () => {
  it("refuses a batch whose individually legal amounts would make the total unreadable", () => {
    // Pre-fix the batch accumulated existing-first with a per-step round, so
    // MAX + 0.01 + 0.49 stayed at MAX and both charges were written; the
    // newest-first READ then summed 0.49 + 0.01 + MAX to 2^53 and threw
    // forever. The gate must build the exact list the read sums (#422 round 7).
    const { service, repository } = createHarness()
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER })

    expect(() =>
      service.createPlacementCharges(
        {
          projectId: "project-a",
          placements: [
            { assetUnitId: "asset-1", amountDzd: 0.01 },
            { assetUnitId: "asset-1", amountDzd: 0.49 },
          ],
        },
        AUDIT,
      ),
    ).toThrowError(/الحد الأقصى/)

    // The refused batch wrote nothing and the total is still readable.
    expect(repository._charges.size).toBe(1)
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("rolls the whole batch back when a later placement overflows", () => {
    const { service, repository } = createHarness()
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER - 1 })

    expect(() =>
      service.createPlacementCharges(
        {
          projectId: "project-a",
          placements: [
            { assetUnitId: "asset-1", amountDzd: 1 },
            { assetUnitId: "asset-1", amountDzd: 1 },
          ],
        },
        AUDIT,
      ),
    ).toThrowError(/الحد الأقصى/)

    // The batch is refused before any write, so the seeded row is untouched.
    expect(repository._charges.size).toBe(1)
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER - 1)
  })

  it("defaults a repeated unit in one batch to the amount just charged to it", () => {
    const { service } = createHarness()
    const charges = service.createPlacementCharges(
      {
        projectId: "project-a",
        placements: [{ assetUnitId: "asset-1", amountDzd: 70_000 }, { assetUnitId: "asset-1" }],
      },
      AUDIT,
    )

    expect(charges.map((charge) => charge.amountDzd)).toEqual([70_000, 70_000])
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(140_000)
  })

  it("resolves the default for an explicit null batch amount and returns [] for an empty batch", () => {
    const { service } = createHarness()
    service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 80_000 }, AUDIT)

    const resolved = service.createPlacementCharges(
      { projectId: "project-b", placements: [{ assetUnitId: "asset-1", amountDzd: null }] },
      AUDIT,
    )
    expect(resolved[0]?.amountDzd).toBe(80_000)
    expect(service.createPlacementCharges({ projectId: "project-b", placements: [] }, AUDIT)).toEqual([])
  })

  it("falls back to the purchase price when the only prior charge was voided", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 80_000 }, AUDIT)
    service.voidCharge({ chargeId: charge.id }, AUDIT)

    expect(service.resolveDefault({ assetUnitId: "asset-1" })).toMatchObject({
      amountDzd: 100_000,
      source: "PURCHASE_PRICE",
    })
  })

  it("records the void reason and actor on the void revision", () => {
    const { service } = createHarness()
    const charge = service.createPlacementCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 500 }, AUDIT)

    const voided = service.voidCharge({ chargeId: charge.id, reason: "خطأ إدخال" }, AUDIT)

    expect(voided.item.revisions[0]).toMatchObject({
      previousAmountDzd: 500,
      newAmountDzd: null,
      reason: "خطأ إدخال",
      actorUserId: "user-1",
      actorLabel: "مدير",
    })
  })

  it("accepts a correction that lands the live total exactly on the bound", () => {
    const { service, repository } = createHarness()
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER - 2 })
    const second = repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 1 })

    const updated = service.updateCharge({ chargeId: second.id, amountDzd: 2 }, AUDIT)

    expect(updated.item.amountDzd).toBe(2)
    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("lets a void bring an already over-bound legacy project back into range", () => {
    // Voiding deliberately skips the aggregate gate, so the over-bound state a
    // pre-gate write could leave is recoverable (#422 round 4).
    const { service, repository } = createHarness()
    repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: Number.MAX_SAFE_INTEGER })
    const extra = repository.createCharge({ assetUnitId: "asset-1", projectId: "project-a", amountDzd: 1 })
    expect(() => service.listByProject({ projectId: "project-a" })).toThrowError(InventoryError)

    service.voidCharge({ chargeId: extra.id }, AUDIT)

    expect(service.listByProject({ projectId: "project-a" }).totalDzd).toBe(Number.MAX_SAFE_INTEGER)
  })
})
