import { z } from "zod";

import { entityIdSchema, nullableTextSchema, timestampSchema } from "./core";

const exactAmountSchema = z.string().max(96).regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/);
const reportAmountSchema = z.string().max(256).regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/);
const exactUnitPriceSchema = z.string().max(96).regex(/^-?(?:0|[1-9]\d*)\.\d{4}$/);

const quantitySchema = z.string().max(96).regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);

export const projectCostInputSchema = z.object({
  projectId: entityIdSchema,
});

export const projectCostExpenseRowSchema = z.object({
  id: entityIdSchema,
  expenseDate: timestampSchema,
  whatFor: nullableTextSchema,
  amount: exactAmountSchema,
  responsibleWorkerId: entityIdSchema.nullable(),
  responsibleWorkerName: nullableTextSchema,
  sellerId: entityIdSchema.nullable(),
  sellerName: nullableTextSchema,
});

/** One recorded approved-earnings segment. Its amount is already finalized. */
export const projectCostSalaryRowSchema = z.object({
  earningId: entityIdSchema,
  segmentId: entityIdSchema,
  employeeId: entityIdSchema,
  employeeName: nullableTextSchema,
  ordinal: z.number().int().nonnegative(),
  amount: exactAmountSchema,
  periodStart: timestampSchema,
  periodEnd: timestampSchema,
  approvedAt: timestampSchema,
});

export const projectCostStockRowSchema = z.object({
  id: entityIdSchema,
  assetUnitId: entityIdSchema,
  assetName: nullableTextSchema,
  amount: exactAmountSchema,
  placedAt: timestampSchema,
});

export const projectCostMaterialDirectionSchema = z.enum(["IN", "OUT"]);
export type ProjectCostMaterialDirection = z.infer<typeof projectCostMaterialDirectionSchema>;

export const projectCostMaterialMovementSchema = z.object({
  id: entityIdSchema,
  itemDefinitionId: entityIdSchema.nullable(),
  itemName: nullableTextSchema,
  unit: nullableTextSchema,
  quantity: quantitySchema,
  unitPrice: exactUnitPriceSchema.nullable(),
  valueAmount: exactAmountSchema,
  direction: projectCostMaterialDirectionSchema,
  occurredAt: timestampSchema,
});

export const projectCostParkedAssetSchema = z.object({
  assetUnitId: entityIdSchema,
  assetName: nullableTextSchema,
  purchaseAmount: exactAmountSchema,
});

export const projectCostPartsSchema = z.object({
  expensesAmount: reportAmountSchema,
  salariesAmount: reportAmountSchema,
  stockAmount: reportAmountSchema,
  chargedMaterialsAmount: reportAmountSchema,
});

export const projectCostSchema = z.object({
  projectId: entityIdSchema,
  currencyCode: z.literal("DZD"),
  totalAmount: reportAmountSchema,
  parts: projectCostPartsSchema,
  expenses: z.array(projectCostExpenseRowSchema),
  salaries: z.array(projectCostSalaryRowSchema),
  stock: z.array(projectCostStockRowSchema),
  materialMovements: z.array(projectCostMaterialMovementSchema),
  parkedInventory: z.object({
    totalAmount: reportAmountSchema,
    assets: z.array(projectCostParkedAssetSchema),
  }),
});

export type ProjectCostInput = z.infer<typeof projectCostInputSchema>;
export type ProjectCostExpenseRow = z.infer<typeof projectCostExpenseRowSchema>;
export type ProjectCostSalaryRow = z.infer<typeof projectCostSalaryRowSchema>;
export type ProjectCostStockRow = z.infer<typeof projectCostStockRowSchema>;
export type ProjectCostMaterialMovement = z.infer<typeof projectCostMaterialMovementSchema>;
export type ProjectCostParkedAsset = z.infer<typeof projectCostParkedAssetSchema>;
export type ProjectCostParts = z.infer<typeof projectCostPartsSchema>;
export type ProjectCost = z.infer<typeof projectCostSchema>;
