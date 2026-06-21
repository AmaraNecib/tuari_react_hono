import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type { WorkforceService } from "../../modules/company/workforce.service";
import { InvalidCursorError } from "../../modules/workforce/employee.errors";
import type { EmployeeModule } from "../../modules/workforce/employee.module";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createWorkforceHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  workforceService: WorkforceService,
  employeeModule: EmployeeModule,
): Record<string, any> {
  return {
    rolesList: os.rolesList.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.listRoles();
    })),
    rolesGet: os.rolesGet.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.getRole((input as any).id);
    })),
    rolesCreate: os.rolesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.createRole(input as any),
      toFailureResult,
    )),
    rolesUpdate: os.rolesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.updateRole(input as any),
      toFailureResult,
    )),
    rolesDelete: os.rolesDelete.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.deleteRole((input as any).id),
      toFailureResult,
    )),
    employeesList: os.employeesList.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.listEmployees(input ?? undefined);
    })),
    employeesListPaged: os.employeesListPaged.handler(m.queryAuth(async ({ context, input }: any) => {
      const opts = input ?? {};
      try {
        const result = await employeeModule.listPaged({
          filters: {
            roleId: opts.roleId,
            status: opts.status,
          },
          cursor: opts.cursor,
          limit: opts.limit,
        });
        return { ...result, hasMore: result.nextCursor !== null };
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          return { success: false as const, error: { code: "INVALID_CURSOR" as const, message: error.message, fieldErrors: [] } };
        }
        throw error;
      }
    })),
    employeesGet: os.employeesGet.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.getEmployee((input as any).id);
    })),
    employeesCreate: os.employeesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.createEmployee(input as any, auditContext),
      toFailureResult,
    )),
    employeesBatchCreate: os.employeesBatchCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.createEmployeesBatch(input as any, auditContext),
      toFailureResult,
    )),
    employeesUpdate: os.employeesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.updateEmployee(input as any, auditContext),
      toFailureResult,
    )),
    employeesDelete: os.employeesDelete.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.deleteEmployee((input as any).id, auditContext),
      toFailureResult,
    )),
    employeesAssignWorkplace: os.employeesAssignWorkplace.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.assignEmployeeWorkplace(input as any, auditContext),
      toFailureResult,
    )),
    employeesSyncManagedProjects: os.employeesSyncManagedProjects.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.syncManagedProjects(input as any, auditContext),
      toFailureResult,
    )),
    employeesSyncManagedWarehouses: os.employeesSyncManagedWarehouses.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.syncManagedWarehouses(input as any, auditContext),
      toFailureResult,
    )),
    managerAssignmentsList: os.managerAssignmentsList.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.listManagerAssignments(input ?? undefined);
    })),
    managerAssignmentsGet: os.managerAssignmentsGet.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.getManagerAssignment((input as any).id);
    })),
    managerAssignmentsCreate: os.managerAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.createManagerAssignment(input as any, auditContext),
      toFailureResult,
    )),
    managerAssignmentsEnd: os.managerAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.endManagerAssignment(input as any, auditContext),
      toFailureResult,
    )),
    salaryPaymentsList: os.salaryPaymentsList.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.listSalaryPayments(input ?? undefined);
    })),
    salaryPaymentsCreate: os.salaryPaymentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => workforceService.createSalaryPayment(input as any, auditContext),
      toFailureResult,
    )),
    employeeStateHistoryList: os.employeeStateHistoryList.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.listEmployeeStateHistory(input ?? undefined);
    })),
    projectManagerOwnershipHistoryList: os.projectManagerOwnershipHistoryList.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.listProjectManagerOwnershipHistory(input ?? undefined);
    })),
    warehouseManagerOwnershipHistoryList: os.warehouseManagerOwnershipHistoryList.handler(m.queryAuth(async ({ context, input }: any) => {
      return workforceService.listWarehouseManagerOwnershipHistory(input ?? undefined);
    })),
  };
}
