import { implement, ORPCError } from "@orpc/server";
import { z, ZodError } from "zod";
import {
  exactInventoryContract, exactInventoryDetailSchema, exactInventoryInvoiceSchema, exactInventoryAssetSchema, exactInventoryLocationSchema, exactInventoryOutboundSchema, exactInventoryChargeSchema,
  type ExactInventoryInvoiceInput, type ExactInventoryPayment, type ExactInventoryAssetTransfer, type ExactInventoryConsumableTransfer,
  type ExactInventoryOutboundInput, type ExactInventoryChargeUpdate, type ExactInventoryChargeVoid,
} from "@tuari/contracts";
import { FifoLockBusyError } from "../infrastructure/database/fifo-lock";
import { ExactDebtError } from "../modules/company/exact-finance.service";
import type { ExactInventoryService } from "../modules/inventory/inventory-exact.service";
import type { RpcContext } from "./context";
import type { RpcMiddleware, MutationAuditContext } from "./rpc-middleware";
function resolveError(error: unknown): unknown {
  if (error instanceof ExactDebtError) return new ORPCError(error.code, { message: error.message });
  if (error instanceof ZodError || error instanceof RangeError) return new ORPCError("BAD_REQUEST", { message: "Invalid exact inventory input" });
  if (error instanceof FifoLockBusyError || (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE_BUSY"))) return new ORPCError("CONFLICT", { message: "Inventory transaction is busy. Retry the same request." });
  return error;
}
/** Explicit exact composition only. No active numeric router import. */
export function createExactInventoryRouter(service: ExactInventoryService, middleware: RpcMiddleware) {
  const os = implement(exactInventoryContract).$context<RpcContext>();
  function audited<Input, Output>(schema: z.ZodType<Output>, action: (input: Input, audit: MutationAuditContext) => Output) {
    const handler = middleware.mutationAudit(({ input, auditContext }: { context: RpcContext; input: Input; auditContext: MutationAuditContext }) => action(input, auditContext), resolveError);
    return async (params: { context: RpcContext; input: Input }) => schema.parse(await handler(params));
  }
  return os.router({
    definitions: os.definitions.handler(middleware.queryAuth(async () => service.listDefinitions(), resolveError)),
    listInvoices: os.listInvoices.handler(middleware.queryAuth(async () => service.listInvoiceGroups(), resolveError)),
    getInvoice: os.getInvoice.handler(middleware.queryAuth(async ({ input }) => service.getInvoiceGroup(input.id), resolveError)),
    listOutbounds: os.listOutbounds.handler(middleware.queryAuth(async () => service.listOutboundTransfers(), resolveError)),
    getOutbound: os.getOutbound.handler(middleware.queryAuth(async ({ input }) => service.getOutboundTransfer(input.id), resolveError)),
    locationContents: os.locationContents.handler(middleware.queryAuth(async ({ input }) => service.getLocationContents(input), resolveError)),
    chargeDefault: os.chargeDefault.handler(middleware.queryAuth(async ({ input }) => service.getAssetChargeDefault(input.assetUnitId), resolveError)),
    projectCharges: os.projectCharges.handler(middleware.queryAuth(async ({ input }) => service.getProjectCharges(input.projectId), resolveError)),
    projectContribution: os.projectContribution.handler(middleware.queryAuth(async ({ input }) => service.getProjectContribution(input.projectId), resolveError)),
    createInvoice: os.createInvoice.handler(audited(exactInventoryDetailSchema, (input: ExactInventoryInvoiceInput, audit) => service.createInvoiceGroup({ ...input, ...audit }))),
    recordPayment: os.recordPayment.handler(audited(exactInventoryInvoiceSchema, (input: ExactInventoryPayment, audit) => service.recordInvoicePayment({ ...input, ...audit }))),
    transferAsset: os.transferAsset.handler(audited(exactInventoryAssetSchema, (input: ExactInventoryAssetTransfer, audit) => service.transferAsset({ ...input, ...audit }))),
    transferConsumable: os.transferConsumable.handler(audited(exactInventoryLocationSchema, (input: ExactInventoryConsumableTransfer, audit) => service.transferConsumable({ ...input, ...audit }))),
    createOutbound: os.createOutbound.handler(audited(exactInventoryOutboundSchema, (input: ExactInventoryOutboundInput, audit) => service.createOutboundTransfer({ ...input, ...audit }))),
    updateCharge: os.updateCharge.handler(audited(exactInventoryChargeSchema, (input: ExactInventoryChargeUpdate, audit) => service.updateAssetCharge({ ...input, ...audit }))),
    voidCharge: os.voidCharge.handler(audited(exactInventoryChargeSchema, (input: ExactInventoryChargeVoid, audit) => service.voidAssetCharge({ ...input, ...audit }))),
  });
}
