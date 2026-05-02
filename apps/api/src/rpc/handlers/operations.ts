import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type { CompanyService } from "../../modules/company/company.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createOperationsHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
): Record<string, any> {
  return {
    projectsList: os.projectsList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listProjects(input ?? undefined)
    )),
    projectsGet: os.projectsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getProject((input as any).id)
    )),
    projectsCreate: os.projectsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createProject(input as any, auditContext),
      toFailureResult,
    )),
    projectsUpdate: os.projectsUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.updateProject(input as any, auditContext),
      toFailureResult,
    )),
    warehousesList: os.warehousesList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listWarehouses(input ?? undefined)
    )),
    warehousesGet: os.warehousesGet.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getWarehouse((input as any).id)
    )),
    warehousesCreate: os.warehousesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createWarehouse(input as any, auditContext),
      toFailureResult,
    )),
    warehousesUpdate: os.warehousesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.updateWarehouse(input as any, auditContext),
      toFailureResult,
    )),
    projectAssignmentsList: os.projectAssignmentsList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listProjectAssignments(input ?? undefined)
    )),
    projectAssignmentsGet: os.projectAssignmentsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getProjectAssignment((input as any).id)
    )),
    projectAssignmentsCreate: os.projectAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createProjectAssignment(input as any, auditContext),
      toFailureResult,
    )),
    projectAssignmentsEnd: os.projectAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.endProjectAssignment(input as any, auditContext),
      toFailureResult,
    )),
    warehouseAssignmentsList: os.warehouseAssignmentsList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listWarehouseAssignments(input ?? undefined)
    )),
    warehouseAssignmentsGet: os.warehouseAssignmentsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getWarehouseAssignment((input as any).id)
    )),
    warehouseAssignmentsCreate: os.warehouseAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createWarehouseAssignment(input as any, auditContext),
      toFailureResult,
    )),
    warehouseAssignmentsEnd: os.warehouseAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.endWarehouseAssignment(input as any, auditContext),
      toFailureResult,
    )),
  };
}
