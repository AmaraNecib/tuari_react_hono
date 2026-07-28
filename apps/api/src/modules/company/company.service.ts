/** Compatibility facade for legacy RPC/test callers; domain services own behavior. */

import type { DebtAccountCreateInput, DebtConsolidationInput, DebtEntryCreateInput, DebtEntryRecordPaymentInput, DebtEntryVoidInput, DebtPartyDetailInput, DebtSettlementInput, EmployeeAssignWorkplaceInput, EmployeeBatchCreateInput, EmployeeCreateInput, EmployeeSalaryPaymentCreateInput, EmployeeSyncManagedProjectsInput, EmployeeSyncManagedWarehousesInput, EmployeeUpdateInput, ExternalCounterpartyCreateInput, ManagerAssignmentCreateInput, ManagerAssignmentEndInput, ProjectAssignmentCreateInput, ProjectAssignmentEndInput, ProjectCreateInput, ProjectUpdateInput, RoleCreateInput, RoleUpdateInput, WarehouseAssignmentCreateInput, WarehouseAssignmentEndInput, WarehouseCreateInput, WarehouseUpdateInput } from "@tuari/contracts";

import type { CompanyRepository } from "./company.repository";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import { WorkforceService } from "./workforce.service";
import { OperationsService } from "./operations.service";
import { FinanceService } from "./finance.service";
import { AuditService } from "./audit.service";
import { type WorkspaceAdminAuthorizer } from "./company.helpers";
import type { DebtAccountListFilters, DebtEntryListFilters, EmployeeListFilters, EmployeeSalaryPaymentListFilters, EmployeeStateHistoryListFilters, ExternalCounterpartyListFilters, ManagerAssignmentListFilters, MutationAuditContext, ProjectAssignmentListFilters, ProjectListFilters, ProjectManagerOwnershipHistoryListFilters, SystemLogListFilters, WarehouseAssignmentListFilters, WarehouseListFilters, WarehouseManagerOwnershipHistoryListFilters } from "./company.types";

export class CompanyService {
  private _mutation?: WorkspaceMutationContext;
  readonly workforce: WorkforceService;
  readonly operations: OperationsService;
  readonly finance: FinanceService;
  readonly audit: AuditService;

  constructor(
    private readonly repository: CompanyRepository,
    private readonly workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer,
    injected?: {
      workforce?: WorkforceService;
      operations?: OperationsService;
      finance?: FinanceService;
      audit?: AuditService;
    },
  ) {
    this.workforce = injected?.workforce ?? new WorkforceService(repository, this.mutation);
    this.operations = injected?.operations ?? new OperationsService(repository, this.mutation);
    this.finance = injected?.finance ?? new FinanceService(repository, this.mutation);
    this.audit = injected?.audit ?? new AuditService(repository);
  }

  private get mutation(): WorkspaceMutationContext {
    return this._mutation ??= new WorkspaceMutationContext(
      this.repository,
      this.workspaceAdminAuthorizer,
    );
  }

  getWorkspaceSnapshot() {
    return this.audit.getWorkspaceSnapshot();
  }

  listSystemLog(filters?: SystemLogListFilters) {
    return this.audit.listSystemLog(filters);
  }

  listRoles() { return this.workforce.listRoles(); }
  getRole(id: string) { return this.workforce.getRole(id); }
  createRole(input: RoleCreateInput): never {
    return this.workforce.createRole(input);
  }
  updateRole(input: RoleUpdateInput): never {
    return this.workforce.updateRole(input);
  }
  deleteRole(id: string): never {
    return this.workforce.deleteRole(id);
  }
  listEmployees(filters?: EmployeeListFilters) { return this.workforce.listEmployees(filters); }
  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters) { return this.workforce.listEmployeeStateHistory(filters); }
  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters) { return this.workforce.listProjectManagerOwnershipHistory(filters); }
  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters) { return this.workforce.listWarehouseManagerOwnershipHistory(filters); }
  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters) { return this.workforce.listSalaryPayments(filters); }
  getEmployee(id: string) { return this.workforce.getEmployee(id); }
  createEmployee(input: EmployeeCreateInput, auditContext?: MutationAuditContext) {
    return this.workforce.createEmployee(input, auditContext);
  }
  createEmployeesBatch(input: EmployeeBatchCreateInput, auditContext?: MutationAuditContext) {
    return this.workforce.createEmployeesBatch(input, auditContext);
  }
  updateEmployee(input: EmployeeUpdateInput, auditContext?: MutationAuditContext) {
    return this.workforce.updateEmployee(input, auditContext);
  }
  deleteEmployee(id: string, auditContext?: MutationAuditContext) {
    return this.workforce.deleteEmployee(id, auditContext);
  }
  createSalaryPayment(input: EmployeeSalaryPaymentCreateInput, auditContext?: MutationAuditContext) {
    return this.workforce.createSalaryPayment(input, auditContext);
  }
  listManagerAssignments(filters?: ManagerAssignmentListFilters) { return this.workforce.listManagerAssignments(filters); }
  getManagerAssignment(id: string) { return this.workforce.getManagerAssignment(id); }
  createManagerAssignment(input: ManagerAssignmentCreateInput, auditContext?: MutationAuditContext) {
    return this.workforce.createManagerAssignment(input, auditContext);
  }
  endManagerAssignment(input: ManagerAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.workforce.endManagerAssignment(input, auditContext);
  }
  assignEmployeeWorkplace(input: EmployeeAssignWorkplaceInput, auditContext?: MutationAuditContext) {
    return this.workforce.assignEmployeeWorkplace(input, auditContext);
  }
  syncManagedProjects(input: EmployeeSyncManagedProjectsInput, auditContext?: MutationAuditContext) {
    return this.workforce.syncManagedProjects(input, auditContext);
  }
  syncManagedWarehouses(input: EmployeeSyncManagedWarehousesInput, auditContext?: MutationAuditContext) {
    return this.workforce.syncManagedWarehouses(input, auditContext);
  }

  listProjects(filters?: ProjectListFilters) { return this.operations.listProjects(filters); }
  getProject(id: string) { return this.operations.getProject(id); }
  createProject(input: ProjectCreateInput, auditContext?: MutationAuditContext) {
    return this.operations.createProject(input, auditContext);
  }
  updateProject(input: ProjectUpdateInput, auditContext?: MutationAuditContext) {
    return this.operations.updateProject(input, auditContext);
  }
  listWarehouses(filters?: WarehouseListFilters) {
    return this.operations.listWarehouses(filters);
  }
  getWarehouse(id: string) {
    return this.operations.getWarehouse(id);
  }
  createWarehouse(input: WarehouseCreateInput, auditContext?: MutationAuditContext) {
    return this.operations.createWarehouse(input, auditContext);
  }
  updateWarehouse(input: WarehouseUpdateInput, auditContext?: MutationAuditContext) {
    return this.operations.updateWarehouse(input, auditContext);
  }
  listProjectAssignments(filters?: ProjectAssignmentListFilters) {
    return this.operations.listProjectAssignments(filters);
  }
  getProjectAssignment(id: string) {
    return this.operations.getProjectAssignment(id);
  }
  createProjectAssignment(input: ProjectAssignmentCreateInput, auditContext?: MutationAuditContext) {
    return this.operations.createProjectAssignment(input, auditContext);
  }
  endProjectAssignment(input: ProjectAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.operations.endProjectAssignment(input, auditContext);
  }
  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters) {
    return this.operations.listWarehouseAssignments(filters);
  }
  getWarehouseAssignment(id: string) {
    return this.operations.getWarehouseAssignment(id);
  }
  createWarehouseAssignment(input: WarehouseAssignmentCreateInput, auditContext?: MutationAuditContext) {
    return this.operations.createWarehouseAssignment(input, auditContext);
  }
  endWarehouseAssignment(input: WarehouseAssignmentEndInput, auditContext?: MutationAuditContext) {
    return this.operations.endWarehouseAssignment(input, auditContext);
  }

  listExternalCounterparties(filters?: ExternalCounterpartyListFilters) {
    return this.finance.listExternalCounterparties(filters);
  }
  getExternalCounterparty(id: string) {
    return this.finance.getExternalCounterparty(id);
  }
  createExternalCounterparty(input: ExternalCounterpartyCreateInput, auditContext?: MutationAuditContext) {
    return this.finance.createExternalCounterparty(input, auditContext);
  }
  listDebtAccounts(filters?: DebtAccountListFilters) {
    return this.finance.listDebtAccounts(filters);
  }
  getDebtAccount(id: string) {
    return this.finance.getDebtAccount(id);
  }
  listDebtEntries(filters: DebtEntryListFilters) {
    return this.finance.listDebtEntries(filters);
  }
  createDebtAccount(input: DebtAccountCreateInput, auditContext?: MutationAuditContext) {
    return this.finance.createDebtAccount(input, auditContext);
  }
  createDebtEntry(input: DebtEntryCreateInput, auditContext?: MutationAuditContext) {
    return this.finance.createDebtEntry(input, auditContext);
  }
  recordDebtPayment(input: DebtEntryRecordPaymentInput, auditContext?: MutationAuditContext) {
    return this.finance.recordDebtPayment(input, auditContext);
  }
  voidDebtEntry(input: DebtEntryVoidInput, auditContext?: MutationAuditContext) {
    return this.finance.voidDebtEntry(input, auditContext);
  }
  settleDebtAccount(input: DebtSettlementInput, auditContext?: MutationAuditContext) {
    return this.finance.settleDebtAccount(input, auditContext);
  }
  consolidateDebtEntries(input: DebtConsolidationInput, auditContext?: MutationAuditContext) {
    return this.finance.consolidateDebtEntries(input, auditContext);
  }
  getDebtPartyDetail(input: DebtPartyDetailInput) {
    return this.finance.getDebtPartyDetail(input);
  }
  listDebtsSummary() {
    return this.finance.listDebtsSummary();
  }
}
