import { oc } from "@orpc/contract"

import {
  createDeleteResultSchema,
  createEntityResultSchema,
  createListSchema,
  idInputSchema,
} from "./core"
import {
  inventoryAssetDetailSchema,
  inventoryAssetTransferInputSchema,
  inventoryConsumableTransferInputSchema,
  inventoryInvoiceGroupCreateInputSchema,
  inventoryInvoiceGroupDetailSchema,
  inventoryInvoiceGroupListInputSchema,
  inventoryInvoiceGroupSchema,
  inventoryInvoiceGroupRecordPaymentInputSchema,
  inventoryItemDefinitionCreateInputSchema,
  inventoryItemDefinitionListInputSchema,
  inventoryItemDefinitionSchema,
  inventoryItemDefinitionUpdateInputSchema,
  inventoryLocationContentsInputSchema,
  inventoryLocationContentsSchema,
  inventoryMovementSchema,
  inventoryOutboundTransferCreateInputSchema,
  inventoryOutboundTransferSchema,
  inventoryTransferHistoryInputSchema,
} from "./inventory"

/** Inventory RPC contract defining all inventory API procedures. */
export const inventoryContract = {
  /** inventoryItemDefinitionsList procedure. */
  inventoryItemDefinitionsList: oc
    .input(inventoryItemDefinitionListInputSchema)
    .output(createListSchema(inventoryItemDefinitionSchema)),
  /** inventoryItemDefinitionsGet procedure. */
  inventoryItemDefinitionsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(inventoryItemDefinitionSchema)),
  /** inventoryItemDefinitionsCreate procedure. */
  inventoryItemDefinitionsCreate: oc
    .input(inventoryItemDefinitionCreateInputSchema)
    .output(createEntityResultSchema(inventoryItemDefinitionSchema)),
  /** inventoryItemDefinitionsUpdate procedure. */
  inventoryItemDefinitionsUpdate: oc
    .input(inventoryItemDefinitionUpdateInputSchema)
    .output(createEntityResultSchema(inventoryItemDefinitionSchema)),
  /** inventoryInvoiceGroupsList procedure. */
  inventoryInvoiceGroupsList: oc
    .input(inventoryInvoiceGroupListInputSchema)
    .output(createListSchema(inventoryInvoiceGroupSchema)),
  /** inventoryInvoiceGroupsGet procedure. */
  inventoryInvoiceGroupsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupDetailSchema)),
  /** inventoryInvoiceGroupsCreate procedure. */
  inventoryInvoiceGroupsCreate: oc
    .input(inventoryInvoiceGroupCreateInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupDetailSchema)),
  /** inventoryReceive procedure. */
  inventoryReceive: oc
    .input(inventoryInvoiceGroupCreateInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupDetailSchema)),
  /** inventoryLocationContentsGet procedure. */
  inventoryLocationContentsGet: oc
    .input(inventoryLocationContentsInputSchema)
    .output(createEntityResultSchema(inventoryLocationContentsSchema)),
  /** inventoryAssetsGet procedure. */
  inventoryAssetsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(inventoryAssetDetailSchema)),
  /** inventoryAssetsTransfer procedure. */
  inventoryAssetsTransfer: oc
    .input(inventoryAssetTransferInputSchema)
    .output(createEntityResultSchema(inventoryAssetDetailSchema)),
  /** inventoryConsumablesTransfer procedure. */
  inventoryConsumablesTransfer: oc
    .input(inventoryConsumableTransferInputSchema)
    .output(createEntityResultSchema(inventoryLocationContentsSchema)),
  /** inventoryInvoiceGroupsRecordPayment procedure. */
  inventoryInvoiceGroupsRecordPayment: oc
    .input(inventoryInvoiceGroupRecordPaymentInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupSchema)),
  /** inventoryOutboundTransfersList procedure. */
  inventoryOutboundTransfersList: oc
    .input(inventoryLocationContentsInputSchema.optional())
    .output(createListSchema(inventoryOutboundTransferSchema)),
  /** inventoryOutboundTransfersCreate procedure. */
  inventoryOutboundTransfersCreate: oc
    .input(inventoryOutboundTransferCreateInputSchema)
    .output(createEntityResultSchema(inventoryOutboundTransferSchema)),
  /** inventoryTransferHistoryList procedure. */
  inventoryTransferHistoryList: oc
    .input(inventoryTransferHistoryInputSchema)
    .output(createListSchema(inventoryMovementSchema)),
} as const

export type InventoryContract = typeof inventoryContract
