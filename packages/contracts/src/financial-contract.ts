import { oc, type ContractRouterClient } from "@orpc/contract";
export { isContractProcedure as isFinancialContractProcedure } from "@orpc/contract";
import { workspaceMetadataSchema } from "./workspace";
import { exactDebtsContract } from "./debts-exact-contract";
import { exactInvoicesContract } from "./invoice-exact-contract";
import { exactInventoryContract } from "./inventory-exact-contract";
import { exactExpensesContract } from "./expenses-exact-contract";
import { manualSettlementContract } from "./manual-settlement";
import { exactReportsContract } from "./exact-reports-contract";

/** One decimal-string interface for the normal application's financial graph. */
export const financialContract = {
  manualSettlement: manualSettlementContract,
  metadata: oc.output(workspaceMetadataSchema),
  debts: exactDebtsContract,
  invoices: exactInvoicesContract,
  inventory: exactInventoryContract,
  expenses: exactExpensesContract,
  reports: exactReportsContract,
} as const;

export type FinancialClient = ContractRouterClient<typeof financialContract>;
