import type { MutationAuditContext } from "../company/company.types";

/**
 * Expenses domain (issue #411).
 *
 * An expense is money that leaves the business for something that is not
 * stock. It never writes stock, even when it references a stock item.
 */

export type ExpenseStatus = "LIVE" | "VOIDED";

export interface Expense {
  id: string;
  amount: number;
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

/** A recorded value change (who, when, optional reason). */
export interface ExpenseRevision {
  id: string;
  expenseId: string;
  previousAmount: number | null;
  newAmount: number;
  reason: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
  createdAt: string;
}

export interface ExpenseWithRevisions extends Expense {
  revisions: ExpenseRevision[];
}

export interface ExpenseListFilters {
  projectId?: string;
  responsibleWorkerId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ExpenseTotals {
  total: number;
  count: number;
  taggedToProject: number;
  notTaggedToProject: number;
  heldByWorkers: number;
  workerCount: number;
}

export interface ExpenseProjectGroup {
  projectId: string | null;
  total: number;
  count: number;
}

export interface ExpenseListResult {
  items: Expense[];
  totals: ExpenseTotals;
  groupsByProject: ExpenseProjectGroup[];
}

export interface CreateExpenseInput {
  id: string;
  amount: number;
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
export interface UpdateExpenseInput {
  id: string;
  amount?: number;
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

export interface CreateExpenseRecord {
  id: string;
  amount: number;
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

export interface UpdateExpenseRecord {
  id: string;
  amount: number;
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

export interface CreateExpenseRevisionRecord {
  id: string;
  expenseId: string;
  previousAmount: number | null;
  newAmount: number;
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
  constructor(public readonly amount: number) {
    super(`Expense amount must be a positive number; received ${amount}`);
    this.name = "ExpenseInvalidAmountError";
  }
}
