import { z } from "zod";

import { Money } from "./exact-money";
import {
  createExpenseInputSchema, expenseSchema, expenseRevisionSchema,
  expenseListOutputSchema, expenseTotalsSchema, expenseProjectGroupSchema,
  updateExpenseInputSchema,
} from "./expenses";

/** Opt-in finalized expense codec. Numeric legacy contracts are not switched. */
export const exactExpenseAmountSchema = z.string().max(96).transform((value, ctx) => {
  try {
    const amount = Money.parse(value);
    if (BigInt(amount.toMinorUnits()) <= 0n) throw new RangeError("Expense must be positive");
    return amount.toWire();
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a positive DZD amount with at most two decimal places, within the supported range." });
    return z.NEVER;
  }
});

// Match the shared display transport-length guard, not the document-operation limit.
// Persisted per-value Money bounds remain independent of read-only history totals.
const exactExpenseAggregateSchema = z.string().max(256).regex(/^(?:0|[1-9]\d*)\.\d{2}$/);

export const exactExpenseSchema = expenseSchema.extend({
  amount: exactExpenseAmountSchema,
  currency: z.literal("DZD"),
});
export const exactExpenseRevisionSchema = expenseRevisionSchema.extend({
  previousAmount: exactExpenseAmountSchema.nullable(),
  newAmount: exactExpenseAmountSchema,
});
export const exactExpenseWithRevisionsSchema = exactExpenseSchema.extend({
  revisions: z.array(exactExpenseRevisionSchema),
});
export const createExactExpenseInputSchema = createExpenseInputSchema.extend({
  amount: exactExpenseAmountSchema,
  currency: z.literal("DZD").optional(),
});
export const updateExactExpenseInputSchema = updateExpenseInputSchema.extend({
  amount: exactExpenseAmountSchema.optional(),
});
export const exactExpenseListOutputSchema = expenseListOutputSchema.extend({
  items: z.array(exactExpenseSchema),
  totals: expenseTotalsSchema.extend({
    total: exactExpenseAggregateSchema,
    taggedToProject: exactExpenseAggregateSchema,
    notTaggedToProject: exactExpenseAggregateSchema,
    heldByWorkers: exactExpenseAggregateSchema,
  }),
  groupsByProject: z.array(expenseProjectGroupSchema.extend({ total: exactExpenseAggregateSchema })),
});

export type ExactExpense = z.infer<typeof exactExpenseSchema>;
export type ExactExpenseRevision = z.infer<typeof exactExpenseRevisionSchema>;
export type ExactExpenseWithRevisions = z.infer<typeof exactExpenseWithRevisionsSchema>;
export type CreateExactExpenseInput = z.infer<typeof createExactExpenseInputSchema>;
export type UpdateExactExpenseInput = z.infer<typeof updateExactExpenseInputSchema>;
export type ExactExpenseListOutput = z.infer<typeof exactExpenseListOutputSchema>;
