import { implement } from "@orpc/server";
import { applicationContract } from "@tuari/contracts";
import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { WorkforceService } from "../modules/company/workforce.service";
import type { OperationsService } from "../modules/company/operations.service";
import type { ExactEmployeeService } from "../modules/company/employee-exact.service";
import type { ExactWorkforceService } from "../modules/company/workforce-exact.service";
import type { RoleModule } from "../modules/rbac/role.module";
import type { BackupService } from "../modules/backup/backup.types";
import type { BackupFolderPersister } from "../infrastructure/config/backup-folder-persister";
import type { RecoveryKeyService } from "../modules/auth/recovery-key.service";
import type { DatabaseKeyManager } from "../infrastructure/database/database-key-manager";
import type { DatabaseKeyPersister } from "../infrastructure/database/database-key-persister";
import type { RpcContext } from "./context";
import { createAlgeriaTimestamp } from "../modules/company/company-time";
import { getCurrentUser } from "./context";
import { createRpcMiddleware } from "./rpc-middleware";
import { createExactEmployeeRouter } from "./employee-exact-router";
import { createExactWorkforceEarningsRouter } from "./workforce-exact-earnings-router";
import { createOperationsHandlers } from "./handlers/operations";
import { createBackupHandlers } from "./handlers/backup";
import { createRbacHandlers } from "./handlers/rbac";
import { createRecoverySecurityHandlers } from "./handlers/system";

export type ApplicationRouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "getSetupStatus" | "bootstrapFirstUser" | "isBootstrapOwner">;
  workforceService: WorkforceService;
  operationsService: OperationsService;
  exactEmployeeService: ExactEmployeeService;
  exactWorkforceService: ExactWorkforceService;
  roleModule: RoleModule;
  backupService: BackupService;
  backupFolderPersister: BackupFolderPersister;
  workspaceId: string;
  recoveryKeyService: RecoveryKeyService;
  databaseKeyManager: DatabaseKeyManager;
  databaseKeyPersister: DatabaseKeyPersister;
};

const applicationCapabilities = {
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

export function createApplicationRouter(
  dependencies: ApplicationRouterDependencies,
  options: { trustProxyHeaders?: boolean } = {},
) {
  const os = implement(applicationContract).$context<RpcContext>();
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
    managerAssignmentsList: os.managerAssignmentsList.handler(middleware.queryAuth(async ({ input }) => dependencies.workforceService.listManagerAssignments(input))),
    projectManagerOwnershipHistoryList: os.projectManagerOwnershipHistoryList.handler(middleware.queryAuth(async ({ input }) => dependencies.workforceService.listProjectManagerOwnershipHistory(input))),
    warehouseManagerOwnershipHistoryList: os.warehouseManagerOwnershipHistoryList.handler(middleware.queryAuth(async ({ input }) => dependencies.workforceService.listWarehouseManagerOwnershipHistory(input))),
    ...exactEmployees,
    ...operations,
    ...createBackupHandlers(os, middleware, dependencies.backupService, dependencies.backupFolderPersister),
    ...createRbacHandlers(os, middleware, dependencies.roleModule),
    ...createRecoverySecurityHandlers(os, middleware, dependencies.recoveryKeyService, dependencies.databaseKeyManager, dependencies.databaseKeyPersister),
    applicationCapabilities: os.applicationCapabilities.handler(middleware.withAuth(async () => ({ ...applicationCapabilities, workspaceId: dependencies.workspaceId }))),
    workforceExact: exactEarnings,
  };
  return os.router(allHandlers);
}
