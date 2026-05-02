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

export const inventoryAssetUnitSchema = z.object({
  id: entityIdSchema,
  inventoryEntryId: entityIdSchema,
  assetName: z.string().trim().min(1).max(160),
  assetTag: nullableTextSchema,
  serialNumber: nullableTextSchema,
  condition: inventoryAssetConditionSchema.nullable(),
  purchaseDate: timestampSchema.nullable(),
  purchasePriceDzd: z.number().nonnegative(),
  currentWarehouseId: entityIdSchema.nullable(),
  currentProjectId: entityIdSchema.nullable(),
  currentLocationLabel: nullableTextSchema,
  note: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

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

export const inventoryAssetDetailSchema = z.object({
  asset: inventoryAssetUnitSchema,
  invoiceGroup: z.lazy(() => inventoryInvoiceGroupSchema),
  movements: z.array(inventoryMovementSchema),
});

export const inventoryLocationContentsSchema = z.object({
  assets: z.array(inventoryAssetUnitSchema),
  consumables: z.array(inventoryConsumableBalanceSchema),
});

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
  unitPriceDzd: z.number().nonnegative().nullable(),
  totalPriceDzd: z.number().nonnegative(),
  note: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  assets: z.array(inventoryAssetUnitSchema),
});

export const inventoryInvoiceGroupSchema = z.object({
  id: entityIdSchema,
  invoiceNumber: nullableTextSchema,
  supplierName: nullableTextSchema,
  invoiceDate: timestampSchema.nullable(),
  warehouseId: entityIdSchema.nullable(),
  projectId: entityIdSchema.nullable(),
  externalCounterpartyId: entityIdSchema.nullable(),
  grossTotalDzd: z.number().nonnegative(),
  paidAmountDzd: z.number().nonnegative(),
  remainingDebtDzd: z.number().nonnegative(),
  debtAccountId: entityIdSchema.nullable(),
  note: nullableTextSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const inventoryInvoiceGroupDetailSchema = z.object({
  group: inventoryInvoiceGroupSchema,
  entries: z.array(inventoryEntrySchema),
  attachments: z.array(inventoryInvoiceAttachmentSchema),
  movements: z.array(inventoryMovementSchema),
  consumableBalances: z.array(inventoryConsumableBalanceSchema),
});

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

export const inventoryItemDefinitionListInputSchema = z
  .object({
    itemType: inventoryItemTypeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

export const inventoryAssetUnitCreateInputSchema = z.object({
  assetName: z.string().trim().min(1).max(160),
  assetTag: z.string().trim().max(120).nullable().optional(),
  serialNumber: z.string().trim().max(160).nullable().optional(),
  condition: inventoryAssetConditionSchema.nullable().optional(),
  purchaseDate: timestampSchema.nullable().optional(),
  purchasePriceDzd: z.number().nonnegative(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const inventoryConsumableEntryCreateInputSchema = z.object({
  kind: z.literal("CONSUMABLE"),
  itemDefinitionId: entityIdSchema,
  warehouseId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  quantity: z.number().positive(),
  unitPriceDzd: z.number().nonnegative(),
  totalPriceDzd: z.number().nonnegative(),
  note: z.string().trim().max(1000).nullable().optional(),
}).superRefine((input, ctx) => {
  if (input.warehouseId && input.projectId) {
    ctx.addIssue({ code: "custom", message: "اختر مستودعًا أو مشروعًا واحدًا فقط.", path: ["warehouseId"] })
  }
});

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

export const inventoryInvoiceEntryCreateInputSchema = z.discriminatedUnion("kind", [
  inventoryConsumableEntryCreateInputSchema,
  inventoryAssetEntryCreateInputSchema,
]);

export const inventoryInvoiceGroupCreateInputSchema = z.object({
  invoiceNumber: z.string().trim().max(160).nullable().optional(),
  supplierName: z.string().trim().max(160).nullable().optional(),
  invoiceDate: timestampSchema.nullable().optional(),
  warehouseId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  externalCounterpartyId: entityIdSchema.nullable().optional(),
  createDebt: z.boolean().optional(),
  paymentInputType: inventoryPaymentInputTypeSchema.optional(),
  paidAmountDzd: z.number().nonnegative().nullable().optional(),
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

export const inventoryInvoiceGroupListInputSchema = z
  .object({
    warehouseId: entityIdSchema.optional(),
    projectId: entityIdSchema.optional(),
  })
  .optional();

export const inventoryAssetTransferInputSchema = z.object({
  assetUnitId: entityIdSchema,
  toWarehouseId: entityIdSchema.nullable().optional(),
  toProjectId: entityIdSchema.nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  occurredAt: timestampSchema.optional(),
}).superRefine((input, ctx) => {
  const hasWarehouse = Boolean(input.toWarehouseId)
  const hasProject = Boolean(input.toProjectId)

  if (hasWarehouse === hasProject) {
    ctx.addIssue({ code: "custom", message: "اختر وجهة واحدة فقط للتحويل.", path: ["toWarehouseId"] })
  }
});

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

export const inventoryInvoiceGroupRecordPaymentInputSchema = z.object({
  invoiceGroupId: entityIdSchema,
  amountDzd: z.number().positive(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const outboundTransferItemInputSchema = z.object({
  itemId: entityIdSchema,
  quantity: z.number().positive(),
  unitPriceDzd: z.number().nonnegative().optional(),
});

export const inventoryOutboundTransferCreateInputSchema = z.object({
  fromType: z.enum(["WAREHOUSE", "PROJECT"]),
  fromId: entityIdSchema,
  counterpartyId: entityIdSchema,
  transferType: z.enum(["SALE", "GIFT", "RETURN"]),
  items: z.array(outboundTransferItemInputSchema).min(1),
  debtAmountDzd: z.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

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

export type InventoryItemDefinition = z.infer<typeof inventoryItemDefinitionSchema>;
export type InventoryInvoiceAttachment = z.infer<typeof inventoryInvoiceAttachmentSchema>;
export type InventoryAssetUnit = z.infer<typeof inventoryAssetUnitSchema>;
export type InventoryConsumableBalance = z.infer<typeof inventoryConsumableBalanceSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
export type InventoryAssetDetail = z.infer<typeof inventoryAssetDetailSchema>;
export type InventoryLocationContents = z.infer<typeof inventoryLocationContentsSchema>;
export type InventoryEntry = z.infer<typeof inventoryEntrySchema>;
export type InventoryInvoiceGroup = z.infer<typeof inventoryInvoiceGroupSchema>;
export type InventoryInvoiceGroupDetail = z.infer<typeof inventoryInvoiceGroupDetailSchema>;
export type InventoryItemDefinitionCreateInput = z.infer<typeof inventoryItemDefinitionCreateInputSchema>;
export type InventoryItemDefinitionUpdateInput = z.infer<typeof inventoryItemDefinitionUpdateInputSchema>;
export type InventoryInvoiceGroupCreateInput = z.infer<typeof inventoryInvoiceGroupCreateInputSchema>;
export type InventoryInvoiceGroupRecordPaymentInput = z.infer<typeof inventoryInvoiceGroupRecordPaymentInputSchema>;
export type OutboundTransferItemInput = z.infer<typeof outboundTransferItemInputSchema>;
export type InventoryOutboundTransferCreateInput = z.infer<typeof inventoryOutboundTransferCreateInputSchema>;
export type InventoryOutboundTransfer = z.infer<typeof inventoryOutboundTransferSchema>;
