import type {
  InventoryAssetDetail,
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

/** InventoryUploadFile. */
export type InventoryUploadFile = {
  name: string
  type: string
  size: number
  bytes: Uint8Array
}

/** InventoryOutboundTransferRecord. */
export type InventoryOutboundTransferRecord = InventoryOutboundTransfer
/** OutboundTransferItemRecord. */
export type OutboundTransferItemRecord = OutboundTransferItemInput & { id: string; createdAt: string }

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
