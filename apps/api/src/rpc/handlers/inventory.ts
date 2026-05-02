import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult as toInventoryFailureResult } from "../../modules/inventory/inventory.errors";
import type { InventoryService } from "../../modules/inventory/inventory.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createInventoryHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  inventoryService: InventoryService,
): Record<string, any> {
  return {
    inventoryItemDefinitionsList: os.inventoryItemDefinitionsList.handler(m.queryAuth(async ({ context, input }: any) =>
      inventoryService.listItemDefinitions(input ?? undefined)
    )),
    inventoryItemDefinitionsGet: os.inventoryItemDefinitionsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      inventoryService.getItemDefinition((input as any).id)
    )),
    inventoryItemDefinitionsCreate: os.inventoryItemDefinitionsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => inventoryService.createItemDefinition(input as any, auditContext),
      toInventoryFailureResult,
    )),
    inventoryItemDefinitionsUpdate: os.inventoryItemDefinitionsUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => inventoryService.updateItemDefinition(input as any, auditContext),
      toInventoryFailureResult,
    )),
    inventoryInvoiceGroupsList: os.inventoryInvoiceGroupsList.handler(m.queryAuth(async ({ context, input }: any) =>
      inventoryService.listInvoiceGroups(input ?? undefined)
    )),
    inventoryInvoiceGroupsGet: os.inventoryInvoiceGroupsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      inventoryService.getInvoiceGroup((input as any).id)
    )),
    inventoryInvoiceGroupsCreate: os.inventoryInvoiceGroupsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => inventoryService.createInvoiceGroup(input as any, auditContext),
      toInventoryFailureResult,
    )),
    inventoryReceive: os.inventoryReceive.handler(m.mutationAudit(
      ({ input, auditContext }: any) => inventoryService.receiveInventory(input as any, auditContext),
      toInventoryFailureResult,
    )),
    inventoryLocationContentsGet: os.inventoryLocationContentsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      inventoryService.getLocationContents(input as any)
    )),
    inventoryAssetsGet: os.inventoryAssetsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      inventoryService.getAsset((input as any).id)
    )),
    inventoryAssetsTransfer: os.inventoryAssetsTransfer.handler(m.mutationAudit(
      ({ input, auditContext }: any) => inventoryService.transferAsset(input as any, auditContext),
      toInventoryFailureResult,
    )),
    inventoryConsumablesTransfer: os.inventoryConsumablesTransfer.handler(m.mutationAudit(
      ({ input, auditContext }: any) => inventoryService.transferConsumable(input as any, auditContext),
      toInventoryFailureResult,
    )),
  };
}
