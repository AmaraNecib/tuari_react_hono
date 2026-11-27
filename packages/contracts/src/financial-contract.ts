import { oc, type ContractRouterClient } from "@orpc/contract";
export { isContractProcedure as isFinancialContractProcedure } from "@orpc/contract";
import { workspaceMetadataSchema } from "./workspace";
import { exactDebtsContract } from "./debts-exact-contract";
import { exactInvoicesContract } from "./invoice-exact-contract";
import { experimentalExactInvoicesContract } from "./experimental-invoice-exact-contract";
import { exactInventoryContract } from "./inventory-exact-contract";
import { exactExpensesContract } from "./expenses-exact-contract";
import { manualSettlementContract } from "./manual-settlement";
import { experimentalSettlementContract } from "./experimental-settlement";
import { exactReportsContract } from "./exact-reports-contract";

/** One decimal-string interface for the financial graph, including opt-in experimental namespaces. */
export const financialContract = {
  manualSettlement: manualSettlementContract,
  experimentalSettlement: experimentalSettlementContract,
  metadata: oc.output(workspaceMetadataSchema),
  debts: exactDebtsContract,
  invoices: exactInvoicesContract,
  experimentalInvoices: experimentalExactInvoicesContract,
  inventory: exactInventoryContract,
  expenses: exactExpensesContract,
  reports: exactReportsContract,
} as const;

export type FinancialClient = ContractRouterClient<typeof financialContract>;
