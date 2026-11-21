/**
 * Audit service.
 *
 * Cross-domain read-only views over the workspace — the workspace
 * snapshot (used as the initial seed of the home view) and the
 * system log (which aggregates every domain's audit history).
 *
 * Extracted from `CompanyService` as part of Plan 005 Phase 3
* (issue #177) so the former monolithic service stops owning read views that
 * span every domain.
 */

import { buildCompanySystemLog } from "./company.system-log";
import type { CompanyRepository } from "./company.repository.contracts";
import type { SystemLogListFilters } from "./company.types";

export class AuditService {
  constructor(private readonly repository: CompanyRepository) {}

  getWorkspaceMetadata() {
    return {
      roles: this.repository.listRoles(),
      employees: this.repository.listEmployees(),
      externalCounterparties: this.repository.listExternalCounterparties(),
      projects: this.repository.listProjects(),
      warehouses: this.repository.listWarehouses(),
      managerAssignments: this.repository.listManagerAssignments(),
      projectAssignments: this.repository.listProjectAssignments(),
      warehouseAssignments: this.repository.listWarehouseAssignments(),
      employeeStateHistory: this.repository.listEmployeeStateHistory(),
      projectManagerOwnershipHistory: this.repository.listProjectManagerOwnershipHistory(),
      warehouseManagerOwnershipHistory: this.repository.listWarehouseManagerOwnershipHistory(),
    };
  }

  getWorkspaceSnapshot() {
    return {
      ...this.getWorkspaceMetadata(),
      debtAccounts: this.repository.listDebtAccounts(),
      debtEntries: this.repository.listAllDebtEntries(),
      salaryPayments: this.repository.listSalaryPayments(),
    };
  }

  listSystemLog(filters?: SystemLogListFilters) {
    return buildCompanySystemLog(this.repository, filters);
  }
}
