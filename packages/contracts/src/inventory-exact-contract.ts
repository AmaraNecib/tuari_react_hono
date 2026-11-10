import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";
import { entityIdSchema } from "./core";
import {
  exactInventoryInvoiceCreateSchema, exactInventoryInvoiceSchema, exactInventoryDetailSchema, exactInventoryPaymentSchema,
  exactInventoryAssetTransferSchema, exactInventoryConsumableTransferSchema, exactInventoryLocationInputSchema, exactInventoryLocationSchema,
  exactInventoryOutboundCreateSchema, exactInventoryOutboundSchema, exactInventoryOutboundViewSchema, exactInventoryOutboundPaymentSchema, exactInventoryAssetSchema, exactInventoryChargeSchema,
  exactInventoryChargeUpdateSchema, exactInventoryChargeVoidSchema, exactInventoryProjectContributionSchema,
  exactInventoryProjectChargesSchema, exactInventoryChargeDefaultSchema, exactInventoryDefinitionsSchema,
} from "./inventory-exact";
const id = z.object({ id: entityIdSchema });
/** Standalone opt-in contract. Does not activate numeric inventory routes. */
export const exactInventoryContract = {
  definitions: oc.output(exactInventoryDefinitionsSchema),
  listInvoices: oc.output(z.array(exactInventoryInvoiceSchema)),
  getInvoice: oc.input(id).output(exactInventoryDetailSchema),
  createInvoice: oc.input(exactInventoryInvoiceCreateSchema).output(exactInventoryDetailSchema),
  recordPayment: oc.input(exactInventoryPaymentSchema).output(exactInventoryInvoiceSchema),
  locationContents: oc.input(exactInventoryLocationInputSchema).output(exactInventoryLocationSchema),
  transferAsset: oc.input(exactInventoryAssetTransferSchema).output(exactInventoryAssetSchema),
  transferConsumable: oc.input(exactInventoryConsumableTransferSchema).output(exactInventoryLocationSchema),
  listOutbounds: oc.output(z.array(exactInventoryOutboundViewSchema)),
  getOutbound: oc.input(id).output(exactInventoryOutboundViewSchema),
  recordOutboundPayment: oc.input(exactInventoryOutboundPaymentSchema).output(exactInventoryOutboundViewSchema),
  createOutbound: oc.input(exactInventoryOutboundCreateSchema).output(exactInventoryOutboundSchema),
  chargeDefault: oc.input(z.object({ assetUnitId: entityIdSchema })).output(exactInventoryChargeDefaultSchema),
  projectCharges: oc.input(z.object({ projectId: entityIdSchema })).output(exactInventoryProjectChargesSchema),
  projectContribution: oc.input(z.object({ projectId: entityIdSchema })).output(exactInventoryProjectContributionSchema),
  updateCharge: oc.input(exactInventoryChargeUpdateSchema).output(exactInventoryChargeSchema),
  voidCharge: oc.input(exactInventoryChargeVoidSchema).output(exactInventoryChargeSchema),
} as const;
export type ExactInventoryClient = ContractRouterClient<typeof exactInventoryContract>;
