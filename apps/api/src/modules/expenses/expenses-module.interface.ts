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
export interface ExpensesModule<Amount = number> {
  create(input: CreateExpenseInput<Amount>, audit?: ExpenseAudit): Promise<Expense<Amount>>;

  get(id: string): Promise<ExpenseWithRevisions<Amount> | null>;

  list(filters?: ExpenseListFilters): Promise<ExpenseListResult<Amount>>;

  update(input: UpdateExpenseInput<Amount>, audit?: ExpenseAudit): Promise<Expense<Amount>>;

  void(input: VoidExpenseInput, audit?: ExpenseAudit): Promise<Expense<Amount>>;
}
