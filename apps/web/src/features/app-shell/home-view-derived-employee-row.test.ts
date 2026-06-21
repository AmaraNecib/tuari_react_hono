import { describe, expect, it } from "vitest"

import { buildEmployeeRow } from "./home-view-derived-employees"
import { buildHomeViewDerivedLookups } from "./home-view-derived-lookups"
import type { DemoWorkspace } from "./workspace-queries"

const noopTranslate = (key: string): string => key

function buildFixture(): {
  copy: { shell: { noManager: string; noProject: string } }
  workspace: DemoWorkspace
} {
  const workspace: DemoWorkspace = {
    employees: [
      {
        id: "employee-1",
        firstName: "Alice",
        lastName: "A",
        phone: "0555000111",
        roleId: "role-worker",
        status: "ACTIVE",
        notes: null,
        salaryAmountDzd: 30000,
        salaryPeriod: "MONTHLY",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ],
    roles: [
      { id: "role-worker", key: "worker", name: "عامل", description: null, isSystem: false, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" },
    ],
    externalCounterparties: [],
    debtAccounts: [],
    debtEntries: [],
    projects: [],
    warehouses: [],
    managerAssignments: [],
    projectAssignments: [],
    warehouseAssignments: [],
    salaryPayments: [],
    employeeStateHistory: [],
    projectManagerOwnershipHistory: [],
    warehouseManagerOwnershipHistory: [],
  }

  return {
    copy: { shell: { noManager: "—", noProject: "—" } },
    workspace,
  }
}

describe("buildEmployeeRow", () => {
  it("enriches a single employee with role and copy labels", () => {
    const { copy, workspace } = buildFixture()
    const lookups = buildHomeViewDerivedLookups(workspace)
    const relationshipFacts = {
      employeeIdsWithManagedProjectHistory: new Set<string>(),
      employeeIdsWithManagedWarehouseHistory: new Set<string>(),
      employeeIdsWithManagerHistory: new Set<string>(),
      employeeIdsWithProjectHistory: new Set<string>(),
      employeeIdsWithSalaryPayments: new Set<string>(),
      employeeIdsWithWarehouseHistory: new Set<string>(),
      activeReportsByManagerId: new Map(),
      activeProjectsByManagerId: new Map(),
      activeWarehousesByManagerId: new Map(),
      projectsByManagerId: new Map(),
      warehousesByManagerId: new Map(),
    }

    const row = buildEmployeeRow({
      copy,
      employee: workspace.employees[0]!,
      lookups,
      relationshipFacts,
      t: noopTranslate,
    })

    expect(row.id).toBe("employee-1")
    expect(row.roleKey).toBe("worker")
    expect(row.isWorker).toBe(true)
    expect(row.name).toBe("Alice A")
    expect(row.canDelete).toBe(true)
    expect(row.canLeave).toBe(true)
  })

  it("returns noManager label when the role is missing", () => {
    const { copy, workspace } = buildFixture()
    const lookups = buildHomeViewDerivedLookups(workspace)
    const relationshipFacts = {
      employeeIdsWithManagedProjectHistory: new Set<string>(),
      employeeIdsWithManagedWarehouseHistory: new Set<string>(),
      employeeIdsWithManagerHistory: new Set<string>(),
      employeeIdsWithProjectHistory: new Set<string>(),
      employeeIdsWithSalaryPayments: new Set<string>(),
      employeeIdsWithWarehouseHistory: new Set<string>(),
      activeReportsByManagerId: new Map(),
      activeProjectsByManagerId: new Map(),
      activeWarehousesByManagerId: new Map(),
      projectsByManagerId: new Map(),
      warehousesByManagerId: new Map(),
    }
    const employee = {
      ...workspace.employees[0]!,
      id: "orphan",
      roleId: "role-missing",
    }

    const row = buildEmployeeRow({
      copy,
      employee,
      lookups,
      relationshipFacts,
      t: noopTranslate,
    })

    expect(row.roleKey).toBe("")
    expect(row.role).toBe("—")
    expect(row.isWorker).toBe(false)
  })

  it("blocks delete when the employee has salary payment history", () => {
    const { copy, workspace } = buildFixture()
    const lookups = buildHomeViewDerivedLookups(workspace)
    const relationshipFacts = {
      employeeIdsWithManagedProjectHistory: new Set<string>(),
      employeeIdsWithManagedWarehouseHistory: new Set<string>(),
      employeeIdsWithManagerHistory: new Set<string>(),
      employeeIdsWithProjectHistory: new Set<string>(),
      employeeIdsWithSalaryPayments: new Set<string>(["employee-1"]),
      employeeIdsWithWarehouseHistory: new Set<string>(),
      activeReportsByManagerId: new Map(),
      activeProjectsByManagerId: new Map(),
      activeWarehousesByManagerId: new Map(),
      projectsByManagerId: new Map(),
      warehousesByManagerId: new Map(),
    }

    const row = buildEmployeeRow({
      copy,
      employee: workspace.employees[0]!,
      lookups,
      relationshipFacts,
      t: noopTranslate,
    })

    expect(row.canDelete).toBe(false)
    expect(row.deleteDisabledReason).not.toBeNull()
  })
})