/**
 * Workforce repository interface.
 *
 * Owns the data-access seam for the workforce domain: roles,
 * employees, manager assignments, employee workplace, managed
 * project/warehouse sync, salary payments, and employee state
 * history.
 *
 * The interface is intentionally narrow. The Drizzle-based
 * implementation lives in `company.repository.ts` (alongside the
 * other domain repos) for now; a future PR can move it into a
 * dedicated adapter following the `employee.repository.ts` /
 * `adapters/employee.repository.ts` split.
 */

import type {
  EmployeeBatchCreateData,
  EmployeeBatchCreateResultRecord,
  EmployeeCreateData,
  EmployeeListFilters,
  EmployeeManagerAssignmentRecord,
  EmployeeRecord,
  EmployeeSalaryPaymentCreateData,
  EmployeeSalaryPaymentListFilters,
  EmployeeSalaryPaymentRecord,
  EmployeeStateHistoryListFilters,
  EmployeeStateHistoryRecord,
  EmployeeUpdateData,
  EmployeeWorkplaceAssignmentData,
  EmployeeManagedProjectsSyncData,
  EmployeeManagedWarehousesSyncData,
  ManagerAssignmentCreateData,
  ManagerAssignmentEndData,
  ManagerAssignmentListFilters,
  MutationAuditContext,
  RoleCreateData,
  RoleRecord,
  RoleUpdateData,
} from "./company.types";

export interface WorkforceRepository {
  // Roles
  listRoles(): RoleRecord[];
  getRoleById(id: string): RoleRecord | null;
  getRoleByKey(key: string): RoleRecord | null;
  createRole(data: RoleCreateData): RoleRecord;
  updateRole(data: RoleUpdateData): RoleRecord | null;
  deleteRole(id: string): boolean;
  countEmployeesByRoleId(roleId: string): number;

  // Employees
  listEmployees(filters?: EmployeeListFilters): EmployeeRecord[];
  /**
   * Cursor-paginated employee list. The cursor is opaque (produced
   * by `encodeCursor` in `modules/shared/cursor.ts`). Returns the
   * page sorted by `(created_at DESC, id DESC)` plus the total
   * count matching the filter.
   */
  listEmployeesPaged(query: {
    filters?: EmployeeListFilters;
    cursor?: string;
    limit: number;
  }): { items: EmployeeRecord[]; total: number; nextCursor: string | null };
  getEmployeeById(id: string): EmployeeRecord | null;
  getEmployeeByPhone(phone: string): EmployeeRecord | null;
  createEmployee(
    data: EmployeeCreateData,
    auditContext?: MutationAuditContext,
  ): EmployeeRecord;
  createEmployeesBatch(
    data: EmployeeBatchCreateData[],
    auditContext?: MutationAuditContext,
  ): EmployeeBatchCreateResultRecord;
  updateEmployee(
    data: EmployeeUpdateData,
    auditContext?: MutationAuditContext,
  ): EmployeeRecord | null;
  deleteEmployee(id: string): boolean;
  upsertEmployee(
    data: EmployeeCreateData | (EmployeeUpdateData & { id: string }),
  ): EmployeeRecord;

  // Workplace + managed assignment sync
  assignEmployeeWorkplace(
    data: EmployeeWorkplaceAssignmentData,
    auditContext?: MutationAuditContext,
  ): void;
  syncManagedProjects(
    data: EmployeeManagedProjectsSyncData,
    auditContext?: MutationAuditContext,
  ): void;
  syncManagedWarehouses(
    data: EmployeeManagedWarehousesSyncData,
    auditContext?: MutationAuditContext,
  ): void;

  // Manager assignments (worker → project manager)
  listManagerAssignments(
    filters?: ManagerAssignmentListFilters,
  ): EmployeeManagerAssignmentRecord[];
  getManagerAssignmentById(id: string): EmployeeManagerAssignmentRecord | null;
  getActiveManagerAssignmentByWorkerId(
    workerId: string,
  ): EmployeeManagerAssignmentRecord | null;
  createManagerAssignment(
    data: ManagerAssignmentCreateData,
    auditContext?: MutationAuditContext,
  ): EmployeeManagerAssignmentRecord;
  endManagerAssignment(
    data: ManagerAssignmentEndData,
    auditContext?: MutationAuditContext,
  ): EmployeeManagerAssignmentRecord | null;

  // Employee state + ownership history
  listEmployeeStateHistory(
    filters?: EmployeeStateHistoryListFilters,
  ): EmployeeStateHistoryRecord[];

  // Salary payments
  listSalaryPayments(
    filters?: EmployeeSalaryPaymentListFilters,
  ): EmployeeSalaryPaymentRecord[];
  createSalaryPayment(
    data: EmployeeSalaryPaymentCreateData,
    auditContext?: MutationAuditContext,
  ): EmployeeSalaryPaymentRecord;
}
