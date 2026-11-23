import { describe, expect, it, vi } from "vitest";
import { AuditService } from "./audit.service";
import type { CompanyRepository } from "./company.repository.contracts";

describe("organizational workspace metadata", () => {
  it("does not query retired monetary collections", () => {
    const unexpected = vi.fn(() => { throw new Error("Numeric money must not be read"); });
    const repository = {
      listRoles: () => [], listEmployees: () => [], listExternalCounterparties: () => [],
      listProjects: () => [], listWarehouses: () => [], listManagerAssignments: () => [],
      listProjectAssignments: () => [], listWarehouseAssignments: () => [],
      listEmployeeStateHistory: () => [], listProjectManagerOwnershipHistory: () => [],
      listWarehouseManagerOwnershipHistory: () => [],
      listDebtAccounts: unexpected, listAllDebtEntries: unexpected, listSalaryPayments: unexpected,
    } as unknown as CompanyRepository;
    const metadata = new AuditService(repository).getWorkspaceMetadata();
    expect(metadata).toEqual({
      roles: [], employees: [], externalCounterparties: [], projects: [], warehouses: [],
      managerAssignments: [], projectAssignments: [], warehouseAssignments: [],
      employeeStateHistory: [], projectManagerOwnershipHistory: [], warehouseManagerOwnershipHistory: [],
    });
    expect(unexpected).not.toHaveBeenCalled();
  });
});
