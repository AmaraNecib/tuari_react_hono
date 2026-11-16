import { implement } from "@orpc/server";
import { slice543Contract } from "@tuari/contracts";
import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { WorkforceService } from "../modules/company/workforce.service";
import type { OperationsService } from "../modules/company/operations.service";
import type { ExactEmployeeService } from "../modules/company/employee-exact.service";
import type { ExactWorkforceService } from "../modules/company/workforce-exact.service";
import type { RoleModule } from "../modules/rbac/role.module";
import type { BackupService } from "../modules/backup/backup.types";
import type { BackupFolderPersister } from "../infrastructure/config/backup-folder-persister";
import type { RpcContext } from "./context";
import { createAlgeriaTimestamp } from "../modules/company/company-time";
import { getCurrentUser } from "./context";
import { createRpcMiddleware } from "./rpc-middleware";
import { createExactEmployeeRouter } from "./employee-exact-router";
import { createExactWorkforceEarningsRouter } from "./workforce-exact-earnings-router";
import { createOperationsHandlers } from "./handlers/operations";
import { createBackupHandlers } from "./handlers/backup";
import { createRbacHandlers } from "./handlers/rbac";

type Slice543RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "getSetupStatus" | "bootstrapFirstUser" | "isBootstrapOwner">;
  workforceService: WorkforceService;
  operationsService: OperationsService;
  exactEmployeeService: ExactEmployeeService;
  exactWorkforceService: ExactWorkforceService;
  roleModule: RoleModule;
  backupService: BackupService;
  backupFolderPersister: BackupFolderPersister;
};

const slice543Capabilities = {
  employees: "exact",
  approvedEarnings: "available",
  projectLaborCost: "exact-ledger",
  cashPayments: "unavailable",
  advances: "unavailable",
  openings: "unavailable",
  corrections: "unavailable",
  invoices: "unavailable",
  inventoryMoney: "unavailable",
  expenses: "unavailable",
  monetaryReports: "unavailable",
  fullProjectCost: "unavailable",
} as const;

export function createSlice543Router(
  dependencies: Slice543RouterDependencies,
  options: { trustProxyHeaders?: boolean } = {},
) {
  const os = implement(slice543Contract).$context<RpcContext>();
  const middleware = createRpcMiddleware({
    authBootstrapService: dependencies.authBootstrapService,
    trustProxyHeaders: options.trustProxyHeaders,
  });
  const operations = createOperationsHandlers(os, middleware, dependencies.operationsService);
  const exactEmployees = createExactEmployeeRouter(dependencies.exactEmployeeService, middleware);
  const exactEarnings = createExactWorkforceEarningsRouter(dependencies.exactWorkforceService, middleware);
  const allHandlers = {
    health: os.health.handler(() => ({ status: "ok", timestamp: createAlgeriaTimestamp() })),
    session: os.session.handler(async ({ context }) => ({ user: await getCurrentUser(context) })),
    authSetupStatus: os.authSetupStatus.handler(async () => dependencies.authBootstrapService.getSetupStatus()),
    authBootstrap: os.authBootstrap.handler(async ({ context, input }) => {
      middleware.rateLimit(context);
      return dependencies.authBootstrapService.bootstrapFirstUser(input);
    }),
    rolesList: os.rolesList.handler(middleware.withPermission("employees:read", middleware.withAuth(async () => dependencies.workforceService.listRoles()))),
    rolesGet: os.rolesGet.handler(middleware.withPermission("employees:read", middleware.withAuth(async ({ input }) => dependencies.workforceService.getRole(input.id)))),
    projectManagerOwnershipHistoryList: os.projectManagerOwnershipHistoryList.handler(middleware.queryAuth(async ({ input }) => dependencies.workforceService.listProjectManagerOwnershipHistory(input))),
    warehouseManagerOwnershipHistoryList: os.warehouseManagerOwnershipHistoryList.handler(middleware.queryAuth(async ({ input }) => dependencies.workforceService.listWarehouseManagerOwnershipHistory(input))),
    ...exactEmployees,
    ...operations,
    ...createBackupHandlers(os, middleware, dependencies.backupService, dependencies.backupFolderPersister),
    ...createRbacHandlers(os, middleware, dependencies.roleModule),
    slice543Capabilities: os.slice543Capabilities.handler(middleware.withAuth(async () => slice543Capabilities)),
    workforceExact: exactEarnings,
  };
  return os.router(allHandlers);
}
