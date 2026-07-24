/**
 * Operations repository interface.
 *
 * Owns the data-access seam for the operations domain: projects,
 * warehouses, and their employee assignments + manager ownership
 * history.
 */

import type {
  EmployeeProjectAssignmentRecord,
  EmployeeWarehouseAssignmentRecord,
  MutationAuditContext,
  ProjectAssignmentCreateData,
  ProjectAssignmentEndData,
  ProjectAssignmentListFilters,
  ProjectCreateData,
  ProjectListFilters,
  ProjectManagerOwnershipHistoryListFilters,
  ProjectManagerOwnershipHistoryRecord,
  ProjectRecord,
  ProjectUpdateData,
  WarehouseAssignmentCreateData,
  WarehouseAssignmentEndData,
  WarehouseAssignmentListFilters,
  WarehouseCreateData,
  WarehouseListFilters,
  WarehouseManagerOwnershipHistoryListFilters,
  WarehouseManagerOwnershipHistoryRecord,
  WarehouseRecord,
  WarehouseUpdateData,
} from "./company.types";

export interface OperationsRepository {
  // Projects
  listProjects(filters?: ProjectListFilters): ProjectRecord[];
  getProjectById(id: string): ProjectRecord | null;
  createProject(
    data: ProjectCreateData,
    auditContext?: MutationAuditContext,
  ): ProjectRecord;
  updateProject(
    data: ProjectUpdateData,
    auditContext?: MutationAuditContext,
  ): ProjectRecord | null;

  // Warehouses
  listWarehouses(filters?: WarehouseListFilters): WarehouseRecord[];
  getWarehouseById(id: string): WarehouseRecord | null;
  createWarehouse(
    data: WarehouseCreateData,
    auditContext?: MutationAuditContext,
  ): WarehouseRecord;
  updateWarehouse(
    data: WarehouseUpdateData,
    auditContext?: MutationAuditContext,
  ): WarehouseRecord | null;

  // Project assignments
  listProjectAssignments(
    filters?: ProjectAssignmentListFilters,
  ): EmployeeProjectAssignmentRecord[];
  getProjectAssignmentById(id: string): EmployeeProjectAssignmentRecord | null;
  getActiveProjectAssignmentByEmployeeId(
    employeeId: string,
  ): EmployeeProjectAssignmentRecord | null;
  createProjectAssignment(
    data: ProjectAssignmentCreateData,
    auditContext?: MutationAuditContext,
  ): EmployeeProjectAssignmentRecord;
  endProjectAssignment(
    data: ProjectAssignmentEndData,
    auditContext?: MutationAuditContext,
  ): EmployeeProjectAssignmentRecord | null;

  // Warehouse assignments
  listWarehouseAssignments(
    filters?: WarehouseAssignmentListFilters,
  ): EmployeeWarehouseAssignmentRecord[];
  getWarehouseAssignmentById(id: string): EmployeeWarehouseAssignmentRecord | null;
  getActiveWarehouseAssignmentByEmployeeId(
    employeeId: string,
  ): EmployeeWarehouseAssignmentRecord | null;
  createWarehouseAssignment(
    data: WarehouseAssignmentCreateData,
    auditContext?: MutationAuditContext,
  ): EmployeeWarehouseAssignmentRecord;
  endWarehouseAssignment(
    data: WarehouseAssignmentEndData,
    auditContext?: MutationAuditContext,
  ): EmployeeWarehouseAssignmentRecord | null;

  // Manager ownership history
  listProjectManagerOwnershipHistory(
    filters?: ProjectManagerOwnershipHistoryListFilters,
  ): ProjectManagerOwnershipHistoryRecord[];
  listWarehouseManagerOwnershipHistory(
    filters?: WarehouseManagerOwnershipHistoryListFilters,
  ): WarehouseManagerOwnershipHistoryRecord[];
}
