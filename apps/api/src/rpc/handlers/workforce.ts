import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type { CompanyService } from "../../modules/company/company.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createWorkforceHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
): Record<string, any> {
  return {
    rolesList: os.rolesList.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.listRoles();
    })),
    rolesGet: os.rolesGet.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.getRole((input as any).id);
    })),
    rolesCreate: os.rolesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createRole(input as any),
      toFailureResult,
    )),
    rolesUpdate: os.rolesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.updateRole(input as any),
      toFailureResult,
    )),
    rolesDelete: os.rolesDelete.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.deleteRole((input as any).id),
      toFailureResult,
    )),
    employeesList: os.employeesList.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.listEmployees(input ?? undefined);
    })),
    employeesGet: os.employeesGet.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.getEmployee((input as any).id);
    })),
    employeesCreate: os.employeesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createEmployee(input as any, auditContext),
      toFailureResult,
    )),
    employeesBatchCreate: os.employeesBatchCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createEmployeesBatch(input as any, auditContext),
      toFailureResult,
    )),
    employeesUpdate: os.employeesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.updateEmployee(input as any, auditContext),
      toFailureResult,
    )),
    employeesDelete: os.employeesDelete.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.deleteEmployee((input as any).id, auditContext),
      toFailureResult,
    )),
    employeesAssignWorkplace: os.employeesAssignWorkplace.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.assignEmployeeWorkplace(input as any, auditContext),
      toFailureResult,
    )),
    employeesSyncManagedProjects: os.employeesSyncManagedProjects.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.syncManagedProjects(input as any, auditContext),
      toFailureResult,
    )),
    employeesSyncManagedWarehouses: os.employeesSyncManagedWarehouses.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.syncManagedWarehouses(input as any, auditContext),
      toFailureResult,
    )),
    managerAssignmentsList: os.managerAssignmentsList.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.listManagerAssignments(input ?? undefined);
    })),
    managerAssignmentsGet: os.managerAssignmentsGet.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.getManagerAssignment((input as any).id);
    })),
    managerAssignmentsCreate: os.managerAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createManagerAssignment(input as any, auditContext),
      toFailureResult,
    )),
    managerAssignmentsEnd: os.managerAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.endManagerAssignment(input as any, auditContext),
      toFailureResult,
    )),
    salaryPaymentsList: os.salaryPaymentsList.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.listSalaryPayments(input ?? undefined);
    })),
    salaryPaymentsCreate: os.salaryPaymentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createSalaryPayment(input as any, auditContext),
      toFailureResult,
    )),
    employeeStateHistoryList: os.employeeStateHistoryList.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.listEmployeeStateHistory(input ?? undefined);
    })),
    projectManagerOwnershipHistoryList: os.projectManagerOwnershipHistoryList.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.listProjectManagerOwnershipHistory(input ?? undefined);
    })),
    warehouseManagerOwnershipHistoryList: os.warehouseManagerOwnershipHistoryList.handler(m.queryAuth(async ({ context, input }: any) => {
      return companyService.listWarehouseManagerOwnershipHistory(input ?? undefined);
    })),
  };
}
