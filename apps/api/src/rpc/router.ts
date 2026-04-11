import { implement, ORPCError } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../modules/company/company.errors";
import { createAlgeriaTimestamp } from "../modules/company/company-time";
import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { CompanyService } from "../modules/company/company.service";
import { getCurrentUser, requireCurrentUser, type RpcContext } from "./context";

type RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "getSetupStatus" | "bootstrapFirstUser" | "isBootstrapOwner">;
  companyService: CompanyService;
};

function resolveCompanyResult<T>(operation: () => T) {
  try {
    return operation();
  } catch (error) {
    return toFailureResult(error);
  }
}

async function requireWorkspaceAdmin(context: RpcContext, dependencies: RouterDependencies) {
  const currentUser = await requireCurrentUser(context);

  if (!(await dependencies.authBootstrapService.isBootstrapOwner(currentUser.id))) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي.",
    });
  }

  return currentUser
}

async function createMutationAuditContext(context: RpcContext, dependencies: RouterDependencies) {
  const currentUser = await requireWorkspaceAdmin(context, dependencies)

  return {
    actorUserId: currentUser.id,
    actorLabel: currentUser.name ?? currentUser.phone,
    transactionId: crypto.randomUUID(),
  }
}

export function createRouter(dependencies: RouterDependencies) {
  const os = implement(appContract).$context<RpcContext>();

  return os.router({
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
    workspaceSnapshot: os.workspaceSnapshot.handler(async ({ context }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.getWorkspaceSnapshot()
    }),
    rolesList: os.rolesList.handler(async ({ context }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return dependencies.companyService.listRoles();
    }),
    rolesGet: os.rolesGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.getRole(input.id));
    }),
    rolesCreate: os.rolesCreate.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.createRole(input));
    }),
    rolesUpdate: os.rolesUpdate.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.updateRole(input));
    }),
    rolesDelete: os.rolesDelete.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.deleteRole(input.id));
    }),
    employeesList: os.employeesList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return dependencies.companyService.listEmployees(input ?? undefined);
    }),
    employeesGet: os.employeesGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.getEmployee(input.id));
    }),
    employeesCreate: os.employeesCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createEmployee(input, auditContext));
    }),
    employeesBatchCreate: os.employeesBatchCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createEmployeesBatch(input, auditContext));
    }),
    employeesUpdate: os.employeesUpdate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.updateEmployee(input, auditContext));
    }),
    employeesDelete: os.employeesDelete.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.deleteEmployee(input.id));
    }),
    employeesAssignWorkplace: os.employeesAssignWorkplace.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.assignEmployeeWorkplace(input, auditContext));
    }),
    employeesSyncManagedProjects: os.employeesSyncManagedProjects.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.syncManagedProjects(input, auditContext));
    }),
    employeesSyncManagedWarehouses: os.employeesSyncManagedWarehouses.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.syncManagedWarehouses(input, auditContext));
    }),
    projectsList: os.projectsList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return dependencies.companyService.listProjects(input ?? undefined);
    }),
    projectsGet: os.projectsGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.getProject(input.id));
    }),
    projectsCreate: os.projectsCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createProject(input, auditContext));
    }),
    projectsUpdate: os.projectsUpdate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.updateProject(input, auditContext));
    }),
    warehousesList: os.warehousesList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return dependencies.companyService.listWarehouses(input ?? undefined);
    }),
    warehousesGet: os.warehousesGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.getWarehouse(input.id));
    }),
    warehousesCreate: os.warehousesCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createWarehouse(input, auditContext));
    }),
    warehousesUpdate: os.warehousesUpdate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.updateWarehouse(input, auditContext));
    }),
    managerAssignmentsList: os.managerAssignmentsList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return dependencies.companyService.listManagerAssignments(input ?? undefined);
    }),
    managerAssignmentsGet: os.managerAssignmentsGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() =>
        dependencies.companyService.getManagerAssignment(input.id),
      );
    }),
    managerAssignmentsCreate: os.managerAssignmentsCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() =>
        dependencies.companyService.createManagerAssignment(input, auditContext),
      );
    }),
    managerAssignmentsEnd: os.managerAssignmentsEnd.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.endManagerAssignment(input, auditContext));
    }),
    projectAssignmentsList: os.projectAssignmentsList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return dependencies.companyService.listProjectAssignments(input ?? undefined);
    }),
    projectAssignmentsGet: os.projectAssignmentsGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() =>
        dependencies.companyService.getProjectAssignment(input.id),
      );
    }),
    projectAssignmentsCreate: os.projectAssignmentsCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() =>
        dependencies.companyService.createProjectAssignment(input, auditContext),
      );
    }),
    projectAssignmentsEnd: os.projectAssignmentsEnd.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.endProjectAssignment(input, auditContext));
    }),
    warehouseAssignmentsList: os.warehouseAssignmentsList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return dependencies.companyService.listWarehouseAssignments(input ?? undefined);
    }),
    warehouseAssignmentsGet: os.warehouseAssignmentsGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies);
      return resolveCompanyResult(() => dependencies.companyService.getWarehouseAssignment(input.id));
    }),
    warehouseAssignmentsCreate: os.warehouseAssignmentsCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createWarehouseAssignment(input, auditContext));
    }),
    warehouseAssignmentsEnd: os.warehouseAssignmentsEnd.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.endWarehouseAssignment(input, auditContext));
    }),
    employeeStateHistoryList: os.employeeStateHistoryList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listEmployeeStateHistory(input ?? undefined)
    }),
    projectManagerOwnershipHistoryList: os.projectManagerOwnershipHistoryList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listProjectManagerOwnershipHistory(input ?? undefined)
    }),
    warehouseManagerOwnershipHistoryList: os.warehouseManagerOwnershipHistoryList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listWarehouseManagerOwnershipHistory(input ?? undefined)
    }),
    salaryPaymentsList: os.salaryPaymentsList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listSalaryPayments(input ?? undefined)
    }),
    salaryPaymentsCreate: os.salaryPaymentsCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createSalaryPayment(input, auditContext))
    }),
    externalCounterpartiesList: os.externalCounterpartiesList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listExternalCounterparties(input ?? undefined)
    }),
    externalCounterpartiesGet: os.externalCounterpartiesGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.getExternalCounterparty(input.id))
    }),
    externalCounterpartiesCreate: os.externalCounterpartiesCreate.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createExternalCounterparty(input))
    }),
    debtAccountsList: os.debtAccountsList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listDebtAccounts(input ?? undefined)
    }),
    debtAccountsGet: os.debtAccountsGet.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.getDebtAccount(input.id))
    }),
    debtAccountsCreate: os.debtAccountsCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createDebtAccount(input, auditContext))
    }),
    debtEntriesList: os.debtEntriesList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listDebtEntries(input)
    }),
    debtEntriesCreate: os.debtEntriesCreate.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.createDebtEntry(input, auditContext))
    }),
    debtClosureLinksList: os.debtClosureLinksList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listDebtClosureLinks(input)
    }),
    debtCloseAgainst: os.debtCloseAgainst.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.closeDebtAgainstAnother(input, auditContext))
    }),
    debtAccountsSettle: os.debtAccountsSettle.handler(async ({ context, input }) => {
      const auditContext = await createMutationAuditContext(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.settleDebtAccount(input, auditContext))
    }),
    debtPartyDetail: os.debtPartyDetail.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return resolveCompanyResult(() => dependencies.companyService.getDebtPartyDetail(input))
    }),
    debtsSummary: os.debtsSummary.handler(async ({ context }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listDebtsSummary()
    }),
    systemLogList: os.systemLogList.handler(async ({ context, input }) => {
      await requireWorkspaceAdmin(context, dependencies)
      return dependencies.companyService.listSystemLog(input ?? undefined)
    }),
  });
}
