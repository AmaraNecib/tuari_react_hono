import { z } from "zod";

import {
  entityIdSchema,
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
 * + chargedMaterials (the NET of consumable movements in and out of the project)
 *
 * Material charged to the project follows the SETTLED owner rule: cost follows
 * the material, not the physical consumption event. A consumable movement INTO
 * the project adds `quantity × the linked entry's unit price`; a movement OUT
 * of the project (to a warehouse or another project) subtracts it. The system
 * has no "consumed" event, so "consumed" must never be the label: material at a
 * project is CHARGED, whether or not it was physically used.
 *
 * `parkedInventory` is the CURRENT inventory value physically at the project,
 * ASSETS ONLY. It is deliberately OUTSIDE `totalDzd`: a tool sitting on site is
 * inventory value, not money the project spent. A consumable sitting at a
 * project is charged (it is in `chargedMaterialsDzd`), so it is not parked;
 * listing it in both would double-count it.
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

/**
 * Whether a material movement adds to (`IN`) or reverses (`OUT`) the project's
 * charged material. The sign lives with the movement, not in a signed money
 * field, so `valueDzd` stays a positive magnitude.
 */
export const projectCostMaterialDirectionSchema = z.enum(["IN", "OUT"]);
export type ProjectCostMaterialDirection = z.infer<typeof projectCostMaterialDirectionSchema>;

/**
 * A consumable movement the project is a party to, valued at the entry's unit
 * price. `valueDzd` is the positive magnitude; `direction` is the sign the
 * service applies — `IN` adds to the project's material cost, `OUT` reverses it.
 */
export const projectCostMaterialMovementSchema = z.object({
  id: entityIdSchema,
  itemDefinitionId: entityIdSchema.nullable(),
  itemName: nullableTextSchema,
  unit: nullableTextSchema,
  quantity: z.number().positive(),
  unitPriceDzd: storedMoneyDzdSchema.nullable(),
  valueDzd: storedMoneyDzdSchema,
  direction: projectCostMaterialDirectionSchema,
  occurredAt: timestampSchema,
});

/** An asset unit currently parked at the project (inventory value, not cost). */
export const projectCostParkedAssetSchema = z.object({
  assetUnitId: entityIdSchema,
  assetName: nullableTextSchema,
  purchasePriceDzd: storedMoneyDzdSchema,
});

/**
 * The four disjoint cost parts. `totalDzd` is their rounded sum; it never
 * includes `parkedInventory`.
 */
export const projectCostPartsSchema = z.object({
  expensesDzd: nonNegativePaymentAmountSchema,
  salariesDzd: nonNegativePaymentAmountSchema,
  stockDzd: nonNegativePaymentAmountSchema,
  chargedMaterialsDzd: nonNegativePaymentAmountSchema,
});

export const projectCostSchema = z.object({
  projectId: entityIdSchema,
  totalDzd: nonNegativePaymentAmountSchema,
  parts: projectCostPartsSchema,
  expenses: z.array(projectCostExpenseRowSchema),
  salaries: z.array(projectCostSalaryRowSchema),
  stock: z.array(projectCostStockRowSchema),
  materialMovements: z.array(projectCostMaterialMovementSchema),
  parkedInventory: z.object({
    totalDzd: nonNegativePaymentAmountSchema,
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
