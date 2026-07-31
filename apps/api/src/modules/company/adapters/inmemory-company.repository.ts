/**
 * Composed in-memory CompanyRepository.
 *
 * Satisfies the full CompanyRepository interface (Workforce +
 * Operations + Finance + Audit + withTransaction) by delegating to
 * the four in-memory domain adapters sharing one InMemoryStore.
 */

import type { CompanyRepository } from "../company.repository.contracts";
import { InMemoryStore } from "./inmemory-store";
import { InMemoryWorkforceRepository } from "./inmemory-workforce.repository";
import { InMemoryOperationsRepository } from "./inmemory-operations.repository";
import { InMemoryFinanceRepository } from "./inmemory-finance.repository";
import { InMemoryAuditRepository } from "./inmemory-audit.repository";

export class InMemoryCompanyRepository implements CompanyRepository {
  private readonly workforce: InMemoryWorkforceRepository;
  private readonly operations: InMemoryOperationsRepository;
  private readonly finance: InMemoryFinanceRepository;
  private readonly audit: InMemoryAuditRepository;

  constructor(
    private readonly store: InMemoryStore = new InMemoryStore(),
  ) {
    this.workforce = new InMemoryWorkforceRepository(store);
    this.operations = new InMemoryOperationsRepository(store);
    this.finance = new InMemoryFinanceRepository(store);
    this.audit = new InMemoryAuditRepository(store);
  }

  withTransaction<T>(callback: () => T): T {
    return this.store.transaction(callback);
  }

  // Workforce delegation
  listRoles() { return this.workforce.listRoles(); }
  getRoleById(id: string) { return this.workforce.getRoleById(id); }
  getRoleByKey(key: string) { return this.workforce.getRoleByKey(key); }
  createRole(data: Parameters<CompanyRepository["createRole"]>[0]) { return this.workforce.createRole(data); }
  updateRole(data: Parameters<CompanyRepository["updateRole"]>[0]) { return this.workforce.updateRole(data); }
  deleteRole(id: string) { return this.workforce.deleteRole(id); }
  countEmployeesByRoleId(roleId: string) { return this.workforce.countEmployeesByRoleId(roleId); }
  listEmployees(filters?: Parameters<CompanyRepository["listEmployees"]>[0]) { return this.workforce.listEmployees(filters); }
  listEmployeesPaged(query: Parameters<CompanyRepository["listEmployeesPaged"]>[0]) { return this.workforce.listEmployeesPaged(query); }
  getEmployeeById(id: string) { return this.workforce.getEmployeeById(id); }
  getEmployeeByPhone(phone: string) { return this.workforce.getEmployeeByPhone(phone); }
  createEmployee(data: Parameters<CompanyRepository["createEmployee"]>[0], audit?: any) { return this.workforce.createEmployee(data, audit); }
  createEmployeesBatch(data: Parameters<CompanyRepository["createEmployeesBatch"]>[0], audit?: any) { return this.workforce.createEmployeesBatch(data, audit); }
  updateEmployee(data: Parameters<CompanyRepository["updateEmployee"]>[0], audit?: any) { return this.workforce.updateEmployee(data, audit); }
  deleteEmployee(id: string) { return this.workforce.deleteEmployee(id); }
  upsertEmployee(data: any) { return this.workforce.upsertEmployee(data); }
  assignEmployeeWorkplace(data: any, audit?: any) { return this.workforce.assignEmployeeWorkplace(data, audit); }
  syncManagedProjects(data: any, audit?: any) { return this.workforce.syncManagedProjects(data, audit); }
  syncManagedWarehouses(data: any, audit?: any) { return this.workforce.syncManagedWarehouses(data, audit); }
  listManagerAssignments(filters?: any) { return this.workforce.listManagerAssignments(filters); }
  getManagerAssignmentById(id: string) { return this.workforce.getManagerAssignmentById(id); }
  getActiveManagerAssignmentByWorkerId(workerId: string) { return this.workforce.getActiveManagerAssignmentByWorkerId(workerId); }
  createManagerAssignment(data: any, audit?: any) { return this.workforce.createManagerAssignment(data, audit); }
  endManagerAssignment(data: any, audit?: any) { return this.workforce.endManagerAssignment(data, audit); }
  listEmployeeStateHistory(filters?: any) { return this.workforce.listEmployeeStateHistory(filters); }
  listSalaryPayments(filters?: any) { return this.workforce.listSalaryPayments(filters); }
  createSalaryPayment(data: any, audit?: any) { return this.workforce.createSalaryPayment(data, audit); }

  // Operations delegation
  listProjects(filters?: any) { return this.operations.listProjects(filters); }
  getProjectById(id: string) { return this.operations.getProjectById(id); }
  createProject(data: any, audit?: any) { return this.operations.createProject(data, audit); }
  updateProject(data: any, audit?: any) { return this.operations.updateProject(data, audit); }
  listWarehouses(filters?: any) { return this.operations.listWarehouses(filters); }
  getWarehouseById(id: string) { return this.operations.getWarehouseById(id); }
  createWarehouse(data: any, audit?: any) { return this.operations.createWarehouse(data, audit); }
  updateWarehouse(data: any, audit?: any) { return this.operations.updateWarehouse(data, audit); }
  listProjectAssignments(filters?: any) { return this.operations.listProjectAssignments(filters); }
  getProjectAssignmentById(id: string) { return this.operations.getProjectAssignmentById(id); }
  getActiveProjectAssignmentByEmployeeId(employeeId: string) { return this.operations.getActiveProjectAssignmentByEmployeeId(employeeId); }
  createProjectAssignment(data: any, audit?: any) { return this.operations.createProjectAssignment(data, audit); }
  endProjectAssignment(data: any, audit?: any) { return this.operations.endProjectAssignment(data, audit); }
  listWarehouseAssignments(filters?: any) { return this.operations.listWarehouseAssignments(filters); }
  getWarehouseAssignmentById(id: string) { return this.operations.getWarehouseAssignmentById(id); }
  getActiveWarehouseAssignmentByEmployeeId(employeeId: string) { return this.operations.getActiveWarehouseAssignmentByEmployeeId(employeeId); }
  createWarehouseAssignment(data: any, audit?: any) { return this.operations.createWarehouseAssignment(data, audit); }
  endWarehouseAssignment(data: any, audit?: any) { return this.operations.endWarehouseAssignment(data, audit); }
  listProjectManagerOwnershipHistory(filters?: any) { return this.operations.listProjectManagerOwnershipHistory(filters); }
  listWarehouseManagerOwnershipHistory(filters?: any) { return this.operations.listWarehouseManagerOwnershipHistory(filters); }

  // Finance delegation
  listExternalCounterparties(filters?: any) { return this.finance.listExternalCounterparties(filters); }
  getExternalCounterpartyById(id: string) { return this.finance.getExternalCounterpartyById(id); }
  createExternalCounterparty(data: any) { return this.finance.createExternalCounterparty(data); }
  listDebtAccounts(filters?: any) { return this.finance.listDebtAccounts(filters); }
  getDebtAccountById(id: string) { return this.finance.getDebtAccountById(id); }
  getDebtAccountByWorkerId(workerId: string) { return this.finance.getDebtAccountByWorkerId(workerId); }
  getDebtAccountByExternalCounterpartyId(ecId: string) { return this.finance.getDebtAccountByExternalCounterpartyId(ecId); }
  getDebtAccountByExternalCounterpartyIdAndDirection(ecId: string, direction: any) { return this.finance.getDebtAccountByExternalCounterpartyIdAndDirection(ecId, direction); }
  createDebtAccount(data: any, audit?: any) { return this.finance.createDebtAccount(data, audit); }
  updateDebtAccount(data: any, audit?: any) { return this.finance.updateDebtAccount(data, audit); }
  listDebtEntries(filters: any) { return this.finance.listDebtEntries(filters); }
  getDebtEntryById(id: string) { return this.finance.getDebtEntryById(id); }
  getLatestDebtEntry(accountId: string) { return this.finance.getLatestDebtEntry(accountId); }
  listAllDebtEntries() { return this.finance.listAllDebtEntries(); }
  createDebtEntry(data: any, audit?: any) { return this.finance.createDebtEntry(data, audit); }
  voidDebtEntry(data: any, audit?: any) { return this.finance.voidDebtEntry(data, audit); }
  updateDebtEntryBalanceAfter(id: string, balanceAfterDzd: number) { return this.finance.updateDebtEntryBalanceAfter(id, balanceAfterDzd); }

  // Audit delegation
  isBootstrapOwner(userId: string) { return this.audit.isBootstrapOwner(userId); }
  getAuthUserById(id: string) { return this.audit.getAuthUserById(id); }
  listUserProfileHistory() { return this.audit.listUserProfileHistory(); }
  listInventoryItemDefinitionsForLog() { return this.audit.listInventoryItemDefinitionsForLog(); }
}
