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

export const inventoryContract = {
  inventoryItemDefinitionsList: oc
    .input(inventoryItemDefinitionListInputSchema)
    .output(createListSchema(inventoryItemDefinitionSchema)),
  inventoryItemDefinitionsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(inventoryItemDefinitionSchema)),
  inventoryItemDefinitionsCreate: oc
    .input(inventoryItemDefinitionCreateInputSchema)
    .output(createEntityResultSchema(inventoryItemDefinitionSchema)),
  inventoryItemDefinitionsUpdate: oc
    .input(inventoryItemDefinitionUpdateInputSchema)
    .output(createEntityResultSchema(inventoryItemDefinitionSchema)),
  inventoryInvoiceGroupsList: oc
    .input(inventoryInvoiceGroupListInputSchema)
    .output(createListSchema(inventoryInvoiceGroupSchema)),
  inventoryInvoiceGroupsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupDetailSchema)),
  inventoryInvoiceGroupsCreate: oc
    .input(inventoryInvoiceGroupCreateInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupDetailSchema)),
  inventoryReceive: oc
    .input(inventoryInvoiceGroupCreateInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupDetailSchema)),
  inventoryLocationContentsGet: oc
    .input(inventoryLocationContentsInputSchema)
    .output(createEntityResultSchema(inventoryLocationContentsSchema)),
  inventoryAssetsGet: oc
    .input(idInputSchema)
    .output(createEntityResultSchema(inventoryAssetDetailSchema)),
  inventoryAssetsTransfer: oc
    .input(inventoryAssetTransferInputSchema)
    .output(createEntityResultSchema(inventoryAssetDetailSchema)),
  inventoryConsumablesTransfer: oc
    .input(inventoryConsumableTransferInputSchema)
    .output(createEntityResultSchema(inventoryLocationContentsSchema)),
  inventoryInvoiceGroupsRecordPayment: oc
    .input(inventoryInvoiceGroupRecordPaymentInputSchema)
    .output(createEntityResultSchema(inventoryInvoiceGroupSchema)),
  inventoryOutboundTransfersList: oc
    .input(inventoryLocationContentsInputSchema.optional())
    .output(createListSchema(inventoryOutboundTransferSchema)),
  inventoryOutboundTransfersCreate: oc
    .input(inventoryOutboundTransferCreateInputSchema)
    .output(createEntityResultSchema(inventoryOutboundTransferSchema)),
  inventoryTransferHistoryList: oc
    .input(inventoryTransferHistoryInputSchema)
    .output(createListSchema(inventoryMovementSchema)),
} as const

export type InventoryContract = typeof inventoryContract
