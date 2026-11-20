import type { ContractRouterClient } from "@orpc/contract";
import { exactDebtsContract } from "./debts-exact-contract";
import { exactInvoicesContract } from "./invoice-exact-contract";
import { exactInventoryContract } from "./inventory-exact-contract";
import { exactExpensesContract } from "./expenses-exact-contract";

/** One decimal-string interface for the normal application's financial graph. */
export const financialContract = {
  debts: exactDebtsContract,
  invoices: exactInvoicesContract,
  inventory: exactInventoryContract,
  expenses: exactExpensesContract,
} as const;

export type FinancialClient = ContractRouterClient<typeof financialContract>;
