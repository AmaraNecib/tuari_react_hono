import { implement } from "@orpc/server";
import { financialContract, type WorkspaceMetadata } from "@tuari/contracts";
import type { FinancialDependencies } from "../app/financial-dependencies";
import type { RpcContext } from "./context";
import type { RpcMiddleware } from "./rpc-middleware";
import { createExactDebtsRouter } from "./debts-exact-router";
import { createExactInvoicesRouter } from "./invoice-exact-router";
import { createExactInventoryRouter } from "./inventory-exact-router";
import { createExactExpensesRouter } from "./expenses-exact-router";

/** Bind one root-owned graph; every branch uses the application's auth middleware. */
export function createFinancialRouter(
  services: FinancialDependencies,
  getMetadata: () => Promise<WorkspaceMetadata>,
  middleware: RpcMiddleware,
) {
  const os = implement(financialContract).$context<RpcContext>();
  return os.router({
    metadata: os.metadata.handler(middleware.queryAuth(async () => getMetadata())),
    debts: createExactDebtsRouter(services.finance, middleware),
    invoices: createExactInvoicesRouter(services.invoices, middleware),
    inventory: createExactInventoryRouter(services.inventory, middleware),
    expenses: createExactExpensesRouter(services.expenses, middleware),
  });
}
