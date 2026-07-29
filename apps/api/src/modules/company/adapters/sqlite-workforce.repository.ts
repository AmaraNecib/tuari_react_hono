import type { WorkforceRepository } from "../workforce.repository";
import type { SqliteCompanyRepository } from "../sqlite-company.repository";
import type {
  EmployeeBatchCreateData, EmployeeBatchCreateResultRecord,
  EmployeeCreateData, EmployeeListFilters, EmployeeRecord,
  EmployeeSalaryPaymentCreateData, EmployeeSalaryPaymentListFilters,
  EmployeeSalaryPaymentRecord, EmployeeStateHistoryListFilters,
  EmployeeStateHistoryRecord, EmployeeUpdateData,
  EmployeeWorkplaceAssignmentData, EmployeeManagedProjectsSyncData,
  EmployeeManagedWarehousesSyncData,
  ManagerAssignmentCreateData, ManagerAssignmentEndData,
  ManagerAssignmentListFilters, MutationAuditContext,
  RoleCreateData, RoleRecord, RoleUpdateData,
  EmployeeManagerAssignmentRecord,
} from "../company.types";

export class SqliteWorkforceRepository implements WorkforceRepository {
  constructor(private readonly inner: SqliteCompanyRepository) {}
  listRoles(): RoleRecord[] { return this.inner.listRoles(); }
  getRoleById(id: string): RoleRecord | null { return this.inner.getRoleById(id); }
  getRoleByKey(key: string): RoleRecord | null { return this.inner.getRoleByKey(key); }
  createRole(data: RoleCreateData): RoleRecord { return this.inner.createRole(data); }
  updateRole(data: RoleUpdateData): RoleRecord | null { return this.inner.updateRole(data); }
  deleteRole(id: string): boolean { return this.inner.deleteRole(id); }
  countEmployeesByRoleId(roleId: string): number { return this.inner.countEmployeesByRoleId(roleId); }
  listEmployees(filters?: EmployeeListFilters): EmployeeRecord[] { return this.inner.listEmployees(filters); }
  listEmployeesPaged(query: { filters?: EmployeeListFilters; cursor?: string; limit: number }): { items: EmployeeRecord[]; total: number; nextCursor: string | null } { return this.inner.listEmployeesPaged(query); }
  getEmployeeById(id: string): EmployeeRecord | null { return this.inner.getEmployeeById(id); }
  getEmployeeByPhone(phone: string): EmployeeRecord | null { return this.inner.getEmployeeByPhone(phone); }
  createEmployee(data: EmployeeCreateData, audit?: MutationAuditContext): EmployeeRecord { return this.inner.createEmployee(data, audit); }
  createEmployeesBatch(data: EmployeeBatchCreateData[], audit?: MutationAuditContext): EmployeeBatchCreateResultRecord { return this.inner.createEmployeesBatch(data, audit); }
  updateEmployee(data: EmployeeUpdateData, audit?: MutationAuditContext): EmployeeRecord | null { return this.inner.updateEmployee(data, audit); }
  deleteEmployee(id: string): boolean { return this.inner.deleteEmployee(id); }
  upsertEmployee(data: EmployeeCreateData | (EmployeeUpdateData & { id: string })): EmployeeRecord { return this.inner.upsertEmployee(data); }
  assignEmployeeWorkplace(data: EmployeeWorkplaceAssignmentData, audit?: MutationAuditContext): void { return this.inner.assignEmployeeWorkplace(data, audit); }
  syncManagedProjects(data: EmployeeManagedProjectsSyncData, audit?: MutationAuditContext): void { return this.inner.syncManagedProjects(data, audit); }
  syncManagedWarehouses(data: EmployeeManagedWarehousesSyncData, audit?: MutationAuditContext): void { return this.inner.syncManagedWarehouses(data, audit); }
  listManagerAssignments(filters?: ManagerAssignmentListFilters): EmployeeManagerAssignmentRecord[] { return this.inner.listManagerAssignments(filters); }
  getManagerAssignmentById(id: string): EmployeeManagerAssignmentRecord | null { return this.inner.getManagerAssignmentById(id); }
  getActiveManagerAssignmentByWorkerId(workerId: string): EmployeeManagerAssignmentRecord | null { return this.inner.getActiveManagerAssignmentByWorkerId(workerId); }
  createManagerAssignment(data: ManagerAssignmentCreateData, audit?: MutationAuditContext): EmployeeManagerAssignmentRecord { return this.inner.createManagerAssignment(data, audit); }
  endManagerAssignment(data: ManagerAssignmentEndData, audit?: MutationAuditContext): EmployeeManagerAssignmentRecord | null { return this.inner.endManagerAssignment(data, audit); }
  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters): EmployeeStateHistoryRecord[] { return this.inner.listEmployeeStateHistory(filters); }
  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters): EmployeeSalaryPaymentRecord[] { return this.inner.listSalaryPayments(filters); }
  createSalaryPayment(data: EmployeeSalaryPaymentCreateData, audit?: MutationAuditContext): EmployeeSalaryPaymentRecord { return this.inner.createSalaryPayment(data, audit); }
}
