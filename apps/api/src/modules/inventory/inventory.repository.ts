import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import Database from "better-sqlite3"

import { resolveDatabaseEnv } from "../../infrastructure/config/database-env"
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

// Architecture note: business-domain persistence intentionally uses explicit
// better-sqlite3 SQL. See docs/architecture-decisions.md (ADR-001) before
// adding or migrating business queries to Prisma.

type SqliteRow = Record<string, unknown>

function toNullableString(value: unknown) {
  return typeof value === "string" ? value : null
}

function toBoolean(value: unknown) {
  return value === 1 || value === true
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0)
}

function mapItemDefinition(row: SqliteRow): InventoryItemDefinitionRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    itemType: row.item_type as InventoryItemDefinitionRecord["itemType"],
    unit: toNullableString(row.unit),
    description: toNullableString(row.description),
    isActive: toBoolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapInvoiceGroup(row: SqliteRow): InventoryInvoiceGroupRecord {
  return {
    id: String(row.id),
    invoiceNumber: toNullableString(row.invoice_number),
    supplierName: toNullableString(row.supplier_name),
    invoiceDate: toNullableString(row.invoice_date),
    warehouseId: toNullableString(row.warehouse_id),
    projectId: toNullableString(row.project_id),
    externalCounterpartyId: toNullableString(row.external_counterparty_id),
    grossTotalDzd: toNumber(row.gross_total_dzd),
    paidAmountDzd: toNumber(row.paid_amount_dzd),
    remainingDebtDzd: toNumber(row.remaining_debt_dzd),
    debtAccountId: toNullableString(row.debt_account_id),
    note: toNullableString(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapAssetUnit(row: SqliteRow): InventoryAssetUnitRecord {
  return {
    id: String(row.id),
    inventoryEntryId: String(row.inventory_entry_id),
    assetName: String(row.asset_name),
    assetTag: toNullableString(row.asset_tag),
    serialNumber: toNullableString(row.serial_number),
    condition: (toNullableString(row.condition) as InventoryAssetUnitRecord["condition"]) ?? null,
    purchaseDate: toNullableString(row.purchase_date),
    purchasePriceDzd: toNumber(row.purchase_price_dzd),
    currentWarehouseId: toNullableString(row.current_warehouse_id),
    currentProjectId: toNullableString(row.current_project_id),
    currentLocationLabel: toNullableString(row.current_location_label),
    note: toNullableString(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapConsumableBalance(row: SqliteRow): InventoryConsumableBalanceRecord {
  return {
    id: String(row.id),
    inventoryEntryId: String(row.inventory_entry_id),
    itemDefinitionId: String(row.item_definition_id),
    itemName: String(row.item_name),
    warehouseId: toNullableString(row.warehouse_id),
    projectId: toNullableString(row.project_id),
    quantity: toNumber(row.quantity),
    locationLabel: String(row.location_label ?? "غير محدد"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapMovement(row: SqliteRow): InventoryMovementRecord {
  return {
    id: String(row.id),
    movementType: row.movement_type as InventoryMovementRecord["movementType"],
    itemType: row.item_type as InventoryMovementRecord["itemType"],
    inventoryEntryId: toNullableString(row.inventory_entry_id),
    assetUnitId: toNullableString(row.asset_unit_id),
    quantity: toNumber(row.quantity),
    fromWarehouseId: toNullableString(row.from_warehouse_id),
    fromProjectId: toNullableString(row.from_project_id),
    toWarehouseId: toNullableString(row.to_warehouse_id),
    toProjectId: toNullableString(row.to_project_id),
    note: toNullableString(row.note),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
  }
}

function mapEntry(row: SqliteRow, assets: InventoryAssetUnitRecord[]): InventoryEntryRecord {
  return {
    id: String(row.id),
    invoiceGroupId: String(row.invoice_group_id),
    itemDefinitionId: String(row.item_definition_id),
    warehouseId: toNullableString(row.warehouse_id),
    projectId: toNullableString(row.project_id),
    itemType: row.item_type as InventoryEntryRecord["itemType"],
    itemName: String(row.item_name),
    unit: toNullableString(row.unit),
    quantity: toNumber(row.quantity),
    unitPriceDzd: row.unit_price_dzd === null || row.unit_price_dzd === undefined ? null : toNumber(row.unit_price_dzd),
    totalPriceDzd: toNumber(row.total_price_dzd),
    note: toNullableString(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    assets,
  }
}

function mapAttachment(row: SqliteRow): InventoryInvoiceAttachmentRecord {
  const id = String(row.id)
  return {
    id,
    invoiceGroupId: String(row.invoice_group_id),
    originalName: String(row.original_name),
    mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size),
    storageKey: String(row.storage_key),
    relativePath: String(row.relative_path),
    downloadUrl: `/api/inventory/attachments/${id}`,
    sha256: toNullableString(row.sha256),
    createdAt: String(row.created_at),
  }
}

function mapOutboundTransfer(row: SqliteRow): InventoryOutboundTransferRecord {
  return {
    id: String(row.id),
    transferDate: String(row.transfer_date),
    fromType: row.from_type as InventoryOutboundTransferRecord["fromType"],
    fromId: String(row.from_id),
    counterpartyId: String(row.counterparty_id),
    transferType: row.transfer_type as InventoryOutboundTransferRecord["transferType"],
    status: "COMPLETED" as const,
    associatedDebtAccountId: toNullableString(row.associated_debt_account_id),
    notes: toNullableString(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function resolveLocationLabelByIds(database: Database.Database, warehouseId?: string | null, projectId?: string | null) {
  if (warehouseId) {
    const row = database.prepare('SELECT name FROM warehouse WHERE id = ?').get(warehouseId) as SqliteRow | undefined
    return row ? `المستودع: ${String(row.name)}` : "المستودع"
  }

  if (projectId) {
    const row = database.prepare('SELECT name FROM project WHERE id = ?').get(projectId) as SqliteRow | undefined
    return row ? `المشروع: ${String(row.name)}` : "المشروع"
  }

  return "غير محدد"
}

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
}

export class SqliteInventoryRepository implements InventoryRepository {
  constructor(private readonly database: Database.Database) {
    this.database.pragma("foreign_keys = ON")
  }

  withTransaction<T>(callback: () => T): T {
    return this.database.transaction(callback)()
  }

  listItemDefinitions(filters?: InventoryItemDefinitionListFilters) {
    const conditions: string[] = []
    const params: Array<string | number> = []

    if (filters?.itemType) {
      conditions.push('item_type = ?')
      params.push(filters.itemType)
    }

    if (typeof filters?.isActive === "boolean") {
      conditions.push('is_active = ?')
      params.push(filters.isActive ? 1 : 0)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const rows = this.database
      .prepare(`SELECT * FROM inventory_item_definition ${whereClause} ORDER BY name COLLATE NOCASE ASC, created_at ASC`)
      .all(...params) as SqliteRow[]

    return rows.map(mapItemDefinition)
  }

  getItemDefinitionById(id: string) {
    const row = this.database.prepare('SELECT * FROM inventory_item_definition WHERE id = ?').get(id) as SqliteRow | undefined
    return row ? mapItemDefinition(row) : null
  }

  createItemDefinition(data: InventoryItemDefinitionCreateData, auditContext?: MutationAuditContext) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    const audit = normalizeAuditContext(auditContext)
    this.database.prepare(
      'INSERT INTO inventory_item_definition (id, name, item_type, unit, description, is_active, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, data.name, data.itemType, data.unit ?? null, data.description ?? null, 1, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, timestamp)
    return this.getItemDefinitionById(id)!
  }

  updateItemDefinition(data: InventoryItemDefinitionUpdateData, _auditContext?: MutationAuditContext) {
    const current = this.getItemDefinitionById(data.id)
    if (!current) {
      return null
    }

    const next = {
      name: data.name ?? current.name,
      itemType: data.itemType ?? current.itemType,
      unit: data.unit !== undefined ? data.unit : current.unit,
      description: data.description !== undefined ? data.description : current.description,
      isActive: data.isActive ?? current.isActive,
      updatedAt: createAlgeriaTimestamp(),
    }

    this.database.prepare(
      'UPDATE inventory_item_definition SET name = ?, item_type = ?, unit = ?, description = ?, is_active = ?, updated_at = ? WHERE id = ?',
    ).run(next.name, next.itemType, next.unit ?? null, next.description ?? null, next.isActive ? 1 : 0, next.updatedAt, data.id)

    return this.getItemDefinitionById(data.id)
  }

  warehouseExists(id: string) {
    const row = this.database.prepare('SELECT id FROM warehouse WHERE id = ? LIMIT 1').get(id) as SqliteRow | undefined
    return Boolean(row)
  }

  projectExists(id: string) {
    const row = this.database.prepare('SELECT id FROM project WHERE id = ? LIMIT 1').get(id) as SqliteRow | undefined
    return Boolean(row)
  }

  externalCounterpartyExists(id: string) {
    const row = this.database.prepare('SELECT id FROM external_counterparty WHERE id = ? LIMIT 1').get(id) as SqliteRow | undefined
    return Boolean(row)
  }

  listInvoiceGroups(filters?: InventoryInvoiceGroupListFilters) {
    const conditions: string[] = []
    const params: string[] = []

    if (filters?.warehouseId) {
      conditions.push('warehouse_id = ?')
      params.push(filters.warehouseId)
    }

    if (filters?.projectId) {
      conditions.push('project_id = ?')
      params.push(filters.projectId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const rows = this.database.prepare(
      `SELECT * FROM inventory_invoice_group ${whereClause} ORDER BY COALESCE(invoice_date, created_at) DESC, created_at DESC`,
    ).all(...params) as SqliteRow[]
    return rows.map(mapInvoiceGroup)
  }

  getLatestInvoiceNumber() {
    const row = this.database.prepare(
      "SELECT invoice_number FROM inventory_invoice_group WHERE invoice_number IS NOT NULL AND invoice_number LIKE 'IN-%' ORDER BY created_at DESC LIMIT 1",
    ).get() as SqliteRow | undefined

    return row ? toNullableString(row.invoice_number) : null
  }

  getInvoiceGroupById(id: string) {
    const row = this.database.prepare('SELECT * FROM inventory_invoice_group WHERE id = ?').get(id) as SqliteRow | undefined
    return row ? mapInvoiceGroup(row) : null
  }

  createInvoiceGroup(data: InventoryInvoiceGroupCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.database.prepare(
      'INSERT INTO inventory_invoice_group (id, invoice_number, supplier_name, invoice_date, warehouse_id, project_id, external_counterparty_id, gross_total_dzd, paid_amount_dzd, remaining_debt_dzd, debt_account_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, data.invoiceNumber ?? null, data.supplierName ?? null, data.invoiceDate ?? null, data.warehouseId ?? null, data.projectId ?? null, data.externalCounterpartyId ?? null, data.grossTotalDzd ?? 0, data.paidAmountDzd ?? 0, data.remainingDebtDzd ?? 0, data.debtAccountId ?? null, data.note ?? null, timestamp, timestamp)
    return this.getInvoiceGroupById(id)!
  }

  listEntriesByInvoiceGroupId(invoiceGroupId: string) {
    const assetRows = this.database.prepare(
      'SELECT * FROM inventory_asset_unit WHERE inventory_entry_id IN (SELECT id FROM inventory_entry WHERE invoice_group_id = ?) ORDER BY created_at ASC',
    ).all(invoiceGroupId) as SqliteRow[]
    const assetsByEntryId = new Map<string, InventoryAssetUnitRecord[]>()

    for (const row of assetRows) {
      const asset = mapAssetUnit(row)
      const existing = assetsByEntryId.get(asset.inventoryEntryId)
      if (existing) {
        existing.push(asset)
      } else {
        assetsByEntryId.set(asset.inventoryEntryId, [asset])
      }
    }

    const rows = this.database.prepare(
      'SELECT * FROM inventory_entry WHERE invoice_group_id = ? ORDER BY created_at ASC',
    ).all(invoiceGroupId) as SqliteRow[]

    return rows.map((row) => mapEntry(row, assetsByEntryId.get(String(row.id)) ?? []))
  }

  getEntryById(id: string) {
    const row = this.database.prepare('SELECT * FROM inventory_entry WHERE id = ?').get(id) as SqliteRow | undefined
    if (!row) {
      return null
    }

    const assets = (this.database.prepare('SELECT * FROM inventory_asset_unit WHERE inventory_entry_id = ? ORDER BY created_at ASC').all(id) as SqliteRow[]).map(mapAssetUnit)
    return mapEntry(row, assets)
  }

  createEntry(data: InventoryEntryCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.database.prepare(
      'INSERT INTO inventory_entry (id, invoice_group_id, item_definition_id, warehouse_id, project_id, item_type, item_name, unit, quantity, unit_price_dzd, total_price_dzd, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      data.invoiceGroupId,
      data.itemDefinitionId,
      data.warehouseId ?? null,
      data.projectId ?? null,
      data.itemType,
      data.itemName,
      data.unit ?? null,
      data.quantity,
      data.unitPriceDzd ?? null,
      data.totalPriceDzd,
      data.note ?? null,
      timestamp,
      timestamp,
    )

    return this.listEntriesByInvoiceGroupId(data.invoiceGroupId).find((entry) => entry.id === id)!
  }

  createAssetUnit(data: InventoryAssetUnitCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.database.prepare(
      'INSERT INTO inventory_asset_unit (id, inventory_entry_id, asset_name, asset_tag, serial_number, condition, purchase_date, purchase_price_dzd, current_warehouse_id, current_project_id, current_location_label, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      data.inventoryEntryId,
      data.assetName,
      data.assetTag ?? null,
      data.serialNumber ?? null,
      data.condition ?? null,
      data.purchaseDate ?? null,
      data.purchasePriceDzd,
      data.currentWarehouseId ?? null,
      data.currentProjectId ?? null,
      resolveLocationLabelByIds(this.database, data.currentWarehouseId, data.currentProjectId),
      data.note ?? null,
      timestamp,
      timestamp,
    )
    const row = this.database.prepare('SELECT * FROM inventory_asset_unit WHERE id = ?').get(id) as SqliteRow
    return mapAssetUnit(row)
  }

  getAssetUnitById(id: string) {
    const row = this.database.prepare('SELECT * FROM inventory_asset_unit WHERE id = ?').get(id) as SqliteRow | undefined
    return row ? mapAssetUnit(row) : null
  }

  updateAssetUnitLocation(id: string, location: { currentWarehouseId?: string | null; currentProjectId?: string | null; currentLocationLabel?: string | null }) {
    this.database.prepare(
      'UPDATE inventory_asset_unit SET current_warehouse_id = ?, current_project_id = ?, current_location_label = ?, updated_at = ? WHERE id = ?',
    ).run(location.currentWarehouseId ?? null, location.currentProjectId ?? null, location.currentLocationLabel ?? resolveLocationLabelByIds(this.database, location.currentWarehouseId, location.currentProjectId), createAlgeriaTimestamp(), id)
    return this.getAssetUnitById(id)
  }

  listAssetUnitsByLocation(filters: { warehouseId?: string; projectId?: string }) {
    const rows = this.database.prepare(
      `SELECT * FROM inventory_asset_unit WHERE ${filters.warehouseId ? 'current_warehouse_id = ?' : 'current_project_id = ?'} ORDER BY updated_at DESC`,
    ).all(filters.warehouseId ?? filters.projectId ?? "") as SqliteRow[]
    return rows.map(mapAssetUnit)
  }

  createConsumableBalance(data: InventoryConsumableBalanceCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.database.prepare(
      'INSERT INTO inventory_consumable_balance (id, inventory_entry_id, item_definition_id, warehouse_id, project_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, data.inventoryEntryId, data.itemDefinitionId, data.warehouseId ?? null, data.projectId ?? null, data.quantity, timestamp, timestamp)
    return this.getConsumableBalanceByEntryAndLocation({ inventoryEntryId: data.inventoryEntryId, warehouseId: data.warehouseId, projectId: data.projectId })!
  }

  listConsumableBalancesByInvoiceGroupId(invoiceGroupId: string) {
    const rows = this.database.prepare(
      `SELECT b.*, e.item_name AS item_name, COALESCE('المستودع: ' || w.name, 'المشروع: ' || p.name, 'غير محدد') AS location_label
       FROM inventory_consumable_balance b
       INNER JOIN inventory_entry e ON e.id = b.inventory_entry_id
       LEFT JOIN warehouse w ON w.id = b.warehouse_id
       LEFT JOIN project p ON p.id = b.project_id
       WHERE b.inventory_entry_id IN (SELECT id FROM inventory_entry WHERE invoice_group_id = ?) AND b.quantity > 0
       ORDER BY b.updated_at DESC`,
    ).all(invoiceGroupId) as SqliteRow[]
    return rows.map(mapConsumableBalance)
  }

  listConsumableBalancesByLocation(filters: { warehouseId?: string; projectId?: string }) {
    const rows = this.database.prepare(
      `SELECT b.*, e.item_name AS item_name, COALESCE('المستودع: ' || w.name, 'المشروع: ' || p.name, 'غير محدد') AS location_label
       FROM inventory_consumable_balance b
       INNER JOIN inventory_entry e ON e.id = b.inventory_entry_id
       LEFT JOIN warehouse w ON w.id = b.warehouse_id
       LEFT JOIN project p ON p.id = b.project_id
       WHERE ${filters.warehouseId ? 'b.warehouse_id = ?' : 'b.project_id = ?'} AND b.quantity > 0
       ORDER BY b.updated_at DESC`,
    ).all(filters.warehouseId ?? filters.projectId ?? "") as SqliteRow[]
    return rows.map(mapConsumableBalance)
  }

  getConsumableBalanceByEntryAndLocation(filters: { inventoryEntryId: string; warehouseId?: string | null; projectId?: string | null }) {
    const row = this.database.prepare(
      `SELECT b.*, e.item_name AS item_name, COALESCE('المستودع: ' || w.name, 'المشروع: ' || p.name, 'غير محدد') AS location_label
       FROM inventory_consumable_balance b
       INNER JOIN inventory_entry e ON e.id = b.inventory_entry_id
       LEFT JOIN warehouse w ON w.id = b.warehouse_id
       LEFT JOIN project p ON p.id = b.project_id
       WHERE b.inventory_entry_id = ? AND ${filters.warehouseId ? 'b.warehouse_id = ? AND b.project_id IS NULL' : 'b.project_id = ? AND b.warehouse_id IS NULL'} LIMIT 1`,
    ).get(filters.inventoryEntryId, filters.warehouseId ?? filters.projectId ?? "") as SqliteRow | undefined
    return row ? mapConsumableBalance(row) : null
  }

  updateConsumableBalanceQuantity(id: string, quantity: number) {
    this.database.prepare('UPDATE inventory_consumable_balance SET quantity = ?, updated_at = ? WHERE id = ?').run(quantity, createAlgeriaTimestamp(), id)
  }

  deleteConsumableBalance(id: string) {
    this.database.prepare('DELETE FROM inventory_consumable_balance WHERE id = ?').run(id)
  }

  createMovement(data: InventoryMovementCreateData) {
    const id = crypto.randomUUID()
    const createdAt = createAlgeriaTimestamp()
    this.database.prepare(
      'INSERT INTO inventory_movement (id, movement_type, item_type, inventory_entry_id, asset_unit_id, quantity, from_warehouse_id, from_project_id, to_warehouse_id, to_project_id, note, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, data.movementType, data.itemType, data.inventoryEntryId ?? null, data.assetUnitId ?? null, data.quantity, data.fromWarehouseId ?? null, data.fromProjectId ?? null, data.toWarehouseId ?? null, data.toProjectId ?? null, data.note ?? null, data.occurredAt, createdAt)
    const row = this.database.prepare('SELECT * FROM inventory_movement WHERE id = ?').get(id) as SqliteRow
    return mapMovement(row)
  }

  listMovementsByInvoiceGroupId(invoiceGroupId: string) {
    const rows = this.database.prepare('SELECT * FROM inventory_movement WHERE inventory_entry_id IN (SELECT id FROM inventory_entry WHERE invoice_group_id = ?) ORDER BY occurred_at DESC, created_at DESC').all(invoiceGroupId) as SqliteRow[]
    return rows.map(mapMovement)
  }

  listMovementsByAssetUnitId(assetUnitId: string) {
    const rows = this.database.prepare('SELECT * FROM inventory_movement WHERE asset_unit_id = ? ORDER BY occurred_at DESC, created_at DESC').all(assetUnitId) as SqliteRow[]
    return rows.map(mapMovement)
  }

  listAttachmentsByInvoiceGroupId(invoiceGroupId: string) {
    const rows = this.database.prepare(
      'SELECT * FROM inventory_invoice_attachment WHERE invoice_group_id = ? ORDER BY created_at DESC',
    ).all(invoiceGroupId) as SqliteRow[]
    return rows.map(mapAttachment)
  }

  createAttachment(data: InventoryInvoiceAttachmentCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    this.database.prepare(
      'INSERT INTO inventory_invoice_attachment (id, invoice_group_id, original_name, mime_type, byte_size, storage_key, relative_path, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      data.invoiceGroupId,
      data.originalName,
      data.mimeType,
      data.byteSize,
      data.storageKey,
      data.relativePath,
      data.sha256 ?? null,
      timestamp,
    )
    return this.getAttachmentById(id)!
  }

  getAttachmentById(id: string) {
    const row = this.database.prepare('SELECT * FROM inventory_invoice_attachment WHERE id = ?').get(id) as SqliteRow | undefined
    return row ? mapAttachment(row) : null
  }

  updateInvoiceGroupPayment(id: string, paidAmountDzd: number, remainingDebtDzd: number, _auditContext?: MutationAuditContext) {
    const timestamp = createAlgeriaTimestamp()
    this.database.prepare(
      'UPDATE inventory_invoice_group SET paid_amount_dzd = ?, remaining_debt_dzd = ?, updated_at = ? WHERE id = ?',
    ).run(paidAmountDzd, remainingDebtDzd, timestamp, id)
    return this.getInvoiceGroupById(id)
  }

  createOutboundTransfer(data: InventoryOutboundTransferCreateData, auditContext?: MutationAuditContext) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    const audit = normalizeAuditContext(auditContext)
    this.database.prepare(
      'INSERT INTO inventory_outbound_transfer (id, transfer_date, from_type, from_id, counterparty_id, transfer_type, status, associated_debt_account_id, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      timestamp,
      data.fromType,
      data.fromId,
      data.counterpartyId,
      data.transferType,
      "COMPLETED",
      data.associatedDebtAccountId ?? null,
      data.notes ?? null,
      audit.actorUserId,
      audit.actorLabel,
      audit.transactionId,
      timestamp,
      timestamp,
    )

    for (const item of data.items) {
      const itemId = crypto.randomUUID()
      this.database.prepare(
        'INSERT INTO inventory_outbound_transfer_item (id, transfer_id, item_id, quantity, unit_price_dzd, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(itemId, id, item.itemId, item.quantity, item.unitPriceDzd ?? null, timestamp)
    }

    return this.getOutboundTransferById(id)!
  }

  listOutboundTransfers() {
    const rows = this.database.prepare('SELECT * FROM inventory_outbound_transfer ORDER BY transfer_date DESC, created_at DESC').all() as SqliteRow[]
    return rows.map(mapOutboundTransfer)
  }

  getOutboundTransferById(id: string) {
    const row = this.database.prepare('SELECT * FROM inventory_outbound_transfer WHERE id = ?').get(id) as SqliteRow | undefined
    return row ? mapOutboundTransfer(row) : null
  }
}

export function createInventoryRepository(database?: Database.Database) {
  if (database) {
    return new SqliteInventoryRepository(database)
  }

  const { databasePath } = resolveDatabaseEnv()
  mkdirSync(dirname(databasePath), { recursive: true })
  return new SqliteInventoryRepository(new Database(databasePath))
}
