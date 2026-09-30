import { z } from "zod";

import {
  entityIdSchema,
  inventoryMovementTypeSchema,
  nullableTextSchema,
  timestampSchema,
} from "./core";
import {
  nonNegativePaymentAmountSchema,
  storedMoneyDzdSchema,
} from "./payment";

/**
 * Project cost (issue #414) — one project's total plus the four sources that
 * make it up and the rows behind each source, so the number can be explained.
 *
 * The four parts are DISJOINT and additive:
 *   expenses (non-voided, tagged to the project, in full)
 * + salaries (allocated split days × the payment's day rate)
 * + stock    (live placement charges for the project)
 * + consumables (value of consumable movements issued to the project)
 *
 * `parkedInventory` is the CURRENT inventory value physically at the project.
 * It is deliberately OUTSIDE `totalDzd`: a tool sitting on site is inventory
 * value, not money the project spent. Only what was used or charged is cost.
 *
 * Money rules: every stored row uses the permissive {@link storedMoneyDzdSchema}
 * (a legacy row may predate the write bound), while every COMPUTED aggregate
 * uses {@link nonNegativePaymentAmountSchema} so a sum cannot silently leave
 * the representable range.
 */

export const projectCostInputSchema = z.object({
  projectId: entityIdSchema,
});

/** An expense tagged to the project; the whole amount is the project's cost. */
export const projectCostExpenseRowSchema = z.object({
  id: entityIdSchema,
  expenseDate: timestampSchema,
  whatFor: nullableTextSchema,
  amountDzd: storedMoneyDzdSchema,
  responsibleWorkerId: entityIdSchema.nullable(),
  responsibleWorkerName: nullableTextSchema,
  sellerId: entityIdSchema.nullable(),
  sellerName: nullableTextSchema,
});

/** A salary payment's share of the project, by allocated days. */
export const projectCostSalaryRowSchema = z.object({
  paymentId: entityIdSchema,
  employeeId: entityIdSchema,
  employeeName: nullableTextSchema,
  days: z.number().int().positive(),
  dayRateDzd: storedMoneyDzdSchema,
  amountDzd: storedMoneyDzdSchema,
  paymentDate: timestampSchema,
});

/** A stock-placement charge for the project (the tool and the price chosen). */
export const projectCostStockRowSchema = z.object({
  id: entityIdSchema,
  assetUnitId: entityIdSchema,
  assetName: nullableTextSchema,
  amountDzd: storedMoneyDzdSchema,
  placedAt: timestampSchema,
});

/** A consumable movement INTO the project, valued at the entry's unit price. */
export const projectCostConsumableRowSchema = z.object({
  id: entityIdSchema,
  itemDefinitionId: entityIdSchema.nullable(),
  itemName: nullableTextSchema,
  unit: nullableTextSchema,
  quantity: z.number().positive(),
  unitPriceDzd: storedMoneyDzdSchema.nullable(),
  valueDzd: storedMoneyDzdSchema,
  movementType: inventoryMovementTypeSchema,
  occurredAt: timestampSchema,
});

/** An asset unit currently parked at the project (inventory value, not cost). */
export const projectCostParkedAssetSchema = z.object({
  assetUnitId: entityIdSchema,
  assetName: nullableTextSchema,
  purchasePriceDzd: storedMoneyDzdSchema,
});

/** A consumable balance currently parked at the project (inventory value). */
export const projectCostParkedConsumableSchema = z.object({
  itemDefinitionId: entityIdSchema.nullable(),
  itemName: nullableTextSchema,
  unit: nullableTextSchema,
  quantity: z.number().positive(),
  unitPriceDzd: storedMoneyDzdSchema.nullable(),
  valueDzd: storedMoneyDzdSchema,
});

/**
 * The four disjoint cost parts. `totalDzd` is their rounded sum; it never
 * includes `parkedInventory`.
 */
export const projectCostPartsSchema = z.object({
  expensesDzd: nonNegativePaymentAmountSchema,
  salariesDzd: nonNegativePaymentAmountSchema,
  stockDzd: nonNegativePaymentAmountSchema,
  consumablesDzd: nonNegativePaymentAmountSchema,
});

export const projectCostSchema = z.object({
  projectId: entityIdSchema,
  totalDzd: nonNegativePaymentAmountSchema,
  parts: projectCostPartsSchema,
  expenses: z.array(projectCostExpenseRowSchema),
  salaries: z.array(projectCostSalaryRowSchema),
  stock: z.array(projectCostStockRowSchema),
  consumables: z.array(projectCostConsumableRowSchema),
  parkedInventory: z.object({
    totalDzd: nonNegativePaymentAmountSchema,
    assets: z.array(projectCostParkedAssetSchema),
    consumables: z.array(projectCostParkedConsumableSchema),
  }),
});

export type ProjectCostInput = z.infer<typeof projectCostInputSchema>;
export type ProjectCostExpenseRow = z.infer<typeof projectCostExpenseRowSchema>;
export type ProjectCostSalaryRow = z.infer<typeof projectCostSalaryRowSchema>;
export type ProjectCostStockRow = z.infer<typeof projectCostStockRowSchema>;
export type ProjectCostConsumableRow = z.infer<typeof projectCostConsumableRowSchema>;
export type ProjectCostParkedAsset = z.infer<typeof projectCostParkedAssetSchema>;
export type ProjectCostParkedConsumable = z.infer<typeof projectCostParkedConsumableSchema>;
export type ProjectCostParts = z.infer<typeof projectCostPartsSchema>;
export type ProjectCost = z.infer<typeof projectCostSchema>;
