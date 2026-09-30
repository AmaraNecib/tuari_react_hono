import { afterEach, describe, expect, it, vi } from "vitest"
import Database from "better-sqlite3"

import { inventoryLocationContentsSchema } from "@tuari/contracts"

import { schemaStatements } from "../../infrastructure/database/schema-definitions"
import { createFifoLock } from "../../infrastructure/database/fifo-lock"
import type { InventoryRepository } from "./inventory.repository"
import type { InventoryAttachmentStorage } from "./inventory.storage"
import { InventoryService } from "./inventory.service"
import { AssetChargeService } from "./asset-charge.service"
import { createInMemoryAssetChargeRepository } from "./adapters/in-memory-asset-charge.repository"
import { createAssetChargeRepository } from "./adapters/sqlite-asset-charge.repository"
import { createInventoryRepository } from "./adapters/sqlite-inventory.repository"

/**
 * Transfer ↔ charge integration (#413): the transfer path is the only place a
 * placement charge is born. These tests drive the real InventoryService over a
 * minimal in-memory inventory double + the in-memory charge adapter, so the
 * "warehouse writes none" and "same placement reference" rules are pinned
 * end-to-end without a database.
 */
function createHarness(options?: { failAfterCharge?: boolean; withoutChargeService?: boolean }) {
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
    listAssetUnitsByLocation: () => [{ ...asset }],
    listConsumableBalancesByLocation: () => [],
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
    // A real transaction double: snapshot the mutable stores and restore them
    // when the callback throws, so a failure AFTER the charge insert leaves
    // nothing behind (sqlite's runSyncTransaction does the same).
    withTransaction: <T,>(callback: () => T): T => {
      const chargeSnapshot = new Map(chargeRepository._charges)
      const revisionSnapshot = new Map(chargeRepository._revisions)
      const movementSnapshot = [...movements]
      const location = {
        currentWarehouseId: asset.currentWarehouseId,
        currentProjectId: asset.currentProjectId,
      }

      try {
        return callback()
      } catch (error) {
        chargeRepository._charges.clear()
        for (const [id, charge] of chargeSnapshot) chargeRepository._charges.set(id, charge)
        chargeRepository._revisions.clear()
        for (const [id, revision] of revisionSnapshot) chargeRepository._revisions.set(id, revision)
        movements.splice(0, movements.length, ...movementSnapshot)
        asset.currentWarehouseId = location.currentWarehouseId
        asset.currentProjectId = location.currentProjectId
        throw error
      }
    },
  } as unknown as InventoryRepository

  if (options?.failAfterCharge) {
    // Insert the charge first, then fail — the fee is provably in the store
    // before the transaction rolls it back.
    const insertCharge = chargeRepository.createCharge.bind(chargeRepository)
    chargeRepository.createCharge = (data) => {
      insertCharge(data)
      throw new Error("commit failed after the charge insert")
    }
  }

  const chargeService = new AssetChargeService(chargeRepository, repository)
  const service = new InventoryService(
    repository,
    {} as InventoryAttachmentStorage,
    undefined,
    undefined,
    options?.withoutChargeService ? undefined : chargeService,
  )

  return { service, chargeRepository, movements, asset }
}

const AUDIT = { actorUserId: "user-1", actorLabel: "مدير", transactionId: "tx-1" }

describe("InventoryService.transferAsset — placement charges (#413)", () => {
  it("writes no charge when the destination is a warehouse", () => {
    const { service, chargeRepository } = createHarness()

    service.transferAsset({ assetUnitId: "asset-1", toWarehouseId: "wh-2" }, AUDIT)

    expect(chargeRepository._charges.size).toBe(0)
  })

  it("fails loudly instead of booking an uncharged project placement when the charge service is absent", () => {
    // A silently uncharged placement is the exact failure #413 exists to
    // prevent. A composition that forgets the charge dependency must refuse
    // the transfer, and the transaction must leave no movement behind (#422
    // round 5).
    const { service, chargeRepository, movements } = createHarness({ withoutChargeService: true })

    expect(() => service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a" }, AUDIT))
      .toThrowError(/احتساب/)

    expect(chargeRepository._charges.size).toBe(0)
    expect(movements).toHaveLength(0)
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

  it("resolves the server default for an explicit null amount", () => {
    // The wire contract declares null as "server resolves the default", which
    // the dialog sends while the fresh default is still loading.
    const { service, chargeRepository } = createHarness()

    service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: null }, AUDIT)

    expect([...chargeRepository._charges.values()][0]?.amountDzd).toBe(100_000)
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

  it("rejects an invalid amount before writing any charge", () => {
    const { service, chargeRepository } = createHarness()

    // A non-finite amount passes the wire gate only in a mis-wired caller; the
    // service must reject it and leave no charge behind.
    expect(() =>
      service.transferAsset(
        { assetUnitId: "asset-1", toProjectId: "project-a", chargeAmountDzd: Number.NaN },
        AUDIT,
      ),
    ).toThrowError(/مبلغ صالح/)
    expect(chargeRepository._charges.size).toBe(0)
  })

  it("rolls the charge back with the transfer when a later step fails", () => {
    const { service, chargeRepository, movements, asset } = createHarness({ failAfterCharge: true })

    // The charge is inserted and THEN the transaction fails; the rollback must
    // discard the charge, the movement and the location change together.
    expect(() =>
      service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a" }, AUDIT),
    ).toThrowError(/commit failed after the charge insert/)

    expect(chargeRepository._charges.size).toBe(0)
    expect(chargeRepository._revisions.size).toBe(0)
    expect(movements).toHaveLength(0)
    expect(asset.currentWarehouseId).toBe("wh-1")
    expect(asset.currentProjectId).toBeNull()
  })
})

describe("InventoryService read paths tolerate a legacy above-bound price (#413 round 3)", () => {
  it("reads back a stored asset whose price predates the money bound through the location list", () => {
    const { service, asset } = createHarness()
    asset.purchasePriceDzd = Number.MAX_SAFE_INTEGER + 1

    const contents = service.getLocationContents({ warehouseId: "wh-1" })

    expect(inventoryLocationContentsSchema.safeParse(contents.item).success).toBe(true)
    expect(contents.item.assets[0]?.purchasePriceDzd).toBe(Number.MAX_SAFE_INTEGER + 1)
  })
})

describe("InventoryService.createInvoiceGroup — a unit created on a project is charged (#413)", () => {
  function createInvoiceHarness(options?: { withoutChargeService?: boolean }) {
    const chargeRepository = createInMemoryAssetChargeRepository()
    const createdAssets = new Map<string, { id: string; purchasePriceDzd: number; currentProjectId: string | null }>()
    const movements: Array<Record<string, unknown>> = []

    const repository = {
      warehouseExists: () => true,
      projectExists: (id: string) => id.startsWith("project-"),
      externalCounterpartyExists: () => true,
      getLatestInvoiceNumber: () => null,
      getItemDefinitionById: (id: string) =>
        id === "def-1" ? { id, name: "مثقاب", itemType: "ASSET", unit: null, isActive: true } : null,
      // A real transaction double: snapshot the mutable stores and restore them
      // when the callback throws, so a failure after a movement/charge insert
      // leaves nothing behind (sqlite's runSyncTransaction does the same).
      withTransaction: <T,>(callback: () => T): T => {
        const chargeSnapshot = new Map(chargeRepository._charges)
        const revisionSnapshot = new Map(chargeRepository._revisions)
        const movementSnapshot = [...movements]
        const assetSnapshot = new Map(createdAssets)
        try {
          return callback()
        } catch (error) {
          chargeRepository._charges.clear()
          for (const [id, charge] of chargeSnapshot) chargeRepository._charges.set(id, charge)
          chargeRepository._revisions.clear()
          for (const [id, revision] of revisionSnapshot) chargeRepository._revisions.set(id, revision)
          movements.splice(0, movements.length, ...movementSnapshot)
          createdAssets.clear()
          for (const [id, asset] of assetSnapshot) createdAssets.set(id, asset)
          throw error
        }
      },
      createInvoiceGroup: (data: Record<string, unknown>) => ({ id: "group-1", ...data }),
      createEntry: (data: Record<string, unknown>) => ({ id: "entry-1", ...data }),
      createAssetUnit: (data: { id?: string; purchasePriceDzd: number; currentProjectId: string | null }) => {
        const created = { ...data, id: `asset-${createdAssets.size + 1}` }
        createdAssets.set(created.id, created)
        return created
      },
      createMovement: (data: Record<string, unknown>) => {
        const movement = { id: `movement-${movements.length + 1}`, ...data }
        movements.push(movement)
        return movement
      },
      getAssetUnitById: (id: string) => createdAssets.get(id) ?? null,
      listEntriesByInvoiceGroupId: () => [],
      listAttachmentsByInvoiceGroupId: () => [],
      listMovementsByInvoiceGroupId: () => movements,
      listConsumableBalancesByInvoiceGroupId: () => [],
    } as unknown as InventoryRepository

    const chargeService = new AssetChargeService(chargeRepository, repository)
    const service = new InventoryService(
      repository,
      {} as InventoryAttachmentStorage,
      undefined,
      undefined,
      options?.withoutChargeService ? undefined : chargeService,
    )

    return { service, chargeRepository, movements }
  }

  it("charges the purchase price for an asset created directly on a project", () => {
    const { service, chargeRepository, movements } = createInvoiceHarness()

    service.createInvoiceGroup(
      {
        projectId: "project-a",
        entries: [
          {
            kind: "ASSET",
            itemDefinitionId: "def-1",
            projectId: "project-a",
            assets: [{ assetName: "مثقاب", purchasePriceDzd: 100_000 }],
          },
        ],
      },
      AUDIT,
    )

    const charges = [...chargeRepository._charges.values()]
    expect(charges).toHaveLength(1)
    expect(charges[0]).toMatchObject({
      projectId: "project-a",
      amountDzd: 100_000,
      status: "LIVE",
      movementId: (movements[0] as { id: string }).id,
    })
  })

  it("charges a multi-unit project purchase with ONE project read (#422 round 6)", () => {
    const { service, chargeRepository } = createInvoiceHarness()
    let reads = 0
    const original = chargeRepository.listChargesByProject.bind(chargeRepository)
    chargeRepository.listChargesByProject = (projectId: string) => {
      reads += 1
      return original(projectId)
    }

    service.createInvoiceGroup(
      {
        projectId: "project-a",
        entries: [
          {
            kind: "ASSET",
            itemDefinitionId: "def-1",
            projectId: "project-a",
            assets: [
              { assetName: "مثقاب 1", purchasePriceDzd: 100_000 },
              { assetName: "مثقاب 2", purchasePriceDzd: 100_000 },
              { assetName: "مثقاب 3", purchasePriceDzd: 100_000 },
            ],
          },
        ],
      },
      AUDIT,
    )

    expect(reads).toBe(1)
    expect(chargeRepository._charges.size).toBe(3)
    expect([...chargeRepository._charges.values()].map((charge) => charge.amountDzd)).toEqual([
      100_000, 100_000, 100_000,
    ])
  })

  it("charges an asset that inherits the invoice header's project destination", () => {
    // The entry sets neither destination, so `effectiveProjectId` comes from
    // the header. The unit is placed on that project, so it must be charged.
    const { service, chargeRepository } = createInvoiceHarness()

    service.createInvoiceGroup(
      {
        projectId: "project-a",
        entries: [
          {
            kind: "ASSET",
            itemDefinitionId: "def-1",
            assets: [{ assetName: "مثقاب", purchasePriceDzd: 100_000 }],
          },
        ],
      },
      AUDIT,
    )

    expect([...chargeRepository._charges.values()]).toHaveLength(1)
    expect([...chargeRepository._charges.values()][0]).toMatchObject({
      projectId: "project-a",
      amountDzd: 100_000,
    })
  })

  it("fails loudly instead of booking an uncharged invoice placement when the charge service is absent", () => {
    const { service, chargeRepository, movements } = createInvoiceHarness({ withoutChargeService: true })

    expect(() =>
      service.createInvoiceGroup(
        {
          projectId: "project-a",
          entries: [
            {
              kind: "ASSET",
              itemDefinitionId: "def-1",
              projectId: "project-a",
              assets: [{ assetName: "مثقاب", purchasePriceDzd: 100_000 }],
            },
          ],
        },
        AUDIT,
      ),
    ).toThrowError(/احتساب/)

    expect(chargeRepository._charges.size).toBe(0)
    expect(movements).toHaveLength(0)
  })

  it("writes no charge for an asset created on a warehouse", () => {
    const { service, chargeRepository } = createInvoiceHarness()

    service.createInvoiceGroup(
      {
        warehouseId: "wh-1",
        entries: [
          {
            kind: "ASSET",
            itemDefinitionId: "def-1",
            warehouseId: "wh-1",
            assets: [{ assetName: "مثقاب", purchasePriceDzd: 100_000 }],
          },
        ],
      },
      AUDIT,
    )

    expect(chargeRepository._charges.size).toBe(0)
  })

  it("refuses an above-bound purchase price before writing anything", () => {
    // The wire gate rejects this too; this pins the module seam so a direct
    // caller cannot store money the charge contract cannot represent. One
    // ceiling, not two (#422 round 2).
    const { service, chargeRepository, movements } = createInvoiceHarness()

    expect(() =>
      service.createInvoiceGroup(
        {
          projectId: "project-a",
          entries: [
            {
              kind: "ASSET",
              itemDefinitionId: "def-1",
              projectId: "project-a",
              assets: [{ assetName: "مثقاب", purchasePriceDzd: Number.MAX_SAFE_INTEGER + 1 }],
            },
          ],
        },
        AUDIT,
      ),
    ).toThrowError(/خارج النطاق/)

    expect(chargeRepository._charges.size).toBe(0)
    expect(movements).toHaveLength(0)
  })
})

/**
 * The in-memory harness above restores its own snapshot on throw; this suite
 * drives the REAL sqlite adapters over one shared connection + lock, so the
 * rollback is proven by the actual better-sqlite3 savepoint machinery (#422
 * round 4).
 */
describe("InventoryService.transferAsset ↔ charge rollback on real sqlite (#422 round 4)", () => {
  let db: Database.Database | undefined

  function createSeedDb() {
    const raw = new Database(":memory:")
    raw.pragma("foreign_keys = ON")
    for (const statement of schemaStatements) {
      raw.exec(statement)
    }

    const now = "2026-06-01T00:00:00.000Z"
    raw.prepare(`INSERT INTO "warehouse" ("id", "name", "status", "created_at", "updated_at") VALUES ('wh-1', 'رئيسي', 'ACTIVE', ?, ?)`).run(now, now)
    raw.prepare(`INSERT INTO "warehouse" ("id", "name", "status", "created_at", "updated_at") VALUES ('wh-2', 'فرعي', 'ACTIVE', ?, ?)`).run(now, now)
    raw.prepare(`INSERT INTO "project" ("id", "name", "status", "created_at", "updated_at") VALUES ('project-a', 'مشروع أ', 'ACTIVE', ?, ?)`).run(now, now)
    raw.prepare(`INSERT INTO "inventory_item_definition" ("id", "name", "item_type", "is_active", "created_at", "updated_at") VALUES ('def-1', 'مثقاب', 'ASSET', 1, ?, ?)`).run(now, now)
    raw.prepare(`INSERT INTO "inventory_invoice_group" ("id", "supplier_name", "created_at", "updated_at") VALUES ('group-1', 'مورد', ?, ?)`).run(now, now)
    raw.prepare(`INSERT INTO "inventory_entry" ("id", "invoice_group_id", "item_definition_id", "item_type", "item_name", "quantity", "total_price_dzd", "created_at", "updated_at") VALUES ('entry-1', 'group-1', 'def-1', 'ASSET', 'مثقاب', 1, 100000, ?, ?)`).run(now, now)
    raw.prepare(`INSERT INTO "inventory_asset_unit" ("id", "inventory_entry_id", "asset_name", "purchase_price_dzd", "current_warehouse_id", "created_at", "updated_at") VALUES ('asset-1', 'entry-1', 'مثقاب', 100000, 'wh-1', ?, ?)`).run(now, now)
    return raw
  }

  function createRealHarness() {
    db = createSeedDb()
    // ONE lock, as the composition root wires it: the transfer and its charge
    // are two writers on the same shared connection.
    const lock = createFifoLock()
    const inventoryRepository = createInventoryRepository(db, lock)
    const chargeRepository = createAssetChargeRepository(db, lock)
    const chargeService = new AssetChargeService(chargeRepository, inventoryRepository)
    const service = new InventoryService(
      inventoryRepository,
      {} as InventoryAttachmentStorage,
      undefined,
      undefined,
      chargeService,
    )
    return { service, chargeService, inventoryRepository, chargeRepository }
  }

  it("rolls the transfer and its charge back together when a later step fails", () => {
    const { service, inventoryRepository, chargeRepository } = createRealHarness()

    // Insert the real charge, then fail while the transfer transaction is
    // still open — the charge row provably exists before the rollback.
    const insertCharge = chargeRepository.createCharge.bind(chargeRepository)
    chargeRepository.createCharge = (data) => {
      insertCharge(data)
      throw new Error("commit failed after the charge insert")
    }

    expect(() =>
      service.transferAsset({ assetUnitId: "asset-1", toProjectId: "project-a" }, AUDIT),
    ).toThrowError(/commit failed after the charge insert/)

    expect(chargeRepository.listChargesByUnit("asset-1")).toHaveLength(0)
    expect(chargeRepository.listChargesByProject("project-a")).toHaveLength(0)
    expect(inventoryRepository.listMovementsByAssetUnitId("asset-1")).toHaveLength(0)

    const asset = inventoryRepository.getAssetUnitById("asset-1")
    expect(asset?.currentWarehouseId).toBe("wh-1")
    expect(asset?.currentProjectId).toBeNull()
  })

  it("rolls the whole bulk batch back on real sqlite when a later insert fails", () => {
    // The batch gate resolves every amount before writing, so an overflow is
    // refused with nothing written. This test fails AFTER the first insert to
    // prove the real savepoint still discards a partial batch (#422 round 7).
    const { chargeService, chargeRepository } = createRealHarness()

    let inserts = 0
    const insertCharge = chargeRepository.createCharge.bind(chargeRepository)
    chargeRepository.createCharge = (data) => {
      const created = insertCharge(data)
      inserts += 1
      if (inserts === 2) throw new Error("bulk insert failed")
      return created
    }

    expect(() =>
      chargeService.createPlacementCharges(
        {
          projectId: "project-a",
          placements: [
            { assetUnitId: "asset-1", amountDzd: 10 },
            { assetUnitId: "asset-1", amountDzd: 20 },
            { assetUnitId: "asset-1", amountDzd: 30 },
          ],
        },
        AUDIT,
      ),
    ).toThrowError(/bulk insert failed/)

    expect(chargeRepository.listChargesByProject("project-a")).toHaveLength(0)
    expect(chargeRepository.listChargesByUnit("asset-1")).toHaveLength(0)
  })

  afterEach(() => {
    db?.close()
  })
})
