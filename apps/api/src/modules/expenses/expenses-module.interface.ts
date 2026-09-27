import type {
  CreateExpenseInput,
  Expense,
  ExpenseAudit,
  ExpenseListFilters,
  ExpenseListResult,
  ExpenseWithRevisions,
  UpdateExpenseInput,
  VoidExpenseInput,
} from "./expenses.types";

/** Expenses module — the deep service seam over the repository. */
export interface ExpensesModule {
  create(input: CreateExpenseInput, audit?: ExpenseAudit): Promise<Expense>;

  get(id: string): Promise<ExpenseWithRevisions | null>;

  list(filters?: ExpenseListFilters): Promise<ExpenseListResult>;

  update(input: UpdateExpenseInput, audit?: ExpenseAudit): Promise<Expense>;

  void(input: VoidExpenseInput, audit?: ExpenseAudit): Promise<Expense>;
}
