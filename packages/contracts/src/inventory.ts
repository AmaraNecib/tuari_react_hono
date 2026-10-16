import { z } from "zod";

import {
  entityIdSchema,
  inventoryAssetConditionSchema,
  inventoryItemTypeSchema,
  inventoryMovementTypeSchema,
  inventoryPaymentInputTypeSchema,
  nullableTextSchema,
  timestampSchema,
} from "./core";
import { nonNegativePaymentAmountSchema, storedMoneyDzdSchema } from "./payment";

/** inventoryItemDefinitionSchema - Item definition schema. */
export const inventoryItemDefinitionSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(160),
  itemType: inventoryItemTypeSchema,
  unit: nullableTextSchema,
  description: nullableTextSchema,
  isActive: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/**
 * inventoryItemDefinitionOptionSchema - what the paged item picker returns.
 *
 * The picker needs the definition's `name` and `unit` (to label the option and
 * default an asset's name), so it is the full definition read shape.
 */
export const inventoryItemDefinitionOptionSchema = inventoryItemDefinitionSchema;

/** inventoryInvoiceAttachmentSchema - Invoice attachment schema. */
export const inventoryInvoiceAttachmentSchema = z.object({
  id: entityIdSchema,
  invoiceGroupId: entityIdSchema,
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(160),
  byteSize: z.number().int().nonnegative(),
  storageKey: z.string().trim().min(1).max(255),
  relativePath: z.string().trim().min(1).max(500),
  downloadUrl: z.string().trim().min(1).max(500),
  sha256: nullableTextSchema,
  createdAt: timestampSchema,
});

/**
 * inventoryAssetUnitSchema - Asset unit schema.
 *
 * Also a RESPONSE shape (asset detail, invoice detail, location contents,
 * entry lists). `purchasePriceDzd` therefore uses the permissive stored-money
 * schema: the invoice INPUT gate caps a new price at `MAX_MONEY_DZD`, but a
 * row stored before that gate existed can be larger, and reading it back must
 * not fail (#413 round 3).
 */
export const inventoryAssetUnitSchema = z.object({
  id: entityIdSchema,
  inventoryEntryId: entityIdSchema,
  assetName: z.string().trim().min(1).max(160),
  assetTag: nullableTextSchema,
  serialNumber: nullableTextSchema,
  condition: inventoryAssetConditionSchema.nullable(),
  purchaseDate: timestampSchema.nullable(),
  purchasePriceDzd: storedMoneyDzdSchema,
  currentWarehouseId: entityIdSchema.nullable(),
  currentProjectId: entityIdSchema.nullable(),
  currentLocationLabel: nullableTextSchema,
  note: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** inventoryConsumableBalanceSchema - Consumable balance schema. */
export const inventoryConsumableBalanceSchema = z.object({
  id: entityIdSchema,
  inventoryEntryId: entityIdSchema,
  itemDefinitionId: entityIdSchema,
  itemName: z.string().trim().min(1).max(160),
  warehouseId: entityIdSchema.nullable(),
  projectId: entityIdSchema.nullable(),
  quantity: z.number().positive(),
  locationLabel: z.string().trim().min(1).max(160),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** inventoryMovementSchema - Movement schema. */
export const inventoryMovementSchema = z.object({
  id: entityIdSchema,
  movementType: inventoryMovementTypeSchema,
  itemType: inventoryItemTypeSchema,
  inventoryEntryId: entityIdSchema.nullable(),
  assetUnitId: entityIdSchema.nullable(),
  quantity: z.number().positive(),
  fromWarehouseId: entityIdSchema.nullable(),
  fromProjectId: entityIdSchema.nullable(),
  toWarehouseId: entityIdSchema.nullable(),
  toProjectId: entityIdSchema.nullable(),
  note: nullableTextSchema,
  occurredAt: timestampSchema,
  createdAt: timestampSchema,
});

/** inventoryAssetChargeRevisionSchema - A recorded correction or void of a charge. */
export const inventoryAssetChargeRevisionSchema = z.object({
  id: entityIdSchema,
  chargeId: entityIdSchema,
  previousAmountDzd: storedMoneyDzdSchema,
  /** `null` records a void; a number records a corrected amount. */
  newAmountDzd: storedMoneyDzdSchema.nullable(),
  reason: nullableTextSchema,
  actorUserId: entityIdSchema.nullable(),
  actorLabel: nullableTextSchema,
  createdAt: timestampSchema,
});

/** inventoryAssetChargeSchema - A charge for a unit's placement on a project. */
export const inventoryAssetChargeSchema = z.object({
  id: entityIdSchema,
  assetUnitId: entityIdSchema,
  projectId: entityIdSchema,
  /** Project display name when the adapter can resolve it. */
  projectName: nullableTextSchema,
  /** The transfer movement that created this placement (null for legacy rows). */
  movementId: entityIdSchema.nullable(),
  amountDzd: storedMoneyDzdSchema,
  status: z.enum(["LIVE", "VOID"]),
  voidedAt: timestampSchema.nullable(),
  voidReason: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** inventoryAssetChargeDetailSchema - charge plus its correction history. */
export const inventoryAssetChargeDetailSchema = inventoryAssetChargeSchema.extend({
  revisions: z.array(inventoryAssetChargeRevisionSchema),
});

/**
 * inventoryProjectChargesSchema - a project's live charges plus their total.
 *
 * `totalDzd` is COMPUTED at read time, so it keeps the write bound: unlike a
 * single stored double, a sum above `MAX_MONEY_DZD` is no longer exactly
 * representable, and the service refuses to emit it with a typed error rather
 * than return a silently wrong financial number (#422 round 2). The individual
 * charges use the permissive stored shape, so a stored row still reads back.
 */
export const inventoryProjectChargesSchema = z.object({
  projectId: entityIdSchema,
  totalDzd: nonNegativePaymentAmountSchema,
  charges: z.array(inventoryAssetChargeSchema),
});

/**
 * inventoryAssetChargeDefaultSchema - the amount a new placement should
 * prefill: the unit's last charge, else its purchase price.
 */
export const inventoryAssetChargeDefaultSchema = z.object({
  assetUnitId: entityIdSchema,
  /** The amount a placement would USE, so it keeps the write bound. */
  amountDzd: nonNegativePaymentAmountSchema,
  /** The echoed stored price, which may predate the bound. */
  purchasePriceDzd: storedMoneyDzdSchema,
  source: z.enum(["LAST_CHARGE", "PURCHASE_PRICE"]),
});

/** inventoryAssetDetailSchema - Asset detail schema. */
export const inventoryAssetDetailSchema = z.object({
  asset: inventoryAssetUnitSchema,
  invoiceGroup: z.lazy(() => inventoryInvoiceGroupSchema),
  movements: z.array(inventoryMovementSchema),
  charges: z.array(inventoryAssetChargeDetailSchema),
});

/** inventoryLocationContentsSchema - Location contents schema. */
export const inventoryLocationContentsSchema = z.object({
  assets: z.array(inventoryAssetUnitSchema),
  consumables: z.array(inventoryConsumableBalanceSchema),
});

/** inventoryEntrySchema - Entry schema. */
export const inventoryEntrySchema = z.object({
  id: entityIdSchema,
  invoiceGroupId: entityIdSchema,
  itemDefinitionId: entityIdSchema,
  warehouseId: entityIdSchema.nullable(),
  projectId: entityIdSchema.nullable(),
  itemType: inventoryItemTypeSchema,
  itemName: z.string().trim().min(1).max(160),
  unit: nullableTextSchema,
  quantity: z.number().positive(),
  /**
   * Line money is a STORED read shape: the write gate caps a new line at
   * `MAX_MONEY_DZD`, but a row written before that gate existed must still
   * read back (#413 round 3).
   */
  unitPriceDzd: storedMoneyDzdSchema.nullable(),
  totalPriceDzd: storedMoneyDzdSchema,
  note: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  assets: z.array(inventoryAssetUnitSchema),
});

/** inventoryInvoiceGroupSchema - Invoice group schema. */
export const inventoryInvoiceGroupSchema = z.object({
  id: entityIdSchema,
  invoiceNumber: nullableTextSchema,
  supplierName: nullableTextSchema,
  invoiceDate: timestampSchema.nullable(),
  warehouseId: entityIdSchema.nullable(),
  projectId: entityIdSchema.nullable(),
  externalCounterpartyId: entityIdSchema.nullable(),
  /**
   * The invoice header totals are COMPUTED aggregates the service refuses to
   * emit above `MAX_MONEY_DZD` (#429), so they keep the write bound: a total
   * above the safe-integer range is no longer exactly representable, and
   * refusing beats emitting a silently wrong financial number — the same
   * choice `inventoryProjectChargesSchema.totalDzd` makes (#422).
   */
  grossTotalDzd: nonNegativePaymentAmountSchema,
  paidAmountDzd: nonNegativePaymentAmountSchema,
  remainingDebtDzd: nonNegativePaymentAmountSchema,
  debtAccountId: entityIdSchema.nullable(),
  note: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** inventoryInvoiceGroupDetailSchema - Invoice group detail schema. */
export const inventoryInvoiceGroupDetailSchema = z.object({
  group: inventoryInvoiceGroupSchema,
  entries: z.array(inventoryEntrySchema),
  attachments: z.array(inventoryInvoiceAttachmentSchema),
  movements: z.array(inventoryMovementSchema),
  consumableBalances: z.array(inventoryConsumableBalanceSchema),
});

/** inventoryItemDefinitionCreateInputSchema - Item definition create input schema. */
export const inventoryItemDefinitionCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    itemType: inventoryItemTypeSchema,
    unit: z.string().trim().max(60).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    const hasUnit = Boolean(input.unit?.trim())

    if (input.itemType === "CONSUMABLE" && !hasUnit) {
      ctx.addIssue({
        code: "custom",
        message: "يجب إدخال وحدة قياس للمواد الاستهلاكية.",
        path: ["unit"],
      })
    }

    if (input.itemType === "ASSET" && hasUnit) {
      ctx.addIssue({
        code: "custom",
        message: "لا تستخدم وحدة قياس للعناصر المصنفة كأصول.",
        path: ["unit"],
      })
    }
  });

/** inventoryItemDefinitionUpdateInputSchema - Item definition update input schema. */
export const inventoryItemDefinitionUpdateInputSchema = z
  .object({
    id: entityIdSchema,
    name: z.string().trim().min(1).max(160).optional(),
    itemType: inventoryItemTypeSchema.optional(),
    unit: z.string().trim().max(60).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.itemType === "ASSET" && typeof input.unit === "string" && input.unit.trim().length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "لا تستخدم وحدة قياس للعناصر المصنفة كأصول.",
        path: ["unit"],
      })
    }
  });

/** inventoryItemDefinitionListInputSchema - Item definition list input schema. */
export const inventoryItemDefinitionListInputSchema = z
  .object({
    itemType: inventoryItemTypeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

/** inventoryAssetUnitCreateInputSchema - Asset unit create input schema. */
export const inventoryAssetUnitCreateInputSchema = z.object({
  assetName: z.string().trim().min(1).max(160),
  assetTag: z.string().trim().max(120).nullable().optional(),
  serialNumber: z.string().trim().max(160).nullable().optional(),
  condition: inventoryAssetConditionSchema.nullable().optional(),
  purchaseDate: timestampSchema.nullable().optional(),
  purchasePriceDzd: nonNegativePaymentAmountSchema,
  note: z.string().trim().max(1000).nullable().optional(),
});

/** inventoryConsumableEntryCreateInputSchema - Consumable entry create input schema. */
export const inventoryConsumableEntryCreateInputSchema = z.object({
  kind: z.literal("CONSUMABLE"),
  itemDefinitionId: entityIdSchema,
  warehouseId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  quantity: z.number().positive(),
  unitPriceDzd: nonNegativePaymentAmountSchema,
  totalPriceDzd: nonNegativePaymentAmountSchema,
  note: z.string().trim().max(1000).nullable().optional(),
}).superRefine((input, ctx) => {
  if (input.warehouseId && input.projectId) {
    ctx.addIssue({ code: "custom", message: "اختر مستودعًا أو مشروعًا واحدًا فقط.", path: ["warehouseId"] })
  }
});

/** inventoryAssetEntryCreateInputSchema - Asset entry create input schema. */
export const inventoryAssetEntryCreateInputSchema = z.object({
  kind: z.literal("ASSET"),
  itemDefinitionId: entityIdSchema,
  warehouseId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  assets: z.array(inventoryAssetUnitCreateInputSchema).min(1),
  note: z.string().trim().max(1000).nullable().optional(),
}).superRefine((input, ctx) => {
  if (input.warehouseId && input.projectId) {
    ctx.addIssue({ code: "custom", message: "اختر مستودعًا أو مشروعًا واحدًا فقط.", path: ["warehouseId"] })
  }
});

/** inventoryInvoiceEntryCreateInputSchema - Invoice entry create input schema. */
export const inventoryInvoiceEntryCreateInputSchema = z.discriminatedUnion("kind", [
  inventoryConsumableEntryCreateInputSchema,
  inventoryAssetEntryCreateInputSchema,
]);

/** inventoryInvoiceGroupCreateInputSchema - Invoice group create input schema. */
export const inventoryInvoiceGroupCreateInputSchema = z.object({
  invoiceNumber: z.string().trim().max(160).nullable().optional(),
  supplierName: z.string().trim().max(160).nullable().optional(),
  invoiceDate: timestampSchema.nullable().optional(),
  warehouseId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  externalCounterpartyId: entityIdSchema.nullable().optional(),
  createDebt: z.boolean().optional(),
  paymentInputType: inventoryPaymentInputTypeSchema.optional(),
  paidAmountDzd: nonNegativePaymentAmountSchema.nullable().optional(),
  paidPercent: z.number().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  entries: z.array(inventoryInvoiceEntryCreateInputSchema).min(1),
}).superRefine((input, ctx) => {
  if (input.warehouseId && input.projectId) {
    ctx.addIssue({ code: "custom", message: "اختر مستودعًا أو مشروعًا واحدًا فقط كوجهة افتراضية.", path: ["warehouseId"] })
  }

  if (input.createDebt && !input.externalCounterpartyId) {
    ctx.addIssue({ code: "custom", message: "اختر طرفًا خارجيًا عند تسجيل المشتريات كدين.", path: ["externalCounterpartyId"] })
  }

  if (input.createDebt && !input.paymentInputType) {
    ctx.addIssue({ code: "custom", message: "اختر طريقة إدخال الدفعة الأولية للدين.", path: ["paymentInputType"] })
  }

  if (!input.createDebt && (input.paidAmountDzd != null || input.paidPercent != null || input.paymentInputType)) {
    ctx.addIssue({ code: "custom", message: "بيانات الدين لا تُستخدم إلا عند تفعيل خيار الدين.", path: ["createDebt"] })
  }
});

/** inventoryInvoiceGroupListInputSchema - Invoice group list input schema. */
export const inventoryInvoiceGroupListInputSchema = z
  .object({
    warehouseId: entityIdSchema.optional(),
    projectId: entityIdSchema.optional(),
  })
  .optional();

/** inventoryAssetTransferInputSchema - Asset transfer input schema. */
export const inventoryAssetTransferInputSchema = z.object({
  assetUnitId: entityIdSchema,
  toWarehouseId: entityIdSchema.nullable().optional(),
  toProjectId: entityIdSchema.nullable().optional(),
  /**
   * Charge for a project placement. Omitted/null → the server resolves the
   * default (last charge for the unit, else purchase price). An explicit `0`
   * is a free placement. Ignored for warehouse destinations, which never charge.
   */
  chargeAmountDzd: nonNegativePaymentAmountSchema.nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  occurredAt: timestampSchema.optional(),
}).superRefine((input, ctx) => {
  const hasWarehouse = Boolean(input.toWarehouseId)
  const hasProject = Boolean(input.toProjectId)

  if (hasWarehouse === hasProject) {
    ctx.addIssue({ code: "custom", message: "اختر وجهة واحدة فقط للتحويل.", path: ["toWarehouseId"] })
  }
});

/** inventoryAssetChargeDefaultInputSchema - Resolve the prefill for a placement. */
export const inventoryAssetChargeDefaultInputSchema = z.object({
  assetUnitId: entityIdSchema,
});

/** inventoryAssetChargesListByUnitInputSchema - List a unit's charge chain. */
export const inventoryAssetChargesListByUnitInputSchema = z.object({
  assetUnitId: entityIdSchema,
});

/** inventoryAssetChargesListByProjectInputSchema - List a project's charges + total. */
export const inventoryAssetChargesListByProjectInputSchema = z.object({
  projectId: entityIdSchema,
});

/** inventoryAssetChargeUpdateInputSchema - Correct a past charge amount. */
export const inventoryAssetChargeUpdateInputSchema = z.object({
  chargeId: entityIdSchema,
  amountDzd: nonNegativePaymentAmountSchema,
  reason: z.string().trim().max(1000).nullable().optional(),
});

/** inventoryAssetChargeVoidInputSchema - Void a past charge (keeps history). */
export const inventoryAssetChargeVoidInputSchema = z.object({
  chargeId: entityIdSchema,
  reason: z.string().trim().max(1000).nullable().optional(),
});

/** inventoryConsumableTransferInputSchema - Consumable transfer input schema. */
export const inventoryConsumableTransferInputSchema = z.object({
  inventoryEntryId: entityIdSchema,
  quantity: z.number().positive(),
  fromWarehouseId: entityIdSchema.nullable().optional(),
  fromProjectId: entityIdSchema.nullable().optional(),
  toWarehouseId: entityIdSchema.nullable().optional(),
  toProjectId: entityIdSchema.nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  occurredAt: timestampSchema.optional(),
}).superRefine((input, ctx) => {
  const hasFromWarehouse = Boolean(input.fromWarehouseId)
  const hasFromProject = Boolean(input.fromProjectId)
  const hasToWarehouse = Boolean(input.toWarehouseId)
  const hasToProject = Boolean(input.toProjectId)

  if (hasFromWarehouse === hasFromProject) {
    ctx.addIssue({ code: "custom", message: "اختر مصدرًا واحدًا فقط للتحويل.", path: ["fromWarehouseId"] })
  }

  if (hasToWarehouse === hasToProject) {
    ctx.addIssue({ code: "custom", message: "اختر وجهة واحدة فقط للتحويل.", path: ["toWarehouseId"] })
  }
});

/** inventoryLocationContentsInputSchema - Location contents input schema. */
export const inventoryLocationContentsInputSchema = z.object({
  warehouseId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
}).superRefine((input, ctx) => {
  const hasWarehouse = Boolean(input.warehouseId)
  const hasProject = Boolean(input.projectId)

  if (hasWarehouse === hasProject) {
    ctx.addIssue({ code: "custom", message: "اختر مستودعًا أو مشروعًا واحدًا فقط.", path: ["warehouseId"] })
  }
});

/** inventoryInvoiceGroupRecordPaymentInputSchema - Invoice group record payment input schema. */
export const inventoryInvoiceGroupRecordPaymentInputSchema = z.object({
  invoiceGroupId: entityIdSchema,
  amountDzd: z.number().positive(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** outboundTransferItemInputSchema - Outbound transfer item input schema. */
export const outboundTransferItemInputSchema = z.object({
  itemId: entityIdSchema,
  quantity: z.number().positive(),
  unitPriceDzd: z.number().nonnegative().optional(),
});

/** inventoryOutboundTransferCreateInputSchema - Outbound transfer create input schema. */
export const inventoryOutboundTransferCreateInputSchema = z.object({
  fromType: z.enum(["WAREHOUSE", "PROJECT"]),
  fromId: entityIdSchema,
  counterpartyId: entityIdSchema,
  transferType: z.enum(["SALE", "GIFT", "RETURN"]),
  items: z.array(outboundTransferItemInputSchema).min(1),
  /**
   * The FULL transfer value carried as the debt's OPENING balance. Any amount
   * already collected at transfer time is passed separately as
   * `firstPaymentAmountDzd` and posted as a real PAYMENT, so the running
   * balance is the amount still on credit. Optional; omitted when nothing is
   * on credit.
   */
  debtAmountDzd: z.number().nonnegative().optional(),
  /**
   * The portion paid at transfer time. Posted as a real `PAYMENT` entry so the
   * ledger shows the first payment instead of dropping it (D8). Defaults to 0.
   */
  firstPaymentAmountDzd: z.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** inventoryOutboundTransferSchema - Outbound transfer schema. */
export const inventoryOutboundTransferSchema = z.object({
  id: entityIdSchema,
  transferDate: timestampSchema,
  fromType: z.enum(["WAREHOUSE", "PROJECT"]),
  fromId: entityIdSchema,
  counterpartyId: entityIdSchema,
  transferType: z.enum(["SALE", "GIFT", "RETURN"]),
  status: z.literal("COMPLETED"),
  associatedDebtAccountId: entityIdSchema.nullable(),
  notes: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** InventoryItemDefinition - Inventory item definition. */
export type InventoryItemDefinition = z.infer<typeof inventoryItemDefinitionSchema>;
/** InventoryInvoiceAttachment - Inventory invoice attachment. */
export type InventoryInvoiceAttachment = z.infer<typeof inventoryInvoiceAttachmentSchema>;
/** InventoryAssetUnit - Inventory asset unit. */
export type InventoryAssetUnit = z.infer<typeof inventoryAssetUnitSchema>;
/** InventoryConsumableBalance - Inventory consumable balance. */
export type InventoryConsumableBalance = z.infer<typeof inventoryConsumableBalanceSchema>;
/** InventoryMovement - Inventory movement. */
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
/** InventoryAssetDetail - Inventory asset detail. */
export type InventoryAssetDetail = z.infer<typeof inventoryAssetDetailSchema>;
/** InventoryAssetCharge - A charge for a unit's placement on a project. */
export type InventoryAssetCharge = z.infer<typeof inventoryAssetChargeSchema>;
/** InventoryAssetChargeRevision - A recorded correction/void of a charge. */
export type InventoryAssetChargeRevision = z.infer<typeof inventoryAssetChargeRevisionSchema>;
/** InventoryAssetChargeDetail - A charge plus its correction history. */
export type InventoryAssetChargeDetail = z.infer<typeof inventoryAssetChargeDetailSchema>;
/** InventoryProjectCharges - A project's live charges plus their total. */
export type InventoryProjectCharges = z.infer<typeof inventoryProjectChargesSchema>;
/** InventoryAssetChargeDefault - Resolved prefill for a new placement charge. */
export type InventoryAssetChargeDefault = z.infer<typeof inventoryAssetChargeDefaultSchema>;
/** InventoryAssetChargeDefaultInput - Input for the default resolution. */
export type InventoryAssetChargeDefaultInput = z.infer<typeof inventoryAssetChargeDefaultInputSchema>;
/** InventoryAssetChargesListByUnitInput - Input for listing a unit's charges. */
export type InventoryAssetChargesListByUnitInput = z.infer<typeof inventoryAssetChargesListByUnitInputSchema>;
/** InventoryAssetChargesListByProjectInput - Input for listing a project's charges. */
export type InventoryAssetChargesListByProjectInput = z.infer<typeof inventoryAssetChargesListByProjectInputSchema>;
/** InventoryAssetChargeUpdateInput - Input for correcting a charge amount. */
export type InventoryAssetChargeUpdateInput = z.infer<typeof inventoryAssetChargeUpdateInputSchema>;
/** InventoryAssetChargeVoidInput - Input for voiding a charge. */
export type InventoryAssetChargeVoidInput = z.infer<typeof inventoryAssetChargeVoidInputSchema>;
/** InventoryLocationContents - Inventory location contents. */
export type InventoryLocationContents = z.infer<typeof inventoryLocationContentsSchema>;
/** InventoryEntry - Inventory entry. */
export type InventoryEntry = z.infer<typeof inventoryEntrySchema>;
/** InventoryInvoiceGroup - Inventory invoice group. */
export type InventoryInvoiceGroup = z.infer<typeof inventoryInvoiceGroupSchema>;
/** InventoryInvoiceGroupDetail - Inventory invoice group detail. */
export type InventoryInvoiceGroupDetail = z.infer<typeof inventoryInvoiceGroupDetailSchema>;
/** InventoryItemDefinitionCreateInput - Inventory item definition create input. */
export type InventoryItemDefinitionCreateInput = z.infer<typeof inventoryItemDefinitionCreateInputSchema>;
/** InventoryItemDefinitionUpdateInput - Inventory item definition update input. */
export type InventoryItemDefinitionUpdateInput = z.infer<typeof inventoryItemDefinitionUpdateInputSchema>;
/** InventoryInvoiceGroupCreateInput - Inventory invoice group create input. */
export type InventoryInvoiceGroupCreateInput = z.infer<typeof inventoryInvoiceGroupCreateInputSchema>;
/** InventoryInvoiceGroupRecordPaymentInput - Inventory invoice group record payment input. */
export type InventoryInvoiceGroupRecordPaymentInput = z.infer<typeof inventoryInvoiceGroupRecordPaymentInputSchema>;
/** OutboundTransferItemInput - Outbound transfer item input. */
export type OutboundTransferItemInput = z.infer<typeof outboundTransferItemInputSchema>;
/** InventoryOutboundTransferCreateInput - Inventory outbound transfer create input. */
export type InventoryOutboundTransferCreateInput = z.infer<typeof inventoryOutboundTransferCreateInputSchema>;
/** InventoryOutboundTransfer - Inventory outbound transfer. */
export type InventoryOutboundTransfer = z.infer<typeof inventoryOutboundTransferSchema>

/** inventoryTransferHistoryInputSchema - Transfer history input schema. */
export const inventoryTransferHistoryInputSchema = z.object({
  warehouseId: entityIdSchema.optional(),
  projectId: entityIdSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  movementType: inventoryMovementTypeSchema.optional(),
  limit: z.number().int().positive().optional(),
})

/** InventoryTransferHistoryInput - Inventory transfer history input. */
export type InventoryTransferHistoryInput = z.infer<typeof inventoryTransferHistoryInputSchema>;
