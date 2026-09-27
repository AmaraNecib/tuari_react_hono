/** Inventory RPC handler registrations. */
import { implement } from "@orpc/server";

import type {
  InventoryAssetChargeUpdateInput,
  InventoryAssetChargeVoidInput,
  InventoryInvoiceGroupCreateInput,
  InventoryInvoiceGroupRecordPaymentInput,
  InventoryItemDefinitionCreateInput,
  InventoryItemDefinitionUpdateInput,
  InventoryOutboundTransferCreateInput,
  InventoryTransferHistoryInput,
} from "@tuari/contracts";

import { toFailureResult as toInventoryFailureResult } from "../../modules/inventory/inventory.errors";
import type { InventoryService } from "../../modules/inventory/inventory.service";
import type { RpcMiddleware } from "../rpc-middleware";
import type {
  IdInput,
  InventoryAssetChargeDefaultInput,
  InventoryAssetChargesListByProjectInput,
  InventoryAssetChargesListByUnitInput,
  InventoryAssetTransferInput,
  InventoryConsumableTransferInput,
  InventoryInvoiceGroupListInput,
  InventoryItemDefinitionListInput,
  InventoryLocationContentsInput,
} from "./handler-inputs";

/** createInventoryHandlers. */
export function createInventoryHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  inventoryService: InventoryService,
) {
  return {
    inventoryItemDefinitionsList: os.inventoryItemDefinitionsList.handler(m.queryAuth(async ({ input }) =>
      inventoryService.listItemDefinitions(input as InventoryItemDefinitionListInput)
    )),
    inventoryItemDefinitionsGet: os.inventoryItemDefinitionsGet.handler(m.queryAuth(async ({ input }) =>
      inventoryService.getItemDefinition((input as IdInput).id)
    )),
    inventoryItemDefinitionsCreate: os.inventoryItemDefinitionsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.createItemDefinition(input as InventoryItemDefinitionCreateInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryItemDefinitionsUpdate: os.inventoryItemDefinitionsUpdate.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.updateItemDefinition(input as InventoryItemDefinitionUpdateInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryInvoiceGroupsList: os.inventoryInvoiceGroupsList.handler(m.queryAuth(async ({ input }) =>
      inventoryService.listInvoiceGroups(input as InventoryInvoiceGroupListInput)
    )),
    inventoryInvoiceGroupsGet: os.inventoryInvoiceGroupsGet.handler(m.queryAuth(async ({ input }) =>
      inventoryService.getInvoiceGroup((input as IdInput).id)
    )),
    inventoryInvoiceGroupsCreate: os.inventoryInvoiceGroupsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.createInvoiceGroup(input as InventoryInvoiceGroupCreateInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryReceive: os.inventoryReceive.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.receiveInventory(input as InventoryInvoiceGroupCreateInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryLocationContentsGet: os.inventoryLocationContentsGet.handler(m.queryAuth(async ({ input }) =>
      inventoryService.getLocationContents(input as InventoryLocationContentsInput)
    )),
    inventoryAssetsGet: os.inventoryAssetsGet.handler(m.queryAuth(async ({ input }) =>
      inventoryService.getAsset((input as IdInput).id)
    )),
    inventoryAssetsTransfer: os.inventoryAssetsTransfer.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.transferAsset(input as InventoryAssetTransferInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryAssetChargeDefault: os.inventoryAssetChargeDefault.handler(m.queryAuth(async ({ input }) =>
      inventoryService.getAssetChargeDefault(input as InventoryAssetChargeDefaultInput)
    )),
    inventoryAssetChargesListByUnit: os.inventoryAssetChargesListByUnit.handler(m.queryAuth(async ({ input }) =>
      inventoryService.listAssetChargesByUnit(input as InventoryAssetChargesListByUnitInput)
    )),
    inventoryAssetChargesListByProject: os.inventoryAssetChargesListByProject.handler(m.queryAuth(async ({ input }) =>
      inventoryService.getProjectCharges(input as InventoryAssetChargesListByProjectInput)
    )),
    inventoryAssetChargesUpdate: os.inventoryAssetChargesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.updateAssetCharge(input as InventoryAssetChargeUpdateInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryAssetChargesVoid: os.inventoryAssetChargesVoid.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.voidAssetCharge(input as InventoryAssetChargeVoidInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryConsumablesTransfer: os.inventoryConsumablesTransfer.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.transferConsumable(input as InventoryConsumableTransferInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryInvoiceGroupsRecordPayment: os.inventoryInvoiceGroupsRecordPayment.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.recordInvoicePayment(input as InventoryInvoiceGroupRecordPaymentInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryOutboundTransfersList: os.inventoryOutboundTransfersList.handler(m.queryAuth(async () =>
      ({ items: inventoryService.listOutboundTransfers() })
    )),
    inventoryOutboundTransfersCreate: os.inventoryOutboundTransfersCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => inventoryService.createOutboundTransfer(input as InventoryOutboundTransferCreateInput, auditContext),
      toInventoryFailureResult,
    )),
    inventoryTransferHistoryList: os.inventoryTransferHistoryList.handler(m.queryAuth(async ({ input }) =>
      inventoryService.listTransferHistory(input as InventoryTransferHistoryInput)
    )),
  };
}
