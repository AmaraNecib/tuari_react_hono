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
export interface ExpenseRepository<Amount = number> {
  create(data: CreateExpenseRecord<Amount>, audit?: ExpenseAudit): Promise<Expense<Amount>>;

  findById(id: string): Promise<Expense<Amount> | null>;

  list(filters: ExpenseListFilters): Promise<Expense<Amount>[]>;

  update(data: UpdateExpenseRecord<Amount>, audit?: ExpenseAudit): Promise<Expense<Amount> | null>;

  voidExpense(data: VoidExpenseRecord, audit?: ExpenseAudit): Promise<Expense<Amount> | null>;

  createRevision(
    data: CreateExpenseRevisionRecord<Amount>,
    audit?: ExpenseAudit,
  ): Promise<ExpenseRevision<Amount>>;

  listRevisionsByExpenseId(expenseId: string): Promise<ExpenseRevision<Amount>[]>;

  /** Run a callback inside one database transaction. */
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
