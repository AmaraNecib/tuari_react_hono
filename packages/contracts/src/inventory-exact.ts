import { z } from "zod";
import { Money, UnitPrice, Quantity, parseExactLine } from "./exact-money";
import {
  inventoryAssetUnitCreateInputSchema, inventoryAssetEntryCreateInputSchema, inventoryConsumableBalanceSchema, inventoryMovementSchema, inventoryItemDefinitionSchema,
  inventoryConsumableEntryCreateInputSchema, inventoryInvoiceGroupCreateInputSchema,
  inventoryInvoiceGroupSchema, inventoryAssetUnitSchema, inventoryAssetChargeSchema,
  inventoryAssetChargeRevisionSchema, inventoryEntrySchema,
  inventoryOutboundTransferCreateInputSchema, outboundTransferItemInputSchema,
  inventoryAssetTransferInputSchema, inventoryConsumableTransferInputSchema, inventoryOutboundTransferSchema, inventoryAssetChargeUpdateInputSchema,
  inventoryAssetChargeVoidInputSchema, inventoryInvoiceGroupRecordPaymentInputSchema,
} from "./inventory";

/** Separate opt-in transport. No numeric monetary input is accepted. */
export const exactInventoryMoneySchema = z.string().max(96).transform((value, ctx) => {
  try {
    const amount = Money.parse(value);
    if (amount.compare(Money.parse("0")) < 0) throw new RangeError("Negative inventory amount");
    return amount.toWire();
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a nonnegative DZD amount with at most two decimal places within int64 bounds." });
    return z.NEVER;
  }
});
export const exactInventoryPriceSchema = z.string().max(96).transform((value, ctx) => {
  try {
    const price = UnitPrice.parse(value);
    if (price.toWire().startsWith("-")) throw new RangeError("Negative inventory price");
    return price.toWire();
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a nonnegative DZD unit price with at most four decimal places within int64 bounds." });
    return z.NEVER;
  }
});
/** Source operands, not a rounded monetary line cache. Inventory quantities remain independent. */
export const exactInventoryLineSchema = z.unknown().transform((value, ctx) => {
  try {
    const line = parseExactLine(value);
    const source = line.source;
    const quantity = Quantity.inventory(source.quantity).toWire();
    if (quantity === "0" || quantity.startsWith("-")) throw new RangeError("Quantity must be positive");
    if (source.mode === "derived-price") Quantity.inventory(source.originalQuantity);
    if ((source.mode === "unit-price" ? source.price : source.total).startsWith("-")) throw new RangeError("Negative valuation");
    return line.toJSON();
  } catch {
    ctx.addIssue({ code: "custom", message: "Expected exact inventory valuation operands and six-place quantities." });
    return z.NEVER;
  }
});
const command = { requestId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/), currency: z.literal("DZD").default("DZD") };
const exactAssetInput = inventoryAssetUnitCreateInputSchema.extend({ purchasePriceDzd: exactInventoryMoneySchema });
const exactConsumableInput = z.object({ ...inventoryConsumableEntryCreateInputSchema.shape,
  unitPriceDzd: exactInventoryPriceSchema.optional(),
  priceSource: exactInventoryLineSchema.optional(),
  // The server derives exact products. A client cannot supply a rounded competing total.
  totalPriceDzd: z.never().optional(),
}).superRefine((input, ctx) => {
  if (input.warehouseId && input.projectId) ctx.addIssue({ code: "custom", message: "Choose one destination", path: ["warehouseId"] });
  if ((input.unitPriceDzd !== undefined) === (input.priceSource !== undefined)) ctx.addIssue({ code: "custom", message: "Choose entered price or explicit agreed source, not both", path: ["priceSource"] });
  if (input.priceSource?.mode === "derived-price") ctx.addIssue({ code: "custom", message: "A purchase line requires its own entered price or agreed total", path: ["priceSource"] });
});
const exactAssetEntryInput = z.object({ ...inventoryAssetEntryCreateInputSchema.shape, assets: z.array(exactAssetInput).min(1).max(10000) }).superRefine((input, ctx) => {
  if (input.warehouseId && input.projectId) ctx.addIssue({ code: "custom", message: "Choose one destination", path: ["warehouseId"] });
});
export const exactInventoryInvoiceCreateSchema = z.object({ ...inventoryInvoiceGroupCreateInputSchema.shape,
  ...command, paidAmountDzd: exactInventoryMoneySchema.nullable().optional(),
  entries: z.array(z.discriminatedUnion("kind", [exactConsumableInput, exactAssetEntryInput])).min(1).max(10000),
}).superRefine((input, ctx) => {
  if (input.warehouseId && input.projectId) ctx.addIssue({ code: "custom", message: "Choose one default destination", path: ["warehouseId"] });
  if (input.createDebt && !input.externalCounterpartyId) ctx.addIssue({ code: "custom", message: "Debt requires an external counterparty", path: ["externalCounterpartyId"] });
  if (input.createDebt && !input.paymentInputType) ctx.addIssue({ code: "custom", message: "Choose first-payment input mode", path: ["paymentInputType"] });
  if (!input.createDebt && (input.paidAmountDzd != null || input.paidPercent != null || input.paymentInputType)) ctx.addIssue({ code: "custom", message: "Payment metadata requires debt mode", path: ["createDebt"] });
});

export const exactInventoryAssetSchema = inventoryAssetUnitSchema.extend({ purchasePriceDzd: exactInventoryMoneySchema });
export const exactInventoryEntrySchema = inventoryEntrySchema.omit({ unitPriceDzd: true, totalPriceDzd: true, assets: true }).extend({
  unitPriceDzd: exactInventoryPriceSchema.nullable(),
  priceSource: exactInventoryLineSchema,
  assets: z.array(exactInventoryAssetSchema),
});
export const exactInventoryInvoiceSchema = inventoryInvoiceGroupSchema.extend({
  currency: z.literal("DZD"), grossTotalDzd: exactInventoryMoneySchema,
  paidAmountDzd: exactInventoryMoneySchema, remainingDebtDzd: exactInventoryMoneySchema,
  debtEntryId: z.string().min(1).nullable(),
});
export const exactInventoryChargeRevisionSchema = inventoryAssetChargeRevisionSchema.extend({
  previousAmountDzd: exactInventoryMoneySchema, newAmountDzd: exactInventoryMoneySchema.nullable(),
  revisionSequence: z.number().int().positive().max(100000), transactionId: z.string().nullable(),
});
export const exactInventoryChargeSchema = inventoryAssetChargeSchema.extend({
  amountDzd: exactInventoryMoneySchema, revisions: z.array(exactInventoryChargeRevisionSchema),
  placementSequence: z.number().int().positive().max(100000), voidedBy: z.string().nullable(),
});
export const exactInventoryOutboundCreateSchema = inventoryOutboundTransferCreateInputSchema.extend({
  ...command,
  items: z.array(outboundTransferItemInputSchema.extend({
    unitPriceDzd: exactInventoryPriceSchema.optional(),
    derivedPrice: z.object({ total: exactInventoryMoneySchema, originalQuantity: z.string().max(96) }).optional(),
  }).superRefine((item, ctx) => {
    if (item.unitPriceDzd !== undefined && item.derivedPrice !== undefined) ctx.addIssue({ code: "custom", message: "Choose entered or derived price, not both", path: ["unitPriceDzd"] });
    if (item.derivedPrice) {
      try { if (Quantity.inventory(item.derivedPrice.originalQuantity).toWire().startsWith("-") || Quantity.inventory(item.derivedPrice.originalQuantity).toWire() === "0") throw new Error("quantity"); }
      catch { ctx.addIssue({ code: "custom", message: "Derived price requires a positive six-place original quantity", path: ["derivedPrice"] }); }
    }
  })).min(1).max(10000),
  debtAmountDzd: exactInventoryMoneySchema.optional(), firstPaymentAmountDzd: exactInventoryMoneySchema.optional(),
});
export const exactInventoryOutboundItemSchema = z.object({
  id: z.string().min(1), itemId: z.string().min(1), optionId: z.string().min(1).nullable(), quantity: z.number().positive(),
  unitPriceDzd: exactInventoryPriceSchema.nullable(), priceSource: exactInventoryLineSchema.nullable(), createdAt: z.string().datetime(),
});
export const exactInventoryOutboundSchema = inventoryOutboundTransferSchema.extend({
  currency: z.literal("DZD"), debtEntryId: z.string().min(1).nullable(), initialPaymentEntryId: z.string().min(1).nullable(),
  actorUserId: z.string().nullable(), actorLabel: z.string().nullable(), transactionId: z.string().nullable(),
  items: z.array(exactInventoryOutboundItemSchema),
});
export const exactInventoryConsumableTransferSchema = inventoryConsumableTransferInputSchema.safeExtend(command);
export const exactInventoryPaymentSchema = inventoryInvoiceGroupRecordPaymentInputSchema.extend({
  ...command, amountDzd: exactInventoryMoneySchema.refine(value => value !== "0.00", "Payment must be positive"),
});
export const exactInventoryOutboundPaymentSchema = exactInventoryPaymentSchema.omit({ invoiceGroupId: true }).extend({ transferId: z.string().min(1) });
export const exactInventoryOutboundViewSchema = exactInventoryOutboundSchema.extend({ remainingDebtDzd: exactInventoryMoneySchema });
export const exactInventoryAssetTransferSchema = z.object({ ...inventoryAssetTransferInputSchema.shape,
  ...command, chargeAmountDzd: exactInventoryMoneySchema.nullable().optional(),
}).superRefine((input, ctx) => {
  if (Boolean(input.toWarehouseId) === Boolean(input.toProjectId)) ctx.addIssue({ code: "custom", message: "Choose exactly one transfer destination", path: ["toWarehouseId"] });
});
export const exactInventoryChargeUpdateSchema = inventoryAssetChargeUpdateInputSchema.extend({ ...command, amountDzd: exactInventoryMoneySchema });
export const exactInventoryChargeVoidSchema = inventoryAssetChargeVoidInputSchema.extend(command);

export const exactInventoryLocationInputSchema = z.object({ warehouseId: z.string().min(1).nullable().optional(), projectId: z.string().min(1).nullable().optional() }).superRefine((input, ctx) => {
  if (Boolean(input.warehouseId) === Boolean(input.projectId)) ctx.addIssue({ code: "custom", message: "Choose exactly one location" });
});
export const exactInventoryLocationSchema = z.object({ assets: z.array(exactInventoryAssetSchema), consumables: z.array(inventoryConsumableBalanceSchema) });
export const exactInventoryDetailSchema = z.object({ group: exactInventoryInvoiceSchema, entries: z.array(exactInventoryEntrySchema),
  consumableBalances: z.array(inventoryConsumableBalanceSchema), movements: z.array(inventoryMovementSchema) });
const aggregateAmount = z.string().max(256).regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/);
export const exactInventoryProjectContributionSchema = z.object({ projectId: z.string().min(1), chargedMaterialsDzd: aggregateAmount, equipmentChargesDzd: aggregateAmount,
  totalDzd: aggregateAmount, parkedAssetValueDzd: aggregateAmount, parkedAssets: z.array(exactInventoryAssetSchema), materialMovements: z.array(inventoryMovementSchema) });
export const exactInventoryProjectChargesSchema = z.object({ projectId: z.string().min(1), totalDzd: aggregateAmount, charges: z.array(exactInventoryChargeSchema) });
export const exactInventoryChargeDefaultSchema = z.object({ assetUnitId: z.string().min(1), amountDzd: exactInventoryMoneySchema, purchasePriceDzd: exactInventoryMoneySchema, source: z.enum(["LAST_CHARGE", "PURCHASE_PRICE"]) });
export const exactInventoryDefinitionsSchema = z.array(inventoryItemDefinitionSchema);
export type ExactInventoryInvoiceInput = z.input<typeof exactInventoryInvoiceCreateSchema>;
export type ExactInventoryInvoice = z.infer<typeof exactInventoryInvoiceSchema>;
export type ExactInventoryEntry = z.infer<typeof exactInventoryEntrySchema>;
export type ExactInventoryAsset = z.infer<typeof exactInventoryAssetSchema>;
export type ExactInventoryCharge = z.infer<typeof exactInventoryChargeSchema>;
export type ExactInventoryOutboundInput = z.input<typeof exactInventoryOutboundCreateSchema>;
export type ExactInventoryOutbound = z.infer<typeof exactInventoryOutboundSchema>;
export type ExactInventoryAssetTransfer = z.input<typeof exactInventoryAssetTransferSchema>;
export type ExactInventoryConsumableTransfer = z.input<typeof exactInventoryConsumableTransferSchema>;
export type ExactInventoryPayment = z.input<typeof exactInventoryPaymentSchema>;
export type ExactInventoryOutboundPayment = z.input<typeof exactInventoryOutboundPaymentSchema>;
export type ExactInventoryOutboundView = z.infer<typeof exactInventoryOutboundViewSchema>;
export type ExactInventoryChargeUpdate = z.input<typeof exactInventoryChargeUpdateSchema>;
export type ExactInventoryChargeVoid = z.input<typeof exactInventoryChargeVoidSchema>;
