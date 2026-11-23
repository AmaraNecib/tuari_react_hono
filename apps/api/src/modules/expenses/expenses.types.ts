import type { MutationAuditContext } from "../company/company.types";

/**
 * Expenses domain (issue #411).
 *
 * An expense is money that leaves the business for something that is not
 * stock. It never writes stock, even when it references a stock item.
 */

export type ExpenseStatus = "LIVE" | "VOIDED";

export interface Expense<Amount = number> {
  id: string;
  /** Present on opt-in exact documents; legacy records remain unchanged. */
  currency?: "DZD";
  amount: Amount;
  expenseDate: string;
  whatFor: string | null;
  /** The worker the money was handed to (an internal role), not a payee. */
  responsibleWorkerId: string | null;
  /** External seller (`external_counterparty` id, the debts module's concept). */
  sellerId: string | null;
  projectId: string | null;
  /** Optional stock item the expense relates to — referenced only. */
  stockItemId: string | null;
  note: string | null;
  status: ExpenseStatus;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The editable fields a revision can record as changed. */
export type ExpenseRevisionField =
  | "amount"
  | "expenseDate"
  | "whatFor"
  | "responsibleWorkerId"
  | "sellerId"
  | "projectId"
  | "stockItemId"
  | "note";

/** A recorded value change (who, when, what changed, optional reason). */
export interface ExpenseRevision<Amount = number> {
  id: string;
  expenseId: string;
  previousAmount: Amount | null;
  newAmount: Amount;
  /** Which editable fields actually changed, so a project/date/worker/seller
   * move is visible in the history — not just the amount. */
  changedFields: ExpenseRevisionField[];
  reason: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
  createdAt: string;
}

export interface ExpenseWithRevisions<Amount = number> extends Expense<Amount> {
  revisions: ExpenseRevision<Amount>[];
}

export interface ExpenseListFilters {
  projectId?: string;
  responsibleWorkerId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ExpenseTotals<Amount = number> {
  total: Amount;
  count: number;
  taggedToProject: Amount;
  notTaggedToProject: Amount;
  heldByWorkers: Amount;
  workerCount: number;
}

export interface ExpenseProjectGroup<Amount = number> {
  projectId: string | null;
  total: Amount;
  count: number;
}

export interface ExpenseListResult<Amount = number> {
  items: Expense<Amount>[];
  totals: ExpenseTotals<Amount>;
  groupsByProject: ExpenseProjectGroup<Amount>[];
}

export interface CreateExpenseInput<Amount = number> {
  id: string;
  currency?: "DZD";
  amount: Amount;
  expenseDate: string;
  whatFor?: string | null;
  responsibleWorkerId?: string | null;
  sellerId?: string | null;
  projectId?: string | null;
  stockItemId?: string | null;
  note?: string | null;
}

/**
 * Edit input: omitted fields are untouched, an explicit `null` clears an
 * optional field. `reason` is recorded on the revision, not stored on the row.
 */
export interface UpdateExpenseInput<Amount = number> {
  id: string;
  amount?: Amount;
  expenseDate?: string;
  whatFor?: string | null;
  responsibleWorkerId?: string | null;
  sellerId?: string | null;
  projectId?: string | null;
  stockItemId?: string | null;
  note?: string | null;
  reason?: string | null;
}

export interface VoidExpenseInput {
  id: string;
  reason?: string | null;
}

// --- Repository record shapes (the repository owns timestamps) ---

export interface CreateExpenseRecord<Amount = number> {
  id: string;
  currency?: "DZD";
  amount: Amount;
  expenseDate: string;
  whatFor: string | null;
  responsibleWorkerId: string | null;
  sellerId: string | null;
  projectId: string | null;
  stockItemId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateExpenseRecord<Amount = number> {
  id: string;
  amount: Amount;
  expenseDate: string;
  whatFor: string | null;
  responsibleWorkerId: string | null;
  sellerId: string | null;
  projectId: string | null;
  stockItemId: string | null;
  note: string | null;
  updatedAt: string;
}

export interface VoidExpenseRecord {
  id: string;
  voidedAt: string;
  voidReason: string | null;
  updatedAt: string;
}

export interface CreateExpenseRevisionRecord<Amount = number> {
  id: string;
  expenseId: string;
  previousAmount: Amount | null;
  newAmount: Amount;
  changedFields: ExpenseRevisionField[];
  reason: string | null;
  createdAt: string;
}

export type ExpenseAudit = MutationAuditContext;

// --- Typed errors ---

export class ExpenseNotFoundError extends Error {
  constructor(public readonly expenseId: string) {
    super(`Expense ${expenseId} not found`);
    this.name = "ExpenseNotFoundError";
  }
}

export class ExpenseAlreadyVoidedError extends Error {
  constructor(public readonly expenseId: string) {
    super(`Expense ${expenseId} is already voided`);
    this.name = "ExpenseAlreadyVoidedError";
  }
}

export class ExpenseInvalidAmountError extends Error {
  constructor(public readonly amount: unknown) {
    super(`Expense amount must be positive and within its supported precision and range; received ${String(amount)}`);
    this.name = "ExpenseInvalidAmountError";
  }
}
