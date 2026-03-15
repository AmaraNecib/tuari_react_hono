import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../modules/company/company.errors";
import type { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import type { CompanyService } from "../modules/company/company.service";
import { getCurrentUser, requireCurrentUser, type RpcContext } from "./context";

type RouterDependencies = {
  authBootstrapService: Pick<AuthBootstrapService, "getSetupStatus" | "bootstrapFirstUser">;
  companyService: CompanyService;
};

function resolveCompanyResult<T>(operation: () => T) {
  try {
    return operation();
  } catch (error) {
    return toFailureResult(error);
  }
}

export function createRouter(dependencies: RouterDependencies) {
  const os = implement(appContract).$context<RpcContext>();

  return os.router({
    health: os.health.handler(() => ({
      status: "ok",
      timestamp: new Date().toISOString(),
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
    rolesList: os.rolesList.handler(async ({ context }) => {
      await requireCurrentUser(context);
      return dependencies.companyService.listRoles();
    }),
    rolesGet: os.rolesGet.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.getRole(input.id));
    }),
    rolesCreate: os.rolesCreate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.createRole(input));
    }),
    rolesUpdate: os.rolesUpdate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.updateRole(input));
    }),
    rolesDelete: os.rolesDelete.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.deleteRole(input.id));
    }),
    employeesList: os.employeesList.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return dependencies.companyService.listEmployees(input ?? undefined);
    }),
    employeesGet: os.employeesGet.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.getEmployee(input.id));
    }),
    employeesCreate: os.employeesCreate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.createEmployee(input));
    }),
    employeesUpdate: os.employeesUpdate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.updateEmployee(input));
    }),
    projectsList: os.projectsList.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return dependencies.companyService.listProjects(input ?? undefined);
    }),
    projectsGet: os.projectsGet.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.getProject(input.id));
    }),
    projectsCreate: os.projectsCreate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.createProject(input));
    }),
    projectsUpdate: os.projectsUpdate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.updateProject(input));
    }),
    warehousesList: os.warehousesList.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return dependencies.companyService.listWarehouses(input ?? undefined);
    }),
    warehousesGet: os.warehousesGet.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.getWarehouse(input.id));
    }),
    warehousesCreate: os.warehousesCreate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.createWarehouse(input));
    }),
    warehousesUpdate: os.warehousesUpdate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.updateWarehouse(input));
    }),
    managerAssignmentsList: os.managerAssignmentsList.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return dependencies.companyService.listManagerAssignments(input ?? undefined);
    }),
    managerAssignmentsGet: os.managerAssignmentsGet.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() =>
        dependencies.companyService.getManagerAssignment(input.id),
      );
    }),
    managerAssignmentsCreate: os.managerAssignmentsCreate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() =>
        dependencies.companyService.createManagerAssignment(input),
      );
    }),
    managerAssignmentsEnd: os.managerAssignmentsEnd.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.endManagerAssignment(input));
    }),
    projectAssignmentsList: os.projectAssignmentsList.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return dependencies.companyService.listProjectAssignments(input ?? undefined);
    }),
    projectAssignmentsGet: os.projectAssignmentsGet.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() =>
        dependencies.companyService.getProjectAssignment(input.id),
      );
    }),
    projectAssignmentsCreate: os.projectAssignmentsCreate.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() =>
        dependencies.companyService.createProjectAssignment(input),
      );
    }),
    projectAssignmentsEnd: os.projectAssignmentsEnd.handler(async ({ context, input }) => {
      await requireCurrentUser(context);
      return resolveCompanyResult(() => dependencies.companyService.endProjectAssignment(input));
    }),
  });
}
