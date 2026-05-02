import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type { OperationsService } from "../../modules/company/operations.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createOperationsHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  operationsService: OperationsService,
): Record<string, any> {
  return {
    projectsList: os.projectsList.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.listProjects(input ?? undefined)
    )),
    projectsGet: os.projectsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.getProject((input as any).id)
    )),
    projectsCreate: os.projectsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.createProject(input as any, auditContext),
      toFailureResult,
    )),
    projectsUpdate: os.projectsUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.updateProject(input as any, auditContext),
      toFailureResult,
    )),
    warehousesList: os.warehousesList.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.listWarehouses(input ?? undefined)
    )),
    warehousesGet: os.warehousesGet.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.getWarehouse((input as any).id)
    )),
    warehousesCreate: os.warehousesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.createWarehouse(input as any, auditContext),
      toFailureResult,
    )),
    warehousesUpdate: os.warehousesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.updateWarehouse(input as any, auditContext),
      toFailureResult,
    )),
    projectAssignmentsList: os.projectAssignmentsList.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.listProjectAssignments(input ?? undefined)
    )),
    projectAssignmentsGet: os.projectAssignmentsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.getProjectAssignment((input as any).id)
    )),
    projectAssignmentsCreate: os.projectAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.createProjectAssignment(input as any, auditContext),
      toFailureResult,
    )),
    projectAssignmentsEnd: os.projectAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.endProjectAssignment(input as any, auditContext),
      toFailureResult,
    )),
    warehouseAssignmentsList: os.warehouseAssignmentsList.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.listWarehouseAssignments(input ?? undefined)
    )),
    warehouseAssignmentsGet: os.warehouseAssignmentsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      operationsService.getWarehouseAssignment((input as any).id)
    )),
    warehouseAssignmentsCreate: os.warehouseAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.createWarehouseAssignment(input as any, auditContext),
      toFailureResult,
    )),
    warehouseAssignmentsEnd: os.warehouseAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }: any) => operationsService.endWarehouseAssignment(input as any, auditContext),
      toFailureResult,
    )),
  };
}
