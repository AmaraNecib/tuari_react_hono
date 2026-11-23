import { oc } from "@orpc/contract"
import { z } from "zod"

import {
  createDeleteResultSchema,
  createEntityResultSchema,
  createListSchema,
  cursorPaginationInputSchema,
  idInputSchema,
  paginatedResultSchema,
} from "./core"
import { inventoryItemUsageSchema } from "./inventory-item-usage"
import {
  inventoryAssetChargeDefaultInputSchema,
  inventoryAssetChargeDefaultSchema,
  inventoryAssetChargeDetailSchema,
  inventoryAssetChargeSchema,
  inventoryAssetChargesListByProjectInputSchema,
  inventoryAssetChargesListByUnitInputSchema,
  inventoryAssetChargeUpdateInputSchema,
  inventoryAssetChargeVoidInputSchema,
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
  inventoryItemDefinitionOptionSchema,
  inventoryItemDefinitionSchema,
  inventoryItemDefinitionUpdateInputSchema,
  inventoryLocationContentsInputSchema,
  inventoryLocationContentsSchema,
  inventoryMovementSchema,
  inventoryOutboundTransferCreateInputSchema,
  inventoryOutboundTransferSchema,
  inventoryProjectChargesSchema,
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
  /**
   * inventoryItemDefinitionOptions procedure.
   *
   * The paged, usage-scoped read for pickers. Separate from
   * `inventoryItemDefinitionsList` (unpaged) because the catalog page, the
   * global search index and the home-view expense selector all depend on the
   * full unpaged read.
   */
  inventoryItemDefinitionOptions: oc
    .input(
      cursorPaginationInputSchema.extend({
        usage: inventoryItemUsageSchema,
        search: z.string().trim().max(160).optional(),
      }),
    )
    .output(paginatedResultSchema(inventoryItemDefinitionOptionSchema)),
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
  /** inventoryAssetChargeDefault procedure — resolve the prefill for a placement. */
  inventoryAssetChargeDefault: oc
    .input(inventoryAssetChargeDefaultInputSchema)
    .output(createEntityResultSchema(inventoryAssetChargeDefaultSchema)),
  /** inventoryAssetChargesListByUnit procedure. */
  inventoryAssetChargesListByUnit: oc
    .input(inventoryAssetChargesListByUnitInputSchema)
    .output(createListSchema(inventoryAssetChargeDetailSchema)),
  /** inventoryAssetChargesListByProject procedure — charges + project total. */
  inventoryAssetChargesListByProject: oc
    .input(inventoryAssetChargesListByProjectInputSchema)
    .output(createEntityResultSchema(inventoryProjectChargesSchema)),
  /** inventoryAssetChargesUpdate procedure — correct a past charge. */
  inventoryAssetChargesUpdate: oc
    .input(inventoryAssetChargeUpdateInputSchema)
    .output(createEntityResultSchema(inventoryAssetChargeDetailSchema)),
  /** inventoryAssetChargesVoid procedure — void a past charge, keeping history. */
  inventoryAssetChargesVoid: oc
    .input(inventoryAssetChargeVoidInputSchema)
    .output(createEntityResultSchema(inventoryAssetChargeDetailSchema)),
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
