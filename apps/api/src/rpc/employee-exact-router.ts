import { implement, ORPCError } from "@orpc/server";
import { exactEmployeeContract, createEntityResultSchema, createDeleteResultSchema, exactEmployeeSchema, exactEmployeeBatchCreateResultSchema } from "@tuari/contracts";
import { CompanyError, toFailureResult } from "../modules/company/company.errors";
import type { ExactEmployeeService } from "../modules/company/employee-exact.service";
import type { RpcContext } from "./context";
import type { RpcMiddleware, MutationAuditContext } from "./rpc-middleware";
import type { Permission } from "../modules/rbac/permissions";

/** Root replaces the matching top-level handlers in exact mode. No numeric fallback or second employee namespace. */
export function createExactEmployeeRouter(service: ExactEmployeeService, middleware: RpcMiddleware) {
  const os = implement(exactEmployeeContract).$context<RpcContext>();
  const entity = createEntityResultSchema(exactEmployeeSchema);
  const batch = createEntityResultSchema(exactEmployeeBatchCreateResultSchema);
  function mutation<Input, Output>(permission: Permission, handler: (params: { input: Input; auditContext: MutationAuditContext }) => unknown, output: { parse(value: unknown): Output }) {
    const execute = middleware.withPermission(permission, middleware.withAudit(handler, toFailureResult));
    return async (params: { context: RpcContext; input: Input }) => output.parse(await execute(params));
  }
  return os.router({
    employeesList: os.employeesList.handler(middleware.withPermission("employees:read", middleware.withAuth(async ({ input }) => service.listEmployees(input)))),
    employeesListPaged: os.employeesListPaged.handler(middleware.withPermission("employees:read", middleware.withAuth(async ({ input }) => {
      try { return service.listEmployeesPaged(input); }
      catch (error) {
        if (error instanceof CompanyError && error.appError.code === "VALIDATION") throw new ORPCError("BAD_REQUEST", { message: error.message });
        throw error;
      }
    }))),
    employeesGet: os.employeesGet.handler(middleware.withPermission("employees:read", middleware.withAuth(async ({ input }) => service.getEmployee(input.id)))),
    employeesCreate: os.employeesCreate.handler(mutation("employees:create", ({ input, auditContext }) => service.createEmployee(input, auditContext), entity)),
    employeesBatchCreate: os.employeesBatchCreate.handler(mutation("employees:create", ({ input, auditContext }) => service.createEmployeesBatch(input, auditContext), batch)),
    employeesUpdate: os.employeesUpdate.handler(mutation("employees:update", ({ input, auditContext }) => service.updateEmployee(input, auditContext), entity)),
    employeesSave: os.employeesSave.handler(mutation("employees:update", ({ input, auditContext }) => service.saveEmployee(input, auditContext), entity)),
    employeesDelete: os.employeesDelete.handler(mutation("employees:delete", ({ input, auditContext }) => service.deleteEmployee(input.id, auditContext), createDeleteResultSchema)),
    employeesAssignWorkplace: os.employeesAssignWorkplace.handler(mutation("employees:update", ({ input, auditContext }) => service.assignEmployeeWorkplace(input, auditContext), createDeleteResultSchema)),
    employeesSyncManagedProjects: os.employeesSyncManagedProjects.handler(mutation("employees:update", ({ input, auditContext }) => service.syncManagedProjects(input, auditContext), createDeleteResultSchema)),
    employeesSyncManagedWarehouses: os.employeesSyncManagedWarehouses.handler(mutation("employees:update", ({ input, auditContext }) => service.syncManagedWarehouses(input, auditContext), createDeleteResultSchema)),
    employeeStateHistoryList: os.employeeStateHistoryList.handler(middleware.queryAuth(async ({ input }) => service.listEmployeeStateHistory(input))),
  });
}
