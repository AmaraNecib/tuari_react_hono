import type { OperationsRepository } from "../operations.repository";
import type { SqliteCompanyRepository } from "../sqlite-company.repository";
import type {
  MutationAuditContext,
  ProjectAssignmentCreateData, ProjectAssignmentEndData,
  ProjectAssignmentListFilters, ProjectCreateData, ProjectListFilters,
  ProjectManagerOwnershipHistoryListFilters, ProjectManagerOwnershipHistoryRecord,
  ProjectRecord, ProjectUpdateData,
  WarehouseAssignmentCreateData, WarehouseAssignmentEndData,
  WarehouseAssignmentListFilters, WarehouseCreateData, WarehouseListFilters,
  WarehouseManagerOwnershipHistoryListFilters, WarehouseManagerOwnershipHistoryRecord,
  WarehouseRecord, WarehouseUpdateData,
  EmployeeProjectAssignmentRecord, EmployeeWarehouseAssignmentRecord,
} from "../company.types";

export class SqliteOperationsRepository implements OperationsRepository {
  constructor(private readonly inner: SqliteCompanyRepository) {}
  listProjects(filters?: ProjectListFilters): ProjectRecord[] { return this.inner.listProjects(filters); }
  getProjectById(id: string): ProjectRecord | null { return this.inner.getProjectById(id); }
  createProject(data: ProjectCreateData, audit?: MutationAuditContext): ProjectRecord { return this.inner.createProject(data, audit); }
  updateProject(data: ProjectUpdateData, audit?: MutationAuditContext): ProjectRecord | null { return this.inner.updateProject(data, audit); }
  listWarehouses(filters?: WarehouseListFilters): WarehouseRecord[] { return this.inner.listWarehouses(filters); }
  getWarehouseById(id: string): WarehouseRecord | null { return this.inner.getWarehouseById(id); }
  createWarehouse(data: WarehouseCreateData, audit?: MutationAuditContext): WarehouseRecord { return this.inner.createWarehouse(data, audit); }
  updateWarehouse(data: WarehouseUpdateData, audit?: MutationAuditContext): WarehouseRecord | null { return this.inner.updateWarehouse(data, audit); }
  listProjectAssignments(filters?: ProjectAssignmentListFilters): EmployeeProjectAssignmentRecord[] { return this.inner.listProjectAssignments(filters); }
  getProjectAssignmentById(id: string): EmployeeProjectAssignmentRecord | null { return this.inner.getProjectAssignmentById(id); }
  getActiveProjectAssignmentByEmployeeId(employeeId: string): EmployeeProjectAssignmentRecord | null { return this.inner.getActiveProjectAssignmentByEmployeeId(employeeId); }
  createProjectAssignment(data: ProjectAssignmentCreateData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord { return this.inner.createProjectAssignment(data, audit); }
  endProjectAssignment(data: ProjectAssignmentEndData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord | null { return this.inner.endProjectAssignment(data, audit); }
  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters): EmployeeWarehouseAssignmentRecord[] { return this.inner.listWarehouseAssignments(filters); }
  getWarehouseAssignmentById(id: string): EmployeeWarehouseAssignmentRecord | null { return this.inner.getWarehouseAssignmentById(id); }
  getActiveWarehouseAssignmentByEmployeeId(employeeId: string): EmployeeWarehouseAssignmentRecord | null { return this.inner.getActiveWarehouseAssignmentByEmployeeId(employeeId); }
  createWarehouseAssignment(data: WarehouseAssignmentCreateData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord { return this.inner.createWarehouseAssignment(data, audit); }
  endWarehouseAssignment(data: WarehouseAssignmentEndData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord | null { return this.inner.endWarehouseAssignment(data, audit); }
  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters): ProjectManagerOwnershipHistoryRecord[] { return this.inner.listProjectManagerOwnershipHistory(filters); }
  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters): WarehouseManagerOwnershipHistoryRecord[] { return this.inner.listWarehouseManagerOwnershipHistory(filters); }
}
