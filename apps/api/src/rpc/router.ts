import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { createAlgeriaTimestamp } from "../modules/company/company-time";
import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { CompanyService } from "../modules/company/company.service";
import type { WorkforceService } from "../modules/company/workforce.service";
import type { OperationsService } from "../modules/company/operations.service";
import type { FinanceService } from "../modules/company/finance.service";
import type { InventoryService } from "../modules/inventory/inventory.service";
import type { EmployeeModule } from "../modules/workforce/employee.module";
import type { InvoiceModule } from "../modules/invoice/invoice.module";
import { getCurrentUser, type RpcContext } from "./context";
import { createRpcMiddleware } from "./rpc-middleware";
import { createWorkforceHandlers } from "./handlers/workforce";
import { createOperationsHandlers } from "./handlers/operations";
import { createFinanceHandlers } from "./handlers/finance";
import { createInventoryHandlers } from "./handlers/inventory";
import { createSystemHandlers } from "./handlers/system";
import { createReportsHandlers } from "./handlers/reports";
import { createInvoiceHandlers } from "./handlers/invoice";

type RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "getSetupStatus" | "bootstrapFirstUser" | "isBootstrapOwner">;
  companyService: CompanyService;
  workforceService: WorkforceService;
  operationsService: OperationsService;
  financeService: FinanceService;
  inventoryService: InventoryService;
  employeeModule: EmployeeModule;
  invoiceModule: InvoiceModule;
};

export function createRouter(dependencies: RouterDependencies) {
  const os = implement(appContract).$context<RpcContext>();
  const m = createRpcMiddleware({
    authBootstrapService: dependencies.authBootstrapService,
  });

  const baseHandlers = {
    health: os.health.handler(() => ({
      status: "ok",
      timestamp: createAlgeriaTimestamp(),
    })),
    session: os.session.handler(async ({ context }) => ({
      user: await getCurrentUser(context),
    })),
    authSetupStatus: os.authSetupStatus.handler(async () =>
      dependencies.authBootstrapService.getSetupStatus(),
    ),
    authBootstrap: os.authBootstrap.handler(async ({ input }) =>
      dependencies.authBootstrapService.bootstrapFirstUser(input),
    ),
  };

  const allHandlers = Object.assign(
    baseHandlers,
    createSystemHandlers(os, m, dependencies.companyService),
    createWorkforceHandlers(os, m, dependencies.workforceService, dependencies.employeeModule),
    createOperationsHandlers(os, m, dependencies.operationsService),
    createFinanceHandlers(os, m, dependencies.financeService),
    createInventoryHandlers(os, m, dependencies.inventoryService),
    createReportsHandlers(os, m, dependencies.companyService, dependencies.inventoryService),
    createInvoiceHandlers(os, m, dependencies.invoiceModule),
  );

  return os.router(allHandlers as any);
}
