import { implement, ORPCError } from "@orpc/server";
import { financialContract, isFinancialContractProcedure, type WorkspaceMetadata } from "@tuari/contracts";
import type { FinancialDependencies } from "../app/financial-dependencies";
import type { RpcContext } from "./context";
import type { RpcMiddleware } from "./rpc-middleware";
import { createExactDebtsRouter } from "./debts-exact-router";
import { createExactInvoicesRouter } from "./invoice-exact-router";
import { createExactInventoryRouter } from "./inventory-exact-router";
import { createExactExpensesRouter } from "./expenses-exact-router";
import { createExactReportsRouter, type ExactReportCapability } from "./exact-reports-router";

/** Bind every advertised leaf even when a caller supplies no financial capability. */
export function createUnavailableFinancialRouter(middleware: RpcMiddleware): ReturnType<typeof createFinancialRouter> {
  const os = implement(financialContract).$context<RpcContext>();
  const unavailable = middleware.queryAuth(async () => {
    throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Exact financial composition is not configured" });
  });
  function bind(contract: Record<string, unknown>, implementation: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(contract).map(([key, value]) => {
      const branch = implementation[key];
      if (isFinancialContractProcedure(value)) {
        const procedure = branch as { handler(action: typeof unavailable): unknown };
        return [key, procedure.handler(unavailable)];
      }
      if (value === null || typeof value !== "object") throw new TypeError("Unsupported financial contract branch");
      return [key, bind(value as Record<string, unknown>, branch as Record<string, unknown>)];
    }));
  }
  // The authoritative contract supplies the complete tree. Every handler above
  // throws, so no unvalidated data can cross this erased registration seam.
  return bind(financialContract, os as unknown as Record<string, unknown>) as ReturnType<typeof createFinancialRouter>;
}

/** Bind one root-owned graph; every branch uses the application's auth middleware. */
export function createFinancialRouter(
  services: FinancialDependencies,
  getMetadata: () => Promise<WorkspaceMetadata>,
  middleware: RpcMiddleware,
  reports?: ExactReportCapability,
) {
  const os = implement(financialContract).$context<RpcContext>();
  return os.router({
    metadata: os.metadata.handler(middleware.queryAuth(async () => getMetadata())),
    debts: createExactDebtsRouter(services.finance, middleware),
    invoices: createExactInvoicesRouter(services.invoices, middleware),
    inventory: createExactInventoryRouter(services.inventory, middleware),
    expenses: createExactExpensesRouter(services.expenses, middleware),
    reports: createExactReportsRouter(reports, middleware),
  });
}
