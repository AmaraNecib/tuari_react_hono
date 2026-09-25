import { implement, ORPCError } from "@orpc/server";

import type {
  EmployeeAssignWorkplaceInput,
  EmployeeBatchCreateInput,
  EmployeeCreateInput,
  EmployeeSalaryPaymentCreateInput,
  EmployeeSaveInput,
  EmployeeSyncManagedProjectsInput,
  EmployeeSyncManagedWarehousesInput,
  EmployeeUpdateInput,
  ManagerAssignmentCreateInput,
  ManagerAssignmentEndInput,
  RoleCreateInput,
  RoleUpdateInput,
} from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type {
  EmployeeListFilters,
  EmployeeSalaryPaymentListFilters,
  EmployeeStateHistoryListFilters,
  ManagerAssignmentListFilters,
  ProjectManagerOwnershipHistoryListFilters,
  WarehouseManagerOwnershipHistoryListFilters,
} from "../../modules/company/company.types";
import type { WorkforceService } from "../../modules/company/workforce.service";
import { InvalidCursorError } from "../../modules/workforce/employee.errors";
import type { EmployeeModule } from "../../modules/workforce/employee.module";
import type { RpcMiddleware } from "../rpc-middleware";
import type { EmployeePagedListInput, IdInput } from "./handler-inputs";

export function createWorkforceHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  workforceService: WorkforceService,
  employeeModule: EmployeeModule,
) {
  return {
    rolesList: os.rolesList.handler(m.queryAuth(async () => {
      return workforceService.listRoles();
    })),
    rolesGet: os.rolesGet.handler(m.queryAuth(async ({ input }) => {
      return workforceService.getRole((input as IdInput).id);
    })),
    rolesCreate: os.rolesCreate.handler(m.mutationAudit(
      ({ input }) => workforceService.createRole(input as RoleCreateInput),
      toFailureResult,
    )),
    rolesUpdate: os.rolesUpdate.handler(m.mutationAudit(
      ({ input }) => workforceService.updateRole(input as RoleUpdateInput),
      toFailureResult,
    )),
    rolesDelete: os.rolesDelete.handler(m.mutationAudit(
      ({ input }) => workforceService.deleteRole((input as IdInput).id),
      toFailureResult,
    )),
    employeesList: os.employeesList.handler(m.withPermission("employees:read", m.withAuth(async ({ input }) => {
      return workforceService.listEmployees(input as EmployeeListFilters | undefined);
    }))),
    employeesListPaged: os.employeesListPaged.handler(m.withPermission("employees:read", m.withAuth(async ({ input }) => {
      const opts = (input as EmployeePagedListInput | undefined) ?? {};
      try {
        const result = await employeeModule.listPaged({
          filters: {
            roleId: opts.roleId,
            status: opts.status,
            search: opts.search,
          },
          cursor: opts.cursor,
          limit: opts.limit,
        });
        return { ...result, hasMore: result.nextCursor !== null };
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          throw new ORPCError("BAD_REQUEST", { message: error.message });
        }
        throw error;
      }
    }))),
    employeesGet: os.employeesGet.handler(m.withPermission("employees:read", m.withAuth(async ({ input }) => {
      return workforceService.getEmployee((input as IdInput).id);
    }))),
    employeesCreate: os.employeesCreate.handler(m.withPermission("employees:create", m.withAudit(
      ({ input, auditContext }) => workforceService.createEmployee(input as EmployeeCreateInput, auditContext),
      toFailureResult,
    ))),
    employeesBatchCreate: os.employeesBatchCreate.handler(m.withPermission("employees:create", m.withAudit(
      ({ input, auditContext }) => workforceService.createEmployeesBatch(input as EmployeeBatchCreateInput, auditContext),
      toFailureResult,
    ))),
    employeesUpdate: os.employeesUpdate.handler(m.withPermission("employees:update", m.withAudit(
      ({ input, auditContext }) => workforceService.updateEmployee(input as EmployeeUpdateInput, auditContext),
      toFailureResult,
    ))),
    employeesSave: os.employeesSave.handler(m.withPermission("employees:update", m.withAudit(
      ({ input, auditContext }) => workforceService.saveEmployee(input as EmployeeSaveInput, auditContext),
      toFailureResult,
    ))),
    employeesDelete: os.employeesDelete.handler(m.withPermission("employees:delete", m.withAudit(
      ({ input, auditContext }) => workforceService.deleteEmployee((input as IdInput).id, auditContext),
      toFailureResult,
    ))),
    employeesAssignWorkplace: os.employeesAssignWorkplace.handler(m.withPermission("employees:update", m.withAudit(
      ({ input, auditContext }) => workforceService.assignEmployeeWorkplace(input as EmployeeAssignWorkplaceInput, auditContext),
      toFailureResult,
    ))),
    employeesSyncManagedProjects: os.employeesSyncManagedProjects.handler(m.withPermission("employees:update", m.withAudit(
      ({ input, auditContext }) => workforceService.syncManagedProjects(input as EmployeeSyncManagedProjectsInput, auditContext),
      toFailureResult,
    ))),
    employeesSyncManagedWarehouses: os.employeesSyncManagedWarehouses.handler(m.withPermission("employees:update", m.withAudit(
      ({ input, auditContext }) => workforceService.syncManagedWarehouses(input as EmployeeSyncManagedWarehousesInput, auditContext),
      toFailureResult,
    ))),
    managerAssignmentsList: os.managerAssignmentsList.handler(m.queryAuth(async ({ input }) => {
      return workforceService.listManagerAssignments(input as ManagerAssignmentListFilters | undefined);
    })),
    managerAssignmentsGet: os.managerAssignmentsGet.handler(m.queryAuth(async ({ input }) => {
      return workforceService.getManagerAssignment((input as IdInput).id);
    })),
    managerAssignmentsCreate: os.managerAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => workforceService.createManagerAssignment(input as ManagerAssignmentCreateInput, auditContext),
      toFailureResult,
    )),
    managerAssignmentsEnd: os.managerAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }) => workforceService.endManagerAssignment(input as ManagerAssignmentEndInput, auditContext),
      toFailureResult,
    )),
    salaryPaymentsList: os.salaryPaymentsList.handler(m.queryAuth(async ({ input }) => {
      return workforceService.listSalaryPayments(input as EmployeeSalaryPaymentListFilters | undefined);
    })),
    salaryPaymentsCreate: os.salaryPaymentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => workforceService.createSalaryPayment(input as EmployeeSalaryPaymentCreateInput, auditContext),
      toFailureResult,
    )),
    employeeStateHistoryList: os.employeeStateHistoryList.handler(m.queryAuth(async ({ input }) => {
      return workforceService.listEmployeeStateHistory(input as EmployeeStateHistoryListFilters | undefined);
    })),
    projectManagerOwnershipHistoryList: os.projectManagerOwnershipHistoryList.handler(m.queryAuth(async ({ input }) => {
      return workforceService.listProjectManagerOwnershipHistory(input as ProjectManagerOwnershipHistoryListFilters | undefined);
    })),
    warehouseManagerOwnershipHistoryList: os.warehouseManagerOwnershipHistoryList.handler(m.queryAuth(async ({ input }) => {
      return workforceService.listWarehouseManagerOwnershipHistory(input as WarehouseManagerOwnershipHistoryListFilters | undefined);
    })),
  };
}
