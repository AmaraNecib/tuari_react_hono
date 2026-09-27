import { z } from "zod";

import {
  auditActorUserIdSchema,
  auditTransactionIdSchema,
  entityIdSchema,
  nullableTextSchema,
  timestampSchema,
} from "./core";
import { paymentAmountSchema } from "./payment";

/**
 * Expenses domain (issue #411) — money that leaves the business for something
 * that is not stock (a phone, fuel, a repair).
 *
 * Money rule: `amount` reuses `paymentAmountSchema` (positive, bounded by
 * `Number.MAX_SAFE_INTEGER`) so the two money rules cannot drift. Every field
 * except `amount` and `expenseDate` is optional — any combination is valid.
 *
 * The `sellerId` references an existing `external_counterparty` (the debts
 * module's external-party concept) rather than a new party type.
 */

export const expenseStatusSchema = z.enum(["LIVE", "VOIDED"]);

export const expenseSchema = z.object({
  id: entityIdSchema,
  amount: paymentAmountSchema,
  expenseDate: timestampSchema,
  whatFor: nullableTextSchema,
  /**
   * The worker the money was handed to (an internal role), NOT a payee.
   */
  responsibleWorkerId: entityIdSchema.nullable(),
  /** External seller/party (an `external_counterparty` id). */
  sellerId: entityIdSchema.nullable(),
  /** Tagging a project charges the whole amount to that project. */
  projectId: entityIdSchema.nullable(),
  /**
   * Optional stock item the expense relates to (a repaired tool, fuel for a
   * machine). Referenced only — an expense never creates or changes stock.
   */
  stockItemId: entityIdSchema.nullable(),
  note: nullableTextSchema,
  status: expenseStatusSchema,
  voidedAt: timestampSchema.nullable(),
  voidedBy: nullableTextSchema,
  voidReason: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  actorLabel: nullableTextSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/**
 * A recorded value change on an expense (who, when, why). Created for every
 * edit, so the correction history survives even though the row keeps only its
 * current values.
 */
export const expenseRevisionSchema = z.object({
  id: entityIdSchema,
  expenseId: entityIdSchema,
  previousAmount: paymentAmountSchema.nullable(),
  newAmount: paymentAmountSchema,
  reason: nullableTextSchema,
  actorUserId: auditActorUserIdSchema,
  actorLabel: nullableTextSchema,
  transactionId: auditTransactionIdSchema,
  createdAt: timestampSchema,
});

export const expenseWithRevisionsSchema = expenseSchema.extend({
  revisions: z.array(expenseRevisionSchema),
});

const expenseTextInput = z.string().trim().min(1).max(500);

export const createExpenseInputSchema = z.object({
  id: z.string().uuid().optional(),
  amount: paymentAmountSchema,
  expenseDate: timestampSchema,
  whatFor: expenseTextInput.nullable().optional(),
  responsibleWorkerId: entityIdSchema.nullable().optional(),
  sellerId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  stockItemId: entityIdSchema.nullable().optional(),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
});

/**
 * Edit input. Omitted fields are untouched; an explicit `null` clears an
 * optional field. `reason` is the optional reason recorded on the revision.
 */
export const updateExpenseInputSchema = z.object({
  id: entityIdSchema,
  amount: paymentAmountSchema.optional(),
  expenseDate: timestampSchema.optional(),
  whatFor: expenseTextInput.nullable().optional(),
  responsibleWorkerId: entityIdSchema.nullable().optional(),
  sellerId: entityIdSchema.nullable().optional(),
  projectId: entityIdSchema.nullable().optional(),
  stockItemId: entityIdSchema.nullable().optional(),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
  reason: expenseTextInput.nullable().optional(),
});

export const voidExpenseInputSchema = z.object({
  id: entityIdSchema,
  reason: expenseTextInput.nullable().optional(),
});

export const expenseListFiltersSchema = z.object({
  projectId: entityIdSchema.optional(),
  responsibleWorkerId: entityIdSchema.optional(),
  fromDate: timestampSchema.optional(),
  toDate: timestampSchema.optional(),
});

/**
 * Totals the expenses screen needs: the filtered total, the tagged / untagged
 * split, and how much is held by workers.
 */
export const expenseTotalsSchema = z.object({
  total: z.number(),
  count: z.number().int().nonnegative(),
  taggedToProject: z.number(),
  notTaggedToProject: z.number(),
  heldByWorkers: z.number(),
  workerCount: z.number().int().nonnegative(),
});

/** One "group by project" card: `projectId: null` is the untagged group. */
export const expenseProjectGroupSchema = z.object({
  projectId: entityIdSchema.nullable(),
  total: z.number(),
  count: z.number().int().nonnegative(),
});

export const expenseListInputSchema = z.object({
  filters: expenseListFiltersSchema.optional(),
});

export const expenseListOutputSchema = z.object({
  items: z.array(expenseSchema),
  totals: expenseTotalsSchema,
  groupsByProject: z.array(expenseProjectGroupSchema),
});

export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseRevision = z.infer<typeof expenseRevisionSchema>;
export type ExpenseWithRevisions = z.infer<typeof expenseWithRevisionsSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseInputSchema>;
export type VoidExpenseInput = z.infer<typeof voidExpenseInputSchema>;
export type ExpenseListFilters = z.infer<typeof expenseListFiltersSchema>;
export type ExpenseTotals = z.infer<typeof expenseTotalsSchema>;
export type ExpenseProjectGroup = z.infer<typeof expenseProjectGroupSchema>;
export type ExpenseListOutput = z.infer<typeof expenseListOutputSchema>;
