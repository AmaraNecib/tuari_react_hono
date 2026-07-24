/**
 * Company service — cross-domain coordinator.
 *
 * Historically this class owned every business operation in the
 * workspace (employees, roles, projects, warehouses, debts, salary
 * payments, external counterparties, audit). It grew to ~2,100 LOC
 * and became the god object that Plan 005 Phase 3 (issue #177) set
 * out to split.
 *
 * After the split:
 * - `WorkforceService` owns employees, roles, salary payments, and
 *   the workplace / managed-assignment lifecycle.
 * - `OperationsService` owns projects, warehouses, and their
 *   assignments.
 * - `FinanceService` owns debt accounts, debt entries, and external
 *   counterparties.
 * - `AuditService` owns the workspace snapshot and system log.
 *
 * This class is now a thin facade that keeps the public surface
 * stable (so existing RPC handlers and tests don't change) while
 * delegating every per-domain operation to the right service. The
 * only methods that stay implemented in this file are the few
 * genuinely cross-domain orchestrators (`getEmployeeDebtAccount`,
 * `createEmployeeDebtEntry`) and the system log / workspace snapshot
 * delegations.
 */

import {
  type DebtAccountCreateInput,
  type DebtConsolidationInput,
  type DebtEntry,
  type DebtEntryCreateInput,
  type DebtEntryRecordPaymentInput,
  type DebtEntryVoidInput,
  type DebtPartyDetailInput,
  type DebtSettlementInput,
  type EmployeeAssignWorkplaceInput,
  type EmployeeBatchCreateInput,
  type EmployeeCreateInput,
  type EmployeeSalaryPaymentCreateInput,
  type EmployeeSyncManagedProjectsInput,
  type EmployeeSyncManagedWarehousesInput,
  type EmployeeUpdateInput,
  type ExternalCounterpartyCreateInput,
  type ManagerAssignmentCreateInput,
  type ManagerAssignmentEndInput,
  type ProjectAssignmentCreateInput,
  type ProjectAssignmentEndInput,
  type ProjectCreateInput,
  type ProjectUpdateInput,
  type RoleCreateInput,
  type RoleUpdateInput,
  type WarehouseAssignmentCreateInput,
  type WarehouseAssignmentEndInput,
  type WarehouseCreateInput,
  type WarehouseUpdateInput,
} from "@tuari/contracts";

import type { CompanyRepository } from "./company.repository";
import { WorkspaceMutationContext } from "./workspace-mutation-context";
import { WorkforceService } from "./workforce.service";
import { OperationsService } from "./operations.service";
import { FinanceService } from "./finance.service";
import { AuditService } from "./audit.service";
import { requireEmployee } from "./company.entity-resolvers";
import { type WorkspaceAdminAuthorizer } from "./company.helpers";
import {
  type DebtAccountListFilters,
  type DebtEntryListFilters,
  type EmployeeListFilters,
  type EmployeeSalaryPaymentListFilters,
  type EmployeeStateHistoryListFilters,
  type ExternalCounterpartyListFilters,
  type ManagerAssignmentListFilters,
  type MutationAuditContext,
  type ProjectAssignmentListFilters,
  type ProjectListFilters,
  type ProjectManagerOwnershipHistoryListFilters,
  type SystemLogListFilters,
  type WarehouseAssignmentListFilters,
  type WarehouseListFilters,
  type WarehouseManagerOwnershipHistoryListFilters,
} from "./company.types";

export class CompanyService {
  private readonly mutation: WorkspaceMutationContext;
  readonly workforce: WorkforceService;
  readonly operations: OperationsService;
  readonly finance: FinanceService;
  readonly audit: AuditService;

  constructor(
    private readonly repository: CompanyRepository,
    workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer,
    injected?: {
      workforce?: WorkforceService;
      operations?: OperationsService;
      finance?: FinanceService;
      audit?: AuditService;
    },
  ) {
    this.mutation = new WorkspaceMutationContext(repository, workspaceAdminAuthorizer);
    this.workforce = injected?.workforce ?? new WorkforceService(repository, this.mutation);
    this.operations = injected?.operations ?? new OperationsService(repository, this.mutation);
    this.finance = injected?.finance ?? new FinanceService(repository, this.mutation);
    this.audit = injected?.audit ?? new AuditService(repository);
  }

  // ---------------------------------------------------------------------------
  // Cross-domain workspace reads
  // ---------------------------------------------------------------------------

  getWorkspaceSnapshot() {
    return this.audit.getWorkspaceSnapshot();
  }

  listSystemLog(filters?: SystemLogListFilters) {
    return this.audit.listSystemLog(filters);
  }

  // ---------------------------------------------------------------------------
  // Cross-domain orchestrators
  //
  // These glue together workforce + finance: they need to look up
  // the employee (workforce) and the debt account (finance) in the
  // same call. The actual implementation lives in `FinanceService`
  // (which has the repository + mutation context it needs); the
  // delegation here is for callers that go through `CompanyService`.
  // ---------------------------------------------------------------------------

  getEmployeeDebtAccount(employeeId: string) {
    return this.finance.getEmployeeDebtAccount(employeeId);
  }

  createEmployeeDebtEntry(
    input: {
      employeeId: string;
      entryType: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE";
      amountDzd: number;
      entryDate?: string;
      note?: string;
      reasonCategory?: DebtEntry["reasonCategory"];
    },
    auditContext?: MutationAuditContext,
  ) {
    return this.finance.createEmployeeDebtEntry(input, auditContext);
  }

  // ---------------------------------------------------------------------------
  // Delegations — workforce
  // ---------------------------------------------------------------------------

  listRoles() {
    return this.workforce.listRoles();
  }
  getRole(id: string) {
    return this.workforce.getRole(id);
  }
  createRole(input: RoleCreateInput): never {
    return this.workforce.createRole(input);
  }
  updateRole(input: RoleUpdateInput): never {
    return this.workforce.updateRole(input);
  }
  deleteRole(id: string): never {
    return this.workforce.deleteRole(id);
  }
  listEmployees(filters?: EmployeeListFilters) {
    return this.workforce.listEmployees(filters);
  }
  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters) {
    return this.workforce.listEmployeeStateHistory(filters);
  }
  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters) {
    return this.workforce.listProjectManagerOwnershipHistory(filters);
  }
  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters) {
    return this.workforce.listWarehouseManagerOwnershipHistory(filters);
  }
  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters) {
    return this.workforce.listSalaryPayments(filters);
  }
  getEmployee(id: string) {
    return this.workforce.getEmployee(id);
  }
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
  listManagerAssignments(filters?: ManagerAssignmentListFilters) {
    return this.workforce.listManagerAssignments(filters);
  }
  getManagerAssignment(id: string) {
    return this.workforce.getManagerAssignment(id);
  }
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

  // ---------------------------------------------------------------------------
  // Delegations — operations
  // ---------------------------------------------------------------------------

  listProjects(filters?: ProjectListFilters) {
    return this.operations.listProjects(filters);
  }
  getProject(id: string) {
    return this.operations.getProject(id);
  }
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

  // ---------------------------------------------------------------------------
  // Delegations — finance
  // ---------------------------------------------------------------------------

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
