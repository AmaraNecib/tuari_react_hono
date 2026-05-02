import type {
  EmployeeBatchCreateInput,
  EmployeeAssignWorkplaceInput,
  EmployeeCreateInput,
  EmployeeSyncManagedProjectsInput,
  EmployeeSyncManagedWarehousesInput,
  EmployeeSalaryPaymentCreateInput,
  EmployeeUpdateInput,
  ManagerAssignmentCreateInput,
  ManagerAssignmentEndInput,
  RoleCreateInput,
  RoleUpdateInput,
} from "@tuari/contracts";

import type {
  EmployeeSalaryPaymentListFilters,
  EmployeeStateHistoryListFilters,
  EmployeeListFilters,
  ManagerAssignmentListFilters,
  ProjectManagerOwnershipHistoryListFilters,
  WarehouseManagerOwnershipHistoryListFilters,
  MutationAuditContext,
} from "./company.types";
import type { CompanyService } from "./company.service";

export class WorkforceService {
  constructor(private readonly companyService: CompanyService) {}

  listRoles() {
    return this.companyService.listRoles();
  }

  getRole(id: string) {
    return this.companyService.getRole(id);
  }

  createRole(input: RoleCreateInput) {
    return this.companyService.createRole(input);
  }

  updateRole(input: RoleUpdateInput) {
    return this.companyService.updateRole(input);
  }

  deleteRole(id: string) {
    return this.companyService.deleteRole(id);
  }

  listEmployees(filters?: EmployeeListFilters) {
    return this.companyService.listEmployees(filters);
  }

  getEmployee(id: string) {
    return this.companyService.getEmployee(id);
  }

  createEmployee(input: EmployeeCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createEmployee(input, auditContext);
  }

  createEmployeesBatch(input: EmployeeBatchCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createEmployeesBatch(input, auditContext);
  }

  updateEmployee(input: EmployeeUpdateInput, auditContext?: MutationAuditContext) {
    return this.companyService.updateEmployee(input, auditContext);
  }

  deleteEmployee(id: string, auditContext?: MutationAuditContext) {
    return this.companyService.deleteEmployee(id, auditContext);
  }

  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters) {
    return this.companyService.listEmployeeStateHistory(filters);
  }

  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters) {
    return this.companyService.listProjectManagerOwnershipHistory(filters);
  }

  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters) {
    return this.companyService.listWarehouseManagerOwnershipHistory(filters);
  }

  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters) {
    return this.companyService.listSalaryPayments(filters);
  }

  createSalaryPayment(input: EmployeeSalaryPaymentCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createSalaryPayment(input, auditContext);
  }

  listManagerAssignments(filters?: ManagerAssignmentListFilters) {
    return this.companyService.listManagerAssignments(filters);
  }

  getManagerAssignment(id: string) {
    return this.companyService.getManagerAssignment(id);
  }

  createManagerAssignment(input: ManagerAssignmentCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createManagerAssignment(input, auditContext);
  }

  endManagerAssignment(input: ManagerAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.companyService.endManagerAssignment(input, auditContext);
  }

  assignEmployeeWorkplace(input: EmployeeAssignWorkplaceInput, auditContext?: MutationAuditContext) {
    return this.companyService.assignEmployeeWorkplace(input, auditContext);
  }

  syncManagedProjects(input: EmployeeSyncManagedProjectsInput, auditContext?: MutationAuditContext) {
    return this.companyService.syncManagedProjects(input, auditContext);
  }

  syncManagedWarehouses(input: EmployeeSyncManagedWarehousesInput, auditContext?: MutationAuditContext) {
    return this.companyService.syncManagedWarehouses(input, auditContext);
  }
}
