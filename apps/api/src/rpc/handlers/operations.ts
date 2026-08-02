import { implement } from "@orpc/server";

import type {
  ProjectAssignmentCreateInput,
  ProjectAssignmentEndInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  WarehouseAssignmentCreateInput,
  WarehouseAssignmentEndInput,
  WarehouseCreateInput,
  WarehouseUpdateInput,
} from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type {
  ProjectAssignmentListFilters,
  ProjectListFilters,
  WarehouseAssignmentListFilters,
  WarehouseListFilters,
} from "../../modules/company/company.types";
import type { OperationsService } from "../../modules/company/operations.service";
import type { RpcMiddleware } from "../rpc-middleware";
import type { IdInput } from "./handler-inputs";

export function createOperationsHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  operationsService: OperationsService,
) {
  return {
    projectsList: os.projectsList.handler(m.queryAuth(async ({ input }) =>
      operationsService.listProjects(input as ProjectListFilters | undefined)
    )),
    projectsGet: os.projectsGet.handler(m.queryAuth(async ({ input }) =>
      operationsService.getProject((input as IdInput).id)
    )),
    projectsCreate: os.projectsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.createProject(input as ProjectCreateInput, auditContext),
      toFailureResult,
    )),
    projectsUpdate: os.projectsUpdate.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.updateProject(input as ProjectUpdateInput, auditContext),
      toFailureResult,
    )),
    warehousesList: os.warehousesList.handler(m.queryAuth(async ({ input }) =>
      operationsService.listWarehouses(input as WarehouseListFilters | undefined)
    )),
    warehousesGet: os.warehousesGet.handler(m.queryAuth(async ({ input }) =>
      operationsService.getWarehouse((input as IdInput).id)
    )),
    warehousesCreate: os.warehousesCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.createWarehouse(input as WarehouseCreateInput, auditContext),
      toFailureResult,
    )),
    warehousesUpdate: os.warehousesUpdate.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.updateWarehouse(input as WarehouseUpdateInput, auditContext),
      toFailureResult,
    )),
    projectAssignmentsList: os.projectAssignmentsList.handler(m.queryAuth(async ({ input }) =>
      operationsService.listProjectAssignments(input as ProjectAssignmentListFilters | undefined)
    )),
    projectAssignmentsGet: os.projectAssignmentsGet.handler(m.queryAuth(async ({ input }) =>
      operationsService.getProjectAssignment((input as IdInput).id)
    )),
    projectAssignmentsCreate: os.projectAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.createProjectAssignment(input as ProjectAssignmentCreateInput, auditContext),
      toFailureResult,
    )),
    projectAssignmentsEnd: os.projectAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.endProjectAssignment(input as ProjectAssignmentEndInput, auditContext),
      toFailureResult,
    )),
    warehouseAssignmentsList: os.warehouseAssignmentsList.handler(m.queryAuth(async ({ input }) =>
      operationsService.listWarehouseAssignments(input as WarehouseAssignmentListFilters | undefined)
    )),
    warehouseAssignmentsGet: os.warehouseAssignmentsGet.handler(m.queryAuth(async ({ input }) =>
      operationsService.getWarehouseAssignment((input as IdInput).id)
    )),
    warehouseAssignmentsCreate: os.warehouseAssignmentsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.createWarehouseAssignment(input as WarehouseAssignmentCreateInput, auditContext),
      toFailureResult,
    )),
    warehouseAssignmentsEnd: os.warehouseAssignmentsEnd.handler(m.mutationAudit(
      ({ input, auditContext }) => operationsService.endWarehouseAssignment(input as WarehouseAssignmentEndInput, auditContext),
      toFailureResult,
    )),
  };
}
