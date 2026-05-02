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

export type InventoryItemDefinitionRecord = InventoryItemDefinition
export type InventoryInvoiceAttachmentRecord = InventoryInvoiceAttachment
export type InventoryInvoiceGroupRecord = InventoryInvoiceGroup
export type InventoryEntryRecord = InventoryEntry
export type InventoryAssetUnitRecord = InventoryAssetUnit
export type InventoryConsumableBalanceRecord = InventoryConsumableBalance
export type InventoryMovementRecord = InventoryMovement
export type InventoryAssetDetailRecord = InventoryAssetDetail
export type InventoryLocationContentsRecord = InventoryLocationContents
export type InventoryInvoiceGroupDetailRecord = InventoryInvoiceGroupDetail

export type InventoryItemDefinitionListFilters = {
  itemType?: InventoryItemDefinition["itemType"]
  isActive?: boolean
}

export type InventoryInvoiceGroupListFilters = {
  warehouseId?: string
  projectId?: string
}

export type InventoryItemDefinitionCreateData = {
  name: string
  itemType: InventoryItemDefinition["itemType"]
  unit?: string | null
  description?: string | null
}

export type InventoryItemDefinitionUpdateData = {
  id: string
  name?: string
  itemType?: InventoryItemDefinition["itemType"]
  unit?: string | null
  description?: string | null
  isActive?: boolean
}

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

export type InventoryConsumableBalanceCreateData = {
  inventoryEntryId: string
  itemDefinitionId: string
  warehouseId?: string | null
  projectId?: string | null
  quantity: number
}

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

export type InventoryInvoiceAttachmentCreateData = {
  invoiceGroupId: string
  originalName: string
  mimeType: string
  byteSize: number
  storageKey: string
  relativePath: string
  sha256?: string | null
}

export type InventoryStoredUpload = {
  id: string
  originalName: string
  mimeType: string
  byteSize: number
  storageKey: string
  relativePath: string
  sha256: string
}

export type InventoryUploadFile = {
  name: string
  type: string
  size: number
  bytes: Uint8Array
}

export type InventoryOutboundTransferRecord = InventoryOutboundTransfer
export type OutboundTransferItemRecord = OutboundTransferItemInput & { id: string; createdAt: string }

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
