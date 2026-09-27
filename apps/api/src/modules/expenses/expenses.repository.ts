import type {
  CreateExpenseRecord,
  CreateExpenseRevisionRecord,
  Expense,
  ExpenseAudit,
  ExpenseListFilters,
  ExpenseRevision,
  UpdateExpenseRecord,
  VoidExpenseRecord,
} from "./expenses.types";

/**
 * Expenses repository seam (issue #411).
 *
 * The service owns the business rules (void-not-delete, revision recording,
 * totals); the repository owns storage. `updateExpense` + `createRevision`
 * must run inside one `runInTransaction` so a value change can never be
 * recorded without its revision row (or vice versa).
 */
export interface ExpenseRepository {
  create(data: CreateExpenseRecord, audit?: ExpenseAudit): Promise<Expense>;

  findById(id: string): Promise<Expense | null>;

  list(filters: ExpenseListFilters): Promise<Expense[]>;

  update(data: UpdateExpenseRecord, audit?: ExpenseAudit): Promise<Expense | null>;

  voidExpense(data: VoidExpenseRecord, audit?: ExpenseAudit): Promise<Expense | null>;

  createRevision(
    data: CreateExpenseRevisionRecord,
    audit?: ExpenseAudit,
  ): Promise<ExpenseRevision>;

  listRevisionsByExpenseId(expenseId: string): Promise<ExpenseRevision[]>;

  /** Run a callback inside one database transaction. */
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
