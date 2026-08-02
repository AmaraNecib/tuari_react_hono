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
// Repository interface (port)
// ---------------------------------------------------------------------------

/**
 * InventoryRepository — persistence interface for inventory data access.
 *
 * Port & adapter split (issue #193): the Drizzle/SQLite implementation lives in
 * adapters/sqlite-inventory.repository.ts.
 */
export interface InventoryRepository {
  /** withTransaction. */
  withTransaction<T>(callback: () => T): T
  /** listItemDefinitions. */
  listItemDefinitions(filters?: InventoryItemDefinitionListFilters): InventoryItemDefinitionRecord[]
  /** getItemDefinitionById. */
  getItemDefinitionById(id: string): InventoryItemDefinitionRecord | null
  /** createItemDefinition. */
  createItemDefinition(data: InventoryItemDefinitionCreateData, auditContext?: MutationAuditContext): InventoryItemDefinitionRecord
  /** updateItemDefinition. */
  updateItemDefinition(data: InventoryItemDefinitionUpdateData, auditContext?: MutationAuditContext): InventoryItemDefinitionRecord | null
  /** warehouseExists. */
  warehouseExists(id: string): boolean
  /** projectExists. */
  projectExists(id: string): boolean
  /** externalCounterpartyExists. */
  externalCounterpartyExists(id: string): boolean
  /** listInvoiceGroups. */
  listInvoiceGroups(filters?: InventoryInvoiceGroupListFilters): InventoryInvoiceGroupRecord[]
  /** getLatestInvoiceNumber. */
  getLatestInvoiceNumber(): string | null
  /** getInvoiceGroupById. */
  getInvoiceGroupById(id: string): InventoryInvoiceGroupRecord | null
  /** createInvoiceGroup. */
  createInvoiceGroup(data: InventoryInvoiceGroupCreateData): InventoryInvoiceGroupRecord
  /** listEntriesByInvoiceGroupId. */
  listEntriesByInvoiceGroupId(invoiceGroupId: string): InventoryEntryRecord[]
  /** createEntry. */
  createEntry(data: InventoryEntryCreateData): InventoryEntryRecord
  /** getEntryById. */
  getEntryById(id: string): InventoryEntryRecord | null
  /** createAssetUnit. */
  createAssetUnit(data: InventoryAssetUnitCreateData): InventoryAssetUnitRecord
  /** getAssetUnitById. */
  getAssetUnitById(id: string): InventoryAssetUnitRecord | null
  /** updateAssetUnitLocation. */
  updateAssetUnitLocation(id: string, location: { currentWarehouseId?: string | null; currentProjectId?: string | null; currentLocationLabel?: string | null }): InventoryAssetUnitRecord | null
  /** listAssetUnitsByLocation. */
  listAssetUnitsByLocation(filters: { warehouseId?: string; projectId?: string }): InventoryAssetUnitRecord[]
  /** createConsumableBalance. */
  createConsumableBalance(data: InventoryConsumableBalanceCreateData): InventoryConsumableBalanceRecord
  /** listConsumableBalancesByInvoiceGroupId. */
  listConsumableBalancesByInvoiceGroupId(invoiceGroupId: string): InventoryConsumableBalanceRecord[]
  /** listConsumableBalancesByLocation. */
  listConsumableBalancesByLocation(filters: { warehouseId?: string; projectId?: string }): InventoryConsumableBalanceRecord[]
  /** getConsumableBalanceByEntryAndLocation. */
  getConsumableBalanceByEntryAndLocation(filters: { inventoryEntryId: string; warehouseId?: string | null; projectId?: string | null }): InventoryConsumableBalanceRecord | null
  /** updateConsumableBalanceQuantity. */
  updateConsumableBalanceQuantity(id: string, quantity: number): void
  /** deleteConsumableBalance. */
  deleteConsumableBalance(id: string): void
  /** createMovement. */
  createMovement(data: InventoryMovementCreateData): InventoryMovementRecord
  /** listMovementsByInvoiceGroupId. */
  listMovementsByInvoiceGroupId(invoiceGroupId: string): InventoryMovementRecord[]
  /** listMovementsByAssetUnitId. */
  listMovementsByAssetUnitId(assetUnitId: string): InventoryMovementRecord[]
  /** listAttachmentsByInvoiceGroupId. */
  listAttachmentsByInvoiceGroupId(invoiceGroupId: string): InventoryInvoiceAttachmentRecord[]
  /** createAttachment. */
  createAttachment(data: InventoryInvoiceAttachmentCreateData): InventoryInvoiceAttachmentRecord
  /** getAttachmentById. */
  getAttachmentById(id: string): InventoryInvoiceAttachmentRecord | null
  /** updateInvoiceGroupPayment. */
  updateInvoiceGroupPayment(id: string, paidAmountDzd: number, remainingDebtDzd: number, auditContext?: MutationAuditContext): InventoryInvoiceGroupRecord | null
  /** createOutboundTransfer. */
  createOutboundTransfer(data: InventoryOutboundTransferCreateData, auditContext?: MutationAuditContext): InventoryOutboundTransferRecord
  /** listOutboundTransfers. */
  listOutboundTransfers(): InventoryOutboundTransferRecord[]
  /** getOutboundTransferById. */
  getOutboundTransferById(id: string): InventoryOutboundTransferRecord | null
  /** listMovementsByLocation. */
  listMovementsByLocation(input: { warehouseId?: string; projectId?: string; dateFrom?: string; dateTo?: string; movementType?: string; limit?: number }): InventoryMovementRecord[]
  /** listAllMovements. */
  listAllMovements(input: { dateFrom?: string; dateTo?: string; movementType?: string; limit?: number }): InventoryMovementRecord[]
}
