import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { createAlgeriaTimestamp } from "../modules/company/company-time";
import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { CompanyService } from "../modules/company/company.service";
import type { InventoryService } from "../modules/inventory/inventory.service";
import { getCurrentUser, type RpcContext } from "./context";
import { createRpcMiddleware } from "./rpc-middleware";
import { createWorkforceHandlers } from "./handlers/workforce";
import { createOperationsHandlers } from "./handlers/operations";
import { createFinanceHandlers } from "./handlers/finance";
import { createInventoryHandlers } from "./handlers/inventory";
import { createSystemHandlers } from "./handlers/system";

type RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "getSetupStatus" | "bootstrapFirstUser" | "isBootstrapOwner">;
  companyService: CompanyService;
  inventoryService: InventoryService;
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
    createWorkforceHandlers(os, m, dependencies.companyService),
    createOperationsHandlers(os, m, dependencies.companyService),
    createFinanceHandlers(os, m, dependencies.companyService),
    createInventoryHandlers(os, m, dependencies.inventoryService),
  );

  return os.router(allHandlers as any);
}
