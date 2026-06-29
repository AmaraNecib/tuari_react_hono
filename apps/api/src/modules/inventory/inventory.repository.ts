/**
 * InventoryRepository — Drizzle-backed implementation.
 *
 * Replaces the raw-SQL SqliteInventoryRepository. Uses Drizzle query builders
 * for type-safe, maintainable persistence. Keeps the same InventoryRepository
 * interface so callers don't change.
 *
 * Architecture: Drizzle queries + raw better-sqlite3 handle for transactions
 * (same pattern as CompanyRepository).
 */
import { eq, and, asc, desc, sql, inArray } from "drizzle-orm"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import type { BetterSqliteDatabase } from "../../types/sqlite"
import * as schema from "../../schema"
import { createDrizzleFromSqlite } from "../../infrastructure/database/drizzle"
import { normalizeAuditContext } from "../company/company.repository-mappers"
import { createAlgeriaTimestamp } from "../company/company-time"
import type { MutationAuditContext } from "../company/company.types"
import type {
  InventoryConsumableBalanceCreateData,
  InventoryConsumableBalanceRecord,
  InventoryMovementCreateData,
  InventoryMovementRecord,
  InventoryAssetUnitCreateData,
  InventoryAssetUnitRecord,
  InventoryEntryCreateData,
  InventoryEntryRecord,
  InventoryInvoiceAttachmentCreateData,
  InventoryInvoiceAttachmentRecord,
  InventoryInvoiceGroupCreateData,
  InventoryInvoiceGroupListFilters,
  InventoryInvoiceGroupRecord,
  InventoryItemDefinitionCreateData,
  InventoryItemDefinitionListFilters,
  InventoryItemDefinitionRecord,
  InventoryItemDefinitionUpdateData,
  InventoryOutboundTransferCreateData,
  InventoryOutboundTransferRecord,
} from "./inventory.types"

// ---------------------------------------------------------------------------
// Mapper functions — raw Drizzle row → domain record
// ---------------------------------------------------------------------------

/** Map a raw Drizzle row to InventoryItemDefinitionRecord. */
function mapItemDefinition(row: Record<string, unknown>): InventoryItemDefinitionRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    itemType: row.itemType as InventoryItemDefinitionRecord["itemType"],
    unit: row.unit != null ? String(row.unit) : null,
    description: row.description != null ? String(row.description) : null,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }
}

/** Map a raw Drizzle row to InventoryInvoiceGroupRecord. */
function mapInvoiceGroup(row: Record<string, unknown>): InventoryInvoiceGroupRecord {
  return {
    id: String(row.id),
    invoiceNumber: row.invoiceNumber != null ? String(row.invoiceNumber) : null,
    supplierName: row.supplierName != null ? String(row.supplierName) : null,
    invoiceDate: row.invoiceDate != null ? String(row.invoiceDate) : null,
    warehouseId: row.warehouseId != null ? String(row.warehouseId) : null,
    projectId: row.projectId != null ? String(row.projectId) : null,
    externalCounterpartyId: row.externalCounterpartyId != null ? String(row.externalCounterpartyId) : null,
    grossTotalDzd: Number(row.grossTotalDzd ?? 0),
    paidAmountDzd: Number(row.paidAmountDzd ?? 0),
    remainingDebtDzd: Number(row.remainingDebtDzd ?? 0),
    debtAccountId: row.debtAccountId != null ? String(row.debtAccountId) : null,
    note: row.note != null ? String(row.note) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }
}

/** Map a raw Drizzle row to InventoryAssetUnitRecord. */
function mapAssetUnit(row: Record<string, unknown>): InventoryAssetUnitRecord {
  return {
    id: String(row.id),
    inventoryEntryId: String(row.inventoryEntryId),
    assetName: String(row.assetName),
    assetTag: row.assetTag != null ? String(row.assetTag) : null,
    serialNumber: row.serialNumber != null ? String(row.serialNumber) : null,
    condition: (row.condition as InventoryAssetUnitRecord["condition"]) ?? null,
    purchaseDate: row.purchaseDate != null ? String(row.purchaseDate) : null,
    purchasePriceDzd: Number(row.purchasePriceDzd ?? 0),
    currentWarehouseId: row.currentWarehouseId != null ? String(row.currentWarehouseId) : null,
    currentProjectId: row.currentProjectId != null ? String(row.currentProjectId) : null,
    currentLocationLabel: row.currentLocationLabel != null ? String(row.currentLocationLabel) : null,
    note: row.note != null ? String(row.note) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }
}

/** Map a raw row to InventoryConsumableBalanceRecord. Handles both Drizzle (camelCase) and raw SQL (snake_case) results. */
function mapConsumableBalance(row: Record<string, unknown>): InventoryConsumableBalanceRecord {
  return {
    id: String(row.id),
    inventoryEntryId: String(row.inventoryEntryId ?? row.inventory_entry_id),
    itemDefinitionId: String(row.itemDefinitionId ?? row.item_definition_id),
    itemName: String(row.itemName ?? row.item_name ?? ""),
    warehouseId: (row.warehouseId ?? row.warehouse_id) != null ? String(row.warehouseId ?? row.warehouse_id) : null,
    projectId: (row.projectId ?? row.project_id) != null ? String(row.projectId ?? row.project_id) : null,
    quantity: Number(row.quantity ?? 0),
    locationLabel: String(row.locationLabel ?? row.location_label ?? "غير محدد"),
    createdAt: String(row.createdAt ?? row.created_at),
    updatedAt: String(row.updatedAt ?? row.updated_at),
  }
}

/** Map a raw Drizzle row to InventoryMovementRecord. */
function mapMovement(row: Record<string, unknown>): InventoryMovementRecord {
  return {
    id: String(row.id),
    movementType: row.movementType as InventoryMovementRecord["movementType"],
    itemType: row.itemType as InventoryMovementRecord["itemType"],
    inventoryEntryId: row.inventoryEntryId != null ? String(row.inventoryEntryId) : null,
    assetUnitId: row.assetUnitId != null ? String(row.assetUnitId) : null,
    quantity: Number(row.quantity ?? 0),
    fromWarehouseId: row.fromWarehouseId != null ? String(row.fromWarehouseId) : null,
    fromProjectId: row.fromProjectId != null ? String(row.fromProjectId) : null,
    toWarehouseId: row.toWarehouseId != null ? String(row.toWarehouseId) : null,
    toProjectId: row.toProjectId != null ? String(row.toProjectId) : null,
    note: row.note != null ? String(row.note) : null,
    occurredAt: String(row.occurredAt),
    createdAt: String(row.createdAt),
  }
}

/** Map a raw Drizzle row to InventoryEntryRecord. */
function mapEntry(row: Record<string, unknown>, assets: InventoryAssetUnitRecord[]): InventoryEntryRecord {
  return {
    id: String(row.id),
    invoiceGroupId: String(row.invoiceGroupId),
    itemDefinitionId: String(row.itemDefinitionId),
    warehouseId: row.warehouseId != null ? String(row.warehouseId) : null,
    projectId: row.projectId != null ? String(row.projectId) : null,
    itemType: row.itemType as InventoryEntryRecord["itemType"],
    itemName: String(row.itemName),
    unit: row.unit != null ? String(row.unit) : null,
    quantity: Number(row.quantity ?? 0),
    unitPriceDzd: row.unitPriceDzd != null ? Number(row.unitPriceDzd) : null,
    totalPriceDzd: Number(row.totalPriceDzd ?? 0),
    note: row.note != null ? String(row.note) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    assets,
  }
}

/** Map a raw Drizzle row to InventoryInvoiceAttachmentRecord. */
function mapAttachment(row: Record<string, unknown>): InventoryInvoiceAttachmentRecord {
  const id = String(row.id)
  return {
    id,
    invoiceGroupId: String(row.invoiceGroupId),
    originalName: String(row.originalName),
    mimeType: String(row.mimeType),
    byteSize: Number(row.byteSize),
    storageKey: String(row.storageKey),
    relativePath: String(row.relativePath),
    downloadUrl: `/api/inventory/attachments/${id}`,
    sha256: row.sha256 != null ? String(row.sha256) : null,
    createdAt: String(row.createdAt),
  }
}

/** Map a raw Drizzle row to InventoryOutboundTransferRecord. */
function mapOutboundTransfer(row: Record<string, unknown>): InventoryOutboundTransferRecord {
  return {
    id: String(row.id),
    transferDate: String(row.transferDate),
    fromType: row.fromType as InventoryOutboundTransferRecord["fromType"],
    fromId: String(row.fromId),
    counterpartyId: String(row.counterpartyId),
    transferType: row.transferType as InventoryOutboundTransferRecord["transferType"],
    status: (row.status as InventoryOutboundTransferRecord["status"]) ?? "COMPLETED" as const,
    associatedDebtAccountId: row.associatedDebtAccountId != null ? String(row.associatedDebtAccountId) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }
}

/** Resolve location label from warehouse/project IDs. */
function resolveLocationLabelByIds(database: BetterSqliteDatabase, warehouseId?: string | null, projectId?: string | null): string {
  if (warehouseId) {
    const row = database.prepare("SELECT name FROM warehouse WHERE id = ?").get(warehouseId) as Record<string, unknown> | undefined
    return row ? `المستودع: ${String(row.name)}` : "المستودع"
  }
  if (projectId) {
    const row = database.prepare("SELECT name FROM project WHERE id = ?").get(projectId) as Record<string, unknown> | undefined
    return row ? `المشروع: ${String(row.name)}` : "المشروع"
  }
  return "غير محدد"
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

/** Inventory persistence interface. */
/** Repository interface for inventory data access. */
export interface InventoryRepository {
  withTransaction<T>(callback: () => T): T
  listItemDefinitions(filters?: InventoryItemDefinitionListFilters): InventoryItemDefinitionRecord[]
  getItemDefinitionById(id: string): InventoryItemDefinitionRecord | null
  createItemDefinition(data: InventoryItemDefinitionCreateData, auditContext?: MutationAuditContext): InventoryItemDefinitionRecord
  updateItemDefinition(data: InventoryItemDefinitionUpdateData, auditContext?: MutationAuditContext): InventoryItemDefinitionRecord | null
  warehouseExists(id: string): boolean
  projectExists(id: string): boolean
  externalCounterpartyExists(id: string): boolean
  listInvoiceGroups(filters?: InventoryInvoiceGroupListFilters): InventoryInvoiceGroupRecord[]
  getLatestInvoiceNumber(): string | null
  getInvoiceGroupById(id: string): InventoryInvoiceGroupRecord | null
  createInvoiceGroup(data: InventoryInvoiceGroupCreateData): InventoryInvoiceGroupRecord
  listEntriesByInvoiceGroupId(invoiceGroupId: string): InventoryEntryRecord[]
  createEntry(data: InventoryEntryCreateData): InventoryEntryRecord
  getEntryById(id: string): InventoryEntryRecord | null
  createAssetUnit(data: InventoryAssetUnitCreateData): InventoryAssetUnitRecord
  getAssetUnitById(id: string): InventoryAssetUnitRecord | null
  updateAssetUnitLocation(id: string, location: { currentWarehouseId?: string | null; currentProjectId?: string | null; currentLocationLabel?: string | null }): InventoryAssetUnitRecord | null
  listAssetUnitsByLocation(filters: { warehouseId?: string; projectId?: string }): InventoryAssetUnitRecord[]
  createConsumableBalance(data: InventoryConsumableBalanceCreateData): InventoryConsumableBalanceRecord
  listConsumableBalancesByInvoiceGroupId(invoiceGroupId: string): InventoryConsumableBalanceRecord[]
  listConsumableBalancesByLocation(filters: { warehouseId?: string; projectId?: string }): InventoryConsumableBalanceRecord[]
  getConsumableBalanceByEntryAndLocation(filters: { inventoryEntryId: string; warehouseId?: string | null; projectId?: string | null }): InventoryConsumableBalanceRecord | null
  updateConsumableBalanceQuantity(id: string, quantity: number): void
  deleteConsumableBalance(id: string): void
  createMovement(data: InventoryMovementCreateData): InventoryMovementRecord
  listMovementsByInvoiceGroupId(invoiceGroupId: string): InventoryMovementRecord[]
  listMovementsByAssetUnitId(assetUnitId: string): InventoryMovementRecord[]
  listAttachmentsByInvoiceGroupId(invoiceGroupId: string): InventoryInvoiceAttachmentRecord[]
  createAttachment(data: InventoryInvoiceAttachmentCreateData): InventoryInvoiceAttachmentRecord
  getAttachmentById(id: string): InventoryInvoiceAttachmentRecord | null
  updateInvoiceGroupPayment(id: string, paidAmountDzd: number, remainingDebtDzd: number, auditContext?: MutationAuditContext): InventoryInvoiceGroupRecord | null
  createOutboundTransfer(data: InventoryOutboundTransferCreateData, auditContext?: MutationAuditContext): InventoryOutboundTransferRecord
  listOutboundTransfers(): InventoryOutboundTransferRecord[]
  getOutboundTransferById(id: string): InventoryOutboundTransferRecord | null
  listMovementsByLocation(input: { warehouseId?: string; projectId?: string; dateFrom?: string; dateTo?: string; movementType?: string; limit?: number }): InventoryMovementRecord[]
  listAllMovements(input: { dateFrom?: string; dateTo?: string; movementType?: string; limit?: number }): InventoryMovementRecord[]
}

// ---------------------------------------------------------------------------
// Drizzle-backed implementation
// ---------------------------------------------------------------------------

/**
 * Drizzle-backed InventoryRepository.
 *
 * Uses Drizzle query builders for type-safe reads/writes, plus raw
 * better-sqlite3 handle for transactions and location label resolution.
 */
/**
 * Drizzle-backed inventory repository implementation.
 */
export class DrizzleInventoryRepository implements InventoryRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private readonly db: BetterSQLite3Database<any>,
    private readonly raw: BetterSqliteDatabase,
  ) {
    this.raw.pragma("foreign_keys = ON")
  }

  /** Execute a callback inside a raw SQLite transaction. */
  withTransaction<T>(callback: () => T): T {
    return this.raw.transaction(callback)()
  }

  // ── Item Definitions ────────────────────────────────────────────────

  listItemDefinitions(filters?: InventoryItemDefinitionListFilters) {
    const conditions: ReturnType<typeof eq>[] = []
    if (filters?.itemType) conditions.push(eq(schema.inventoryItemDefinition.itemType, filters.itemType))
    if (typeof filters?.isActive === "boolean") conditions.push(eq(schema.inventoryItemDefinition.isActive, filters.isActive ? 1 : 0))

    const q = this.db.select().from(schema.inventoryItemDefinition)
    const rows = (conditions.length > 0 ? q.where(and(...conditions)) : q)
      .orderBy(asc(schema.inventoryItemDefinition.name), asc(schema.inventoryItemDefinition.createdAt))
      .all()
    return rows.map(mapItemDefinition)
  }

  getItemDefinitionById(id: string) {
    const row = this.db.select().from(schema.inventoryItemDefinition)
      .where(eq(schema.inventoryItemDefinition.id, id))
      .limit(1).all()[0]
    return row ? mapItemDefinition(row) : null
  }

  createItemDefinition(data: InventoryItemDefinitionCreateData, auditContext?: MutationAuditContext) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    const audit = normalizeAuditContext(auditContext)
    this.db.insert(schema.inventoryItemDefinition).values({
      id, name: data.name, itemType: data.itemType, unit: data.unit ?? null,
      description: data.description ?? null, isActive: 1,
      actorUserId: audit.actorUserId, actorLabel: audit.actorLabel,
      transactionId: audit.transactionId, createdAt: timestamp, updatedAt: timestamp,
    }).run()
    return this.getItemDefinitionById(id)!
  }

  updateItemDefinition(data: InventoryItemDefinitionUpdateData, _auditContext?: MutationAuditContext) {
    const current = this.getItemDefinitionById(data.id)
    if (!current) return null

    const next = {
      name: data.name ?? current.name,
      itemType: data.itemType ?? current.itemType,
      unit: data.unit !== undefined ? data.unit : current.unit,
      description: data.description !== undefined ? data.description : current.description,
      isActive: data.isActive ?? current.isActive,
      updatedAt: createAlgeriaTimestamp(),
    }

    this.db.update(schema.inventoryItemDefinition).set({
      name: next.name, itemType: next.itemType, unit: next.unit ?? null,
      description: next.description ?? null, isActive: next.isActive ? 1 : 0,
      updatedAt: next.updatedAt,
    }).where(eq(schema.inventoryItemDefinition.id, data.id)).run()

    return this.getItemDefinitionById(data.id)
  }

  // ── Existence checks ────────────────────────────────────────────────

  warehouseExists(id: string) {
    return this.db.select({ id: schema.warehouse.id }).from(schema.warehouse)
      .where(eq(schema.warehouse.id, id))
      .limit(1).all().length > 0
  }

  projectExists(id: string) {
    return this.db.select({ id: schema.project.id }).from(schema.project)
      .where(eq(schema.project.id, id))
      .limit(1).all().length > 0
  }

  externalCounterpartyExists(id: string) {
    return this.db.select({ id: schema.externalCounterparty.id }).from(schema.externalCounterparty)
      .where(eq(schema.externalCounterparty.id, id))
      .limit(1).all().length > 0
  }

  // ── Invoice Groups ──────────────────────────────────────────────────

  listInvoiceGroups(filters?: InventoryInvoiceGroupListFilters) {
    const conditions: ReturnType<typeof eq>[] = []
    if (filters?.warehouseId) conditions.push(eq(schema.inventoryInvoiceGroup.warehouseId, filters.warehouseId))
    if (filters?.projectId) conditions.push(eq(schema.inventoryInvoiceGroup.projectId, filters.projectId))

    const q = this.db.select().from(schema.inventoryInvoiceGroup)
    return (conditions.length > 0 ? q.where(and(...conditions)) : q)
      .orderBy(desc(schema.inventoryInvoiceGroup.invoiceDate), desc(schema.inventoryInvoiceGroup.createdAt))
      .all().map(mapInvoiceGroup)
  }

  getLatestInvoiceNumber() {
    const row = this.db.select({ invoiceNumber: schema.inventoryInvoiceGroup.invoiceNumber })
      .from(schema.inventoryInvoiceGroup)
      .where(and(
        sql`${schema.inventoryInvoiceGroup.invoiceNumber} IS NOT NULL`,
        sql`${schema.inventoryInvoiceGroup.invoiceNumber} LIKE 'IN-%'`,
      ))
      .orderBy(desc(schema.inventoryInvoiceGroup.createdAt))
      .limit(1).all()[0]
    return row?.invoiceNumber ?? null
  }

  getInvoiceGroupById(id: string) {
    const row = this.db.select().from(schema.inventoryInvoiceGroup)
      .where(eq(schema.inventoryInvoiceGroup.id, id))
      .limit(1).all()[0]
    return row ? mapInvoiceGroup(row) : null
  }

  createInvoiceGroup(data: InventoryInvoiceGroupCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.db.insert(schema.inventoryInvoiceGroup).values({
      id, invoiceNumber: data.invoiceNumber ?? null, supplierName: data.supplierName ?? null,
      invoiceDate: data.invoiceDate ?? null, warehouseId: data.warehouseId ?? null,
      projectId: data.projectId ?? null, externalCounterpartyId: data.externalCounterpartyId ?? null,
      grossTotalDzd: data.grossTotalDzd ?? 0, paidAmountDzd: data.paidAmountDzd ?? 0,
      remainingDebtDzd: data.remainingDebtDzd ?? 0, debtAccountId: data.debtAccountId ?? null,
      note: data.note ?? null, createdAt: timestamp, updatedAt: timestamp,
    }).run()
    return this.getInvoiceGroupById(id)!
  }

  updateInvoiceGroupPayment(id: string, paidAmountDzd: number, remainingDebtDzd: number, _auditContext?: MutationAuditContext) {
    this.db.update(schema.inventoryInvoiceGroup).set({
      paidAmountDzd, remainingDebtDzd, updatedAt: createAlgeriaTimestamp(),
    }).where(eq(schema.inventoryInvoiceGroup.id, id)).run()
    return this.getInvoiceGroupById(id)
  }

  // ── Entries ─────────────────────────────────────────────────────────

  listEntriesByInvoiceGroupId(invoiceGroupId: string) {
    const assetRows = this.db.select().from(schema.inventoryAssetUnit)
      .where(inArray(schema.inventoryAssetUnit.inventoryEntryId, sql`(SELECT id FROM inventory_entry WHERE invoice_group_id = ${invoiceGroupId})`))
      .orderBy(asc(schema.inventoryAssetUnit.createdAt)).all()
    const assetsByEntryId = new Map<string, InventoryAssetUnitRecord[]>()
    for (const row of assetRows) {
      const asset = mapAssetUnit(row)
      const existing = assetsByEntryId.get(asset.inventoryEntryId)
      if (existing) existing.push(asset)
      else assetsByEntryId.set(asset.inventoryEntryId, [asset])
    }

    const rows = this.db.select().from(schema.inventoryEntry)
      .where(eq(schema.inventoryEntry.invoiceGroupId, invoiceGroupId))
      .orderBy(asc(schema.inventoryEntry.createdAt)).all()
    return rows.map((row) => mapEntry(row, assetsByEntryId.get(String(row.id)) ?? []))
  }

  getEntryById(id: string) {
    const row = this.db.select().from(schema.inventoryEntry)
      .where(eq(schema.inventoryEntry.id, id))
      .limit(1).all()[0]
    if (!row) return null
    const assets = this.db.select().from(schema.inventoryAssetUnit)
      .where(eq(schema.inventoryAssetUnit.inventoryEntryId, id))
      .orderBy(asc(schema.inventoryAssetUnit.createdAt)).all().map(mapAssetUnit)
    return mapEntry(row, assets)
  }

  createEntry(data: InventoryEntryCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.db.insert(schema.inventoryEntry).values({
      id, invoiceGroupId: data.invoiceGroupId, itemDefinitionId: data.itemDefinitionId,
      warehouseId: data.warehouseId ?? null, projectId: data.projectId ?? null,
      itemType: data.itemType, itemName: data.itemName, unit: data.unit ?? null,
      quantity: data.quantity, unitPriceDzd: data.unitPriceDzd ?? null,
      totalPriceDzd: data.totalPriceDzd, note: data.note ?? null,
      createdAt: timestamp, updatedAt: timestamp,
    }).run()
    return this.listEntriesByInvoiceGroupId(data.invoiceGroupId).find((entry) => entry.id === id)!
  }

  // ── Asset Units ─────────────────────────────────────────────────────

  createAssetUnit(data: InventoryAssetUnitCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.db.insert(schema.inventoryAssetUnit).values({
      id, inventoryEntryId: data.inventoryEntryId, assetName: data.assetName,
      assetTag: data.assetTag ?? null, serialNumber: data.serialNumber ?? null,
      condition: data.condition ?? null, purchaseDate: data.purchaseDate ?? null,
      purchasePriceDzd: data.purchasePriceDzd, currentWarehouseId: data.currentWarehouseId ?? null,
      currentProjectId: data.currentProjectId ?? null,
      currentLocationLabel: resolveLocationLabelByIds(this.raw, data.currentWarehouseId, data.currentProjectId),
      note: data.note ?? null, createdAt: timestamp, updatedAt: timestamp,
    }).run()
    const row = this.db.select().from(schema.inventoryAssetUnit)
      .where(eq(schema.inventoryAssetUnit.id, id)).limit(1).all()[0]
    return mapAssetUnit(row!)
  }

  getAssetUnitById(id: string) {
    const row = this.db.select().from(schema.inventoryAssetUnit)
      .where(eq(schema.inventoryAssetUnit.id, id))
      .limit(1).all()[0]
    return row ? mapAssetUnit(row) : null
  }

  updateAssetUnitLocation(id: string, location: { currentWarehouseId?: string | null; currentProjectId?: string | null; currentLocationLabel?: string | null }) {
    this.db.update(schema.inventoryAssetUnit).set({
      currentWarehouseId: location.currentWarehouseId ?? null,
      currentProjectId: location.currentProjectId ?? null,
      currentLocationLabel: location.currentLocationLabel ?? resolveLocationLabelByIds(this.raw, location.currentWarehouseId, location.currentProjectId),
      updatedAt: createAlgeriaTimestamp(),
    }).where(eq(schema.inventoryAssetUnit.id, id)).run()
    return this.getAssetUnitById(id)
  }

  listAssetUnitsByLocation(filters: { warehouseId?: string; projectId?: string }) {
    const condition = filters.warehouseId
      ? eq(schema.inventoryAssetUnit.currentWarehouseId, filters.warehouseId)
      : eq(schema.inventoryAssetUnit.currentProjectId, filters.projectId ?? "")
    return this.db.select().from(schema.inventoryAssetUnit)
      .where(condition)
      .orderBy(desc(schema.inventoryAssetUnit.updatedAt))
      .all().map(mapAssetUnit)
  }

  // ── Consumable Balances ─────────────────────────────────────────────

  createConsumableBalance(data: InventoryConsumableBalanceCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.db.insert(schema.inventoryConsumableBalance).values({
      id, inventoryEntryId: data.inventoryEntryId, itemDefinitionId: data.itemDefinitionId,
      warehouseId: data.warehouseId ?? null, projectId: data.projectId ?? null,
      quantity: data.quantity, createdAt: timestamp, updatedAt: timestamp,
    }).run()
    return this.getConsumableBalanceByEntryAndLocation({
      inventoryEntryId: data.inventoryEntryId, warehouseId: data.warehouseId, projectId: data.projectId,
    })!
  }

  listConsumableBalancesByInvoiceGroupId(invoiceGroupId: string) {
    const rows = this.raw.prepare(`
      SELECT b.*, e.item_name AS item_name,
        COALESCE('المستودع: ' || w.name, 'المشروع: ' || p.name, 'غير محدد') AS location_label
      FROM inventory_consumable_balance b
      INNER JOIN inventory_entry e ON e.id = b.inventory_entry_id
      LEFT JOIN warehouse w ON w.id = b.warehouse_id
      LEFT JOIN project p ON p.id = b.project_id
      WHERE b.inventory_entry_id IN (SELECT id FROM inventory_entry WHERE invoice_group_id = ?)
        AND b.quantity > 0
      ORDER BY b.updated_at DESC
    `).all(invoiceGroupId) as Record<string, unknown>[]
    return rows.map(mapConsumableBalance)
  }

  listConsumableBalancesByLocation(filters: { warehouseId?: string; projectId?: string }) {
    const locationCol = filters.warehouseId ? "b.warehouse_id" : "b.project_id"
    const rows = this.raw.prepare(`
      SELECT b.*, e.item_name AS item_name,
        COALESCE('المستودع: ' || w.name, 'المشروع: ' || p.name, 'غير محدد') AS location_label
      FROM inventory_consumable_balance b
      INNER JOIN inventory_entry e ON e.id = b.inventory_entry_id
      LEFT JOIN warehouse w ON w.id = b.warehouse_id
      LEFT JOIN project p ON p.id = b.project_id
      WHERE ${locationCol} = ? AND b.quantity > 0
      ORDER BY b.updated_at DESC
    `).all(filters.warehouseId ?? filters.projectId ?? "") as Record<string, unknown>[]
    return rows.map(mapConsumableBalance)
  }

  getConsumableBalanceByEntryAndLocation(filters: { inventoryEntryId: string; warehouseId?: string | null; projectId?: string | null }) {
    let locationClause: string
    let locationParam: string | null
    if (filters.warehouseId) {
      locationClause = "b.warehouse_id = ? AND b.project_id IS NULL"
      locationParam = filters.warehouseId
    } else if (filters.projectId) {
      locationClause = "b.project_id = ? AND b.warehouse_id IS NULL"
      locationParam = filters.projectId
    } else {
      locationClause = "b.warehouse_id IS NULL AND b.project_id IS NULL"
      locationParam = null
    }
    const row = this.raw.prepare(`
      SELECT b.*, e.item_name AS item_name,
        COALESCE('المستودع: ' || w.name, 'المشروع: ' || p.name, 'غير محدد') AS location_label
      FROM inventory_consumable_balance b
      INNER JOIN inventory_entry e ON e.id = b.inventory_entry_id
      LEFT JOIN warehouse w ON w.id = b.warehouse_id
      LEFT JOIN project p ON p.id = b.project_id
      WHERE b.inventory_entry_id = ? AND ${locationClause} LIMIT 1
    `).get(filters.inventoryEntryId, locationParam) as Record<string, unknown> | undefined
    return row ? mapConsumableBalance(row) : null
  }

  updateConsumableBalanceQuantity(id: string, quantity: number) {
    this.db.update(schema.inventoryConsumableBalance).set({
      quantity, updatedAt: createAlgeriaTimestamp(),
    }).where(eq(schema.inventoryConsumableBalance.id, id)).run()
  }

  deleteConsumableBalance(id: string) {
    this.db.delete(schema.inventoryConsumableBalance)
      .where(eq(schema.inventoryConsumableBalance.id, id)).run()
  }

  // ── Movements ───────────────────────────────────────────────────────

  createMovement(data: InventoryMovementCreateData) {
    const id = crypto.randomUUID()
    const createdAt = createAlgeriaTimestamp()
    this.db.insert(schema.inventoryMovement).values({
      id, movementType: data.movementType, itemType: data.itemType,
      inventoryEntryId: data.inventoryEntryId ?? null, assetUnitId: data.assetUnitId ?? null,
      quantity: data.quantity, fromWarehouseId: data.fromWarehouseId ?? null,
      fromProjectId: data.fromProjectId ?? null, toWarehouseId: data.toWarehouseId ?? null,
      toProjectId: data.toProjectId ?? null, note: data.note ?? null,
      occurredAt: data.occurredAt, createdAt,
    }).run()
    const row = this.db.select().from(schema.inventoryMovement)
      .where(eq(schema.inventoryMovement.id, id)).limit(1).all()[0]
    return mapMovement(row!)
  }

  listMovementsByInvoiceGroupId(invoiceGroupId: string) {
    return this.db.select().from(schema.inventoryMovement)
      .where(inArray(schema.inventoryMovement.inventoryEntryId, sql`(SELECT id FROM inventory_entry WHERE invoice_group_id = ${invoiceGroupId})`))
      .orderBy(desc(schema.inventoryMovement.occurredAt), desc(schema.inventoryMovement.createdAt))
      .all().map(mapMovement)
  }

  listMovementsByAssetUnitId(assetUnitId: string) {
    return this.db.select().from(schema.inventoryMovement)
      .where(eq(schema.inventoryMovement.assetUnitId, assetUnitId))
      .orderBy(desc(schema.inventoryMovement.occurredAt), desc(schema.inventoryMovement.createdAt))
      .all().map(mapMovement)
  }

  listMovementsByLocation(input: { warehouseId?: string; projectId?: string; dateFrom?: string; dateTo?: string; movementType?: string; limit?: number }) {
    const hasWarehouse = !!input.warehouseId
    const hasProject = !!input.projectId
    if ((hasWarehouse && hasProject) || (!hasWarehouse && !hasProject)) {
      throw new Error("listMovementsByLocation requires exactly one of warehouseId or projectId")
    }

    const conditions = []

    if (input.warehouseId) {
      conditions.push(
        sql`(${schema.inventoryMovement.fromWarehouseId} = ${input.warehouseId} OR ${schema.inventoryMovement.toWarehouseId} = ${input.warehouseId})`
      )
    }

    if (input.projectId) {
      conditions.push(
        sql`(${schema.inventoryMovement.fromProjectId} = ${input.projectId} OR ${schema.inventoryMovement.toProjectId} = ${input.projectId})`
      )
    }

    if (input.dateFrom) {
      conditions.push(sql`${schema.inventoryMovement.occurredAt} >= ${input.dateFrom}`)
    }

    if (input.dateTo) {
      conditions.push(sql`${schema.inventoryMovement.occurredAt} <= ${input.dateTo}`)
    }

    if (input.movementType) {
      conditions.push(sql`${schema.inventoryMovement.movementType} = ${input.movementType}`)
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    return this.db.select().from(schema.inventoryMovement)
      .where(whereClause)
      .orderBy(desc(schema.inventoryMovement.occurredAt), desc(schema.inventoryMovement.createdAt))
      .limit(input.limit ?? 100)
      .all().map(mapMovement)
  }

  listAllMovements(input: { dateFrom?: string; dateTo?: string; movementType?: string; limit?: number }) {
    const conditions = []

    if (input.dateFrom) {
      conditions.push(sql`${schema.inventoryMovement.occurredAt} >= ${input.dateFrom}`)
    }

    if (input.dateTo) {
      conditions.push(sql`${schema.inventoryMovement.occurredAt} <= ${input.dateTo}`)
    }

    if (input.movementType) {
      conditions.push(eq(schema.inventoryMovement.movementType, input.movementType))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    return this.db.select().from(schema.inventoryMovement)
      .where(whereClause)
      .orderBy(desc(schema.inventoryMovement.occurredAt), desc(schema.inventoryMovement.createdAt))
      .limit(input.limit ?? 100)
      .all().map(mapMovement)
  }

  // ── Attachments ─────────────────────────────────────────────────────

  listAttachmentsByInvoiceGroupId(invoiceGroupId: string) {
    return this.db.select().from(schema.inventoryInvoiceAttachment)
      .where(eq(schema.inventoryInvoiceAttachment.invoiceGroupId, invoiceGroupId))
      .orderBy(desc(schema.inventoryInvoiceAttachment.createdAt))
      .all().map(mapAttachment)
  }

  createAttachment(data: InventoryInvoiceAttachmentCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.db.insert(schema.inventoryInvoiceAttachment).values({
      id, invoiceGroupId: data.invoiceGroupId, originalName: data.originalName,
      mimeType: data.mimeType, byteSize: data.byteSize, storageKey: data.storageKey,
      relativePath: data.relativePath, sha256: data.sha256 ?? null, createdAt: timestamp,
    }).run()
    return this.getAttachmentById(id)!
  }

  getAttachmentById(id: string) {
    const row = this.db.select().from(schema.inventoryInvoiceAttachment)
      .where(eq(schema.inventoryInvoiceAttachment.id, id))
      .limit(1).all()[0]
    return row ? mapAttachment(row) : null
  }

  // ── Outbound Transfers ──────────────────────────────────────────────

  createOutboundTransfer(data: InventoryOutboundTransferCreateData, auditContext?: MutationAuditContext) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    const audit = normalizeAuditContext(auditContext)
    this.raw.transaction(() => {
      this.raw.prepare(
        `INSERT INTO inventory_outbound_transfer (id, transfer_date, from_type, from_id, counterparty_id, transfer_type, status, associated_debt_account_id, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, timestamp, data.fromType, data.fromId, data.counterpartyId, data.transferType,
        "COMPLETED", data.associatedDebtAccountId ?? null, data.notes ?? null,
        audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, timestamp)

      for (const item of data.items) {
        const itemId = crypto.randomUUID()
        this.raw.prepare(
          "INSERT INTO inventory_outbound_transfer_item (id, transfer_id, item_id, quantity, unit_price_dzd, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(itemId, id, item.itemId, item.quantity, item.unitPriceDzd ?? null, timestamp)
      }
    })()
    return this.getOutboundTransferById(id)!
  }

  listOutboundTransfers() {
    return this.db.select().from(schema.inventoryOutboundTransfer)
      .orderBy(desc(schema.inventoryOutboundTransfer.transferDate), desc(schema.inventoryOutboundTransfer.createdAt))
      .all().map(mapOutboundTransfer)
  }

  getOutboundTransferById(id: string) {
    const row = this.db.select().from(schema.inventoryOutboundTransfer)
      .where(eq(schema.inventoryOutboundTransfer.id, id))
      .limit(1).all()[0]
    return row ? mapOutboundTransfer(row) : null
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a Drizzle-backed InventoryRepository from a raw SQLite handle. */
export function createInventoryRepository(rawDb: BetterSqliteDatabase): InventoryRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drizzleDb = createDrizzleFromSqlite(rawDb as any)
  return new DrizzleInventoryRepository(drizzleDb, rawDb)
}
