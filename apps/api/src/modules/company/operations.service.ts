import type {
  ProjectCreateInput,
  ProjectUpdateInput,
  WarehouseCreateInput,
  WarehouseUpdateInput,
  ProjectAssignmentCreateInput,
  ProjectAssignmentEndInput,
  WarehouseAssignmentCreateInput,
  WarehouseAssignmentEndInput,
} from "@tuari/contracts";

import type {
  ProjectListFilters,
  WarehouseListFilters,
  ProjectAssignmentListFilters,
  WarehouseAssignmentListFilters,
  MutationAuditContext,
} from "./company.types";
import type { CompanyService } from "./company.service";

export class OperationsService {
  constructor(private readonly companyService: CompanyService) {}

  listProjects(filters?: ProjectListFilters) {
    return this.companyService.listProjects(filters);
  }

  getProject(id: string) {
    return this.companyService.getProject(id);
  }

  createProject(input: ProjectCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createProject(input, auditContext);
  }

  updateProject(input: ProjectUpdateInput, auditContext?: MutationAuditContext) {
    return this.companyService.updateProject(input, auditContext);
  }

  listWarehouses(filters?: WarehouseListFilters) {
    return this.companyService.listWarehouses(filters);
  }

  getWarehouse(id: string) {
    return this.companyService.getWarehouse(id);
  }

  createWarehouse(input: WarehouseCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createWarehouse(input, auditContext);
  }

  updateWarehouse(input: WarehouseUpdateInput, auditContext?: MutationAuditContext) {
    return this.companyService.updateWarehouse(input, auditContext);
  }

  listProjectAssignments(filters?: ProjectAssignmentListFilters) {
    return this.companyService.listProjectAssignments(filters);
  }

  getProjectAssignment(id: string) {
    return this.companyService.getProjectAssignment(id);
  }

  createProjectAssignment(input: ProjectAssignmentCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createProjectAssignment(input, auditContext);
  }

  endProjectAssignment(input: ProjectAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.companyService.endProjectAssignment(input, auditContext);
  }

  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters) {
    return this.companyService.listWarehouseAssignments(filters);
  }

  getWarehouseAssignment(id: string) {
    return this.companyService.getWarehouseAssignment(id);
  }

  createWarehouseAssignment(input: WarehouseAssignmentCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createWarehouseAssignment(input, auditContext);
  }

  endWarehouseAssignment(input: WarehouseAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.companyService.endWarehouseAssignment(input, auditContext);
  }
}
