import type {
  InventoryAssetDetail,
  InventoryItemOfferFilter,
  InventoryAssetUnit,
  InventoryConsumableBalance,
  InventoryInvoiceAttachment,
  InventoryInvoiceGroup,
  InventoryInvoiceGroupDetail,
  InventoryItemDefinition,
  InventoryLocationContents,
  InventoryMovement,
  InventoryEntry,
  InventoryOutboundTransfer,
  OutboundTransferItemInput,
} from "@tuari/contracts"

/** InventoryItemDefinitionRecord. */
export type InventoryItemDefinitionRecord = InventoryItemDefinition
/** InventoryInvoiceAttachmentRecord. */
export type InventoryInvoiceAttachmentRecord = InventoryInvoiceAttachment
/** InventoryInvoiceGroupRecord. */
export type InventoryInvoiceGroupRecord = InventoryInvoiceGroup
/** InventoryEntryRecord. */
export type InventoryEntryRecord = InventoryEntry
/** InventoryAssetUnitRecord. */
export type InventoryAssetUnitRecord = InventoryAssetUnit
/** InventoryConsumableBalanceRecord. */
export type InventoryConsumableBalanceRecord = InventoryConsumableBalance
/** InventoryMovementRecord. */
export type InventoryMovementRecord = InventoryMovement
/** InventoryAssetDetailRecord. */
export type InventoryAssetDetailRecord = InventoryAssetDetail
/** InventoryLocationContentsRecord. */
export type InventoryLocationContentsRecord = InventoryLocationContents
/** InventoryInvoiceGroupDetailRecord. */
export type InventoryInvoiceGroupDetailRecord = InventoryInvoiceGroupDetail

/** InventoryItemDefinitionListFilters. */
export type InventoryItemDefinitionListFilters = {
  itemType?: InventoryItemDefinition["itemType"]
  isActive?: boolean
}

/** Query for the usage-scoped, keyset-paged item-option read. */
export type InventoryItemDefinitionPageQuery = {
  filter: InventoryItemOfferFilter
  search?: string
  cursor?: string
  limit: number
}

/** One page of item-definition options plus the total match count. */
export type InventoryItemDefinitionPage = {
  items: InventoryItemDefinitionRecord[]
  total: number
  nextCursor: string | null
  /** True when a stale cursor (different filter/search) was ignored. */
  cursorReset: boolean
}

/** InventoryInvoiceGroupListFilters. */
export type InventoryInvoiceGroupListFilters = {
  warehouseId?: string
  projectId?: string
}

/** InventoryItemDefinitionCreateData. */
export type InventoryItemDefinitionCreateData = {
  name: string
  itemType: InventoryItemDefinition["itemType"]
  unit?: string | null
  description?: string | null
}

/** InventoryItemDefinitionUpdateData. */
export type InventoryItemDefinitionUpdateData = {
  id: string
  name?: string
  itemType?: InventoryItemDefinition["itemType"]
  unit?: string | null
  description?: string | null
  isActive?: boolean
}

/** InventoryInvoiceGroupCreateData. */
export type InventoryInvoiceGroupCreateData = {
  invoiceNumber?: string | null
  supplierName?: string | null
  invoiceDate?: string | null
  warehouseId?: string | null
  projectId?: string | null
  externalCounterpartyId?: string | null
  grossTotalDzd?: number
  paidAmountDzd?: number
  remainingDebtDzd?: number
  debtAccountId?: string | null
  note?: string | null
}

/** InventoryEntryCreateData. */
export type InventoryEntryCreateData = {
  invoiceGroupId: string
  itemDefinitionId: string
  warehouseId?: string | null
  projectId?: string | null
  itemType: InventoryEntry["itemType"]
  itemName: string
  unit?: string | null
  quantity: number
  unitPriceDzd?: number | null
  totalPriceDzd: number
  note?: string | null
}

/** InventoryAssetUnitCreateData. */
export type InventoryAssetUnitCreateData = {
  inventoryEntryId: string
  assetName: string
  assetTag?: string | null
  serialNumber?: string | null
  condition?: InventoryAssetUnit["condition"]
  purchaseDate?: string | null
  purchasePriceDzd: number
  currentWarehouseId?: string | null
  currentProjectId?: string | null
  note?: string | null
}

/** InventoryConsumableBalanceCreateData. */
export type InventoryConsumableBalanceCreateData = {
  inventoryEntryId: string
  itemDefinitionId: string
  warehouseId?: string | null
  projectId?: string | null
  quantity: number
}

/** InventoryMovementCreateData. */
export type InventoryMovementCreateData = {
  movementType: InventoryMovement["movementType"]
  itemType: InventoryMovement["itemType"]
  inventoryEntryId?: string | null
  assetUnitId?: string | null
  quantity: number
  fromWarehouseId?: string | null
  fromProjectId?: string | null
  toWarehouseId?: string | null
  toProjectId?: string | null
  note?: string | null
  occurredAt: string
}

/** InventoryInvoiceAttachmentCreateData. */
export type InventoryInvoiceAttachmentCreateData = {
  invoiceGroupId: string
  originalName: string
  mimeType: string
  byteSize: number
  storageKey: string
  relativePath: string
  sha256?: string | null
}

/** InventoryStoredUpload. */
export type InventoryStoredUpload = {
  id: string
  originalName: string
  mimeType: string
  byteSize: number
  storageKey: string
  relativePath: string
  sha256: string
}

/**
 * InventoryUploadFile.
 *
 * `bytes` is a LAZY loader: the service only invokes it after its count /
 * total-size / per-file-size / MIME validation passes for a file that will
 * actually be stored. The transport hands over file metadata + a way to read
 * the bytes without buffering them, so over-limit requests are rejected
 * before any byte-array copy is allocated (issue #214 — buffering is owned by
 * the module, not the transport).
 */
export type InventoryUploadFile = {
  name: string
  type: string
  size: number
  bytes: () => Promise<Uint8Array>
}

/** InventoryOutboundTransferRecord. */
export type InventoryOutboundTransferRecord = InventoryOutboundTransfer
/** OutboundTransferItemRecord. */
export type OutboundTransferItemRecord = OutboundTransferItemInput & { id: string; createdAt: string }

/**
 * Flat valuation row for the INVENTORY report — an inventory entry joined with
 * its invoice-group document date and a resolved location label. Aggregated by
 * the InventoryService report generator; produced by the repository in one
 * query (avoiding N+1 entry lookups per invoice group).
 */
export type InventoryValuationRow = {
  /** Inventory entry id. */
  id: string
  itemType: InventoryEntry["itemType"]
  itemName: string
  quantity: number
  /** Unit price when the entry captured one (nullable per the contract). */
  unitPriceDzd: number | null
  totalPriceDzd: number
  lastUpdated: string
  /** Window + aging basis: invoice date (or entry creation when unset). */
  documentDate: string
  /** Warehouse or project id the entry was received into (null when unlocated). */
  locationId: string | null
  /** Location kind — disambiguates warehouse/project id namespaces in grouping. */
  locationType: "WAREHOUSE" | "PROJECT" | null
  locationLabel: string
}

/**
 * Movement row for the MOVEMENT report — inventory movement joined with the
 * unit price of the linked entry (null when the movement has no entry link,
 * e.g. asset outbound sales). Value is derived as quantity × unit price.
 */
export type InventoryMovementValuationRow = {
  movement: InventoryMovementRecord
  unitPriceDzd: number | null
}

/** InventoryOutboundTransferCreateData. */
export type InventoryOutboundTransferCreateData = {
  fromType: InventoryOutboundTransfer["fromType"]
  fromId: string
  counterpartyId: string
  transferType: InventoryOutboundTransfer["transferType"]
  items: Array<{
    itemId: string
    quantity: number
    unitPriceDzd?: number
  }>
  associatedDebtAccountId?: string | null
  notes?: string | null
}
