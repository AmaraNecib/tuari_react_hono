import { describe, expect, it } from "vitest"

import { buildHomeViewCopy } from "./home-view-copy"
import { buildHomeViewDerived } from "./home-view-derived"
import type { DemoWorkspace } from "./workspace-queries"

// This test deliberately imports ONLY the public seam
// (`buildHomeViewDerived`) plus the real copy builder — no internal
// home-view-derived-* modules. It pins the "single public seam" property
// (issue #217): the row builder the employees page uses (paged/search
// subsets) must agree exactly with the dashboard's full derived rows, so
// the two render paths cannot drift.
const identityT = ((key: string) => key) as never

const workspace: DemoWorkspace = {
  roles: [
    {
      id: "role-worker",
      key: "worker",
      name: "عامل",
      description: null,
      isSystem: true,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
      permissions: ["employees:read"],
    },
    {
      id: "role-project-manager",
      key: "project_manager",
      name: "مدير مشروع",
      description: null,
      isSystem: true,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
      permissions: ["employees:read", "employees:update", "invoices:read", "invoices:create", "invoices:update", "payments:read"],
    },
    {
      id: "role-warehouse-manager",
      key: "warehouse_manager",
      name: "مدير مخزن",
      description: null,
      isSystem: true,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
      permissions: ["employees:read", "invoices:read", "invoices:create", "invoices:update", "payments:read"],
    },
  ],
  employees: [
    {
      id: "manager-1",
      firstName: "أحمد",
      lastName: "بلخير",
      phone: "0555000001",
      roleId: "role-project-manager",
      status: "ACTIVE",
      salaryAmountDzd: 100000,
      salaryPeriod: "MONTHLY",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      id: "worker-1",
      firstName: "علي",
      lastName: "بن حميد",
      phone: "0555000002",
      roleId: "role-worker",
      status: "ACTIVE",
      salaryAmountDzd: 4500,
      salaryPeriod: "DAILY",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      id: "warehouse-manager-1",
      firstName: "سليم",
      lastName: "قادري",
      phone: "0555000003",
      roleId: "role-warehouse-manager",
      status: "ACTIVE",
      salaryAmountDzd: 70000,
      salaryPeriod: "MONTHLY",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
    // Edge employees so the drift invariant also covers the leave-inactive and
    // no-Manager fallback paths through the public seam (see test below).
    {
      id: "inactive-worker-1",
      firstName: "يوسف",
      lastName: "بوزيد",
      phone: "0555000004",
      roleId: "role-worker",
      status: "LEFT",
      salaryAmountDzd: 4500,
      salaryPeriod: "DAILY",
      notes: null,
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    },
    {
      id: "orphan-1",
      firstName: "غريب",
      lastName: "الوحدة",
      phone: "0555000005",
      roleId: "role-missing",
      status: "ACTIVE",
      salaryAmountDzd: null,
      salaryPeriod: null,
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  projects: [
    {
      id: "project-1",
      name: "مبنى الإدارة",
      location: "الجزائر",
      managerId: "manager-1",
      status: "ACTIVE",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      id: "project-2",
      name: "ورشات الجنوب",
      location: "ورقلة",
      managerId: null,
      status: "ACTIVE",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  warehouses: [
    {
      id: "warehouse-1",
      name: "المستودع الرئيسي",
      address: "الجزائر",
      managerId: "warehouse-manager-1",
      status: "ACTIVE",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  managerAssignments: [
    {
      id: "manager-assignment-1",
      workerId: "worker-1",
      managerId: "manager-1",
      status: "ACTIVE",
      startDate: "2026-03-13T10:00:00.000Z",
      endDate: null,
      notes: null,
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  projectAssignments: [
    {
      id: "project-assignment-1",
      employeeId: "worker-1",
      projectId: "project-1",
      status: "ACTIVE",
      startDate: "2026-03-13T10:00:00.000Z",
      endDate: null,
      notes: "الموقع الرئيسي",
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      id: "project-assignment-2",
      employeeId: "worker-1",
      projectId: "project-2",
      status: "ENDED",
      startDate: "2026-02-13T10:00:00.000Z",
      endDate: "2026-03-01T10:00:00.000Z",
      notes: "مغلق",
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-02-13T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    },
  ],
  warehouseAssignments: [
    {
      id: "warehouse-assignment-1",
      employeeId: "worker-1",
      warehouseId: "warehouse-1",
      status: "ACTIVE",
      startDate: "2026-03-14T10:00:00.000Z",
      endDate: null,
      notes: "نقل مواد",
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-03-14T10:00:00.000Z",
      updatedAt: "2026-03-14T10:00:00.000Z",
    },
  ],
  employeeStateHistory: [],
  projectManagerOwnershipHistory: [
    {
      id: "project-history-1",
      projectId: "project-1",
      managerId: "manager-1",
      status: "ACTIVE",
      startDate: "2026-03-01T10:00:00.000Z",
      endDate: null,
      notes: "التكليف الحالي",
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    },
    {
      id: "project-history-2",
      projectId: "project-1",
      managerId: "manager-1",
      status: "INACTIVE",
      startDate: "2026-02-01T10:00:00.000Z",
      endDate: "2026-02-20T10:00:00.000Z",
      notes: "تكليف سابق",
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-20T10:00:00.000Z",
    },
  ],
  warehouseManagerOwnershipHistory: [
    {
      id: "warehouse-history-1",
      warehouseId: "warehouse-1",
      managerId: "warehouse-manager-1",
      status: "ACTIVE",
      startDate: "2026-03-05T10:00:00.000Z",
      endDate: null,
      notes: "الحالي",
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-03-05T10:00:00.000Z",
      updatedAt: "2026-03-05T10:00:00.000Z",
    },
  ],
  externalCounterparties: [],
  debtAccounts: [],
  debtEntries: [],
  salaryPayments: [
    {
      id: "salary-payment-1",
      employeeId: "worker-1",
      paymentDate: "2026-03-18T08:00:00.000Z",
      expectedAmountDzd: 4500,
      actualAmountDzd: 4500,
      periodType: "DAILY",
      note: null,
      actorUserId: null,
      transactionId: null,
      createdAt: "2026-03-18T08:00:00.000Z",
      updatedAt: "2026-03-18T08:00:00.000Z",
    },
  ],
}

describe("buildHomeViewDerived composition (single public seam)", () => {
  it("exposes a row builder that agrees with the full derived employeeRows", () => {
    const copy = buildHomeViewCopy(identityT)
    const derived = buildHomeViewDerived({
      copy,
      detailCopy: copy.detailPages,
      t: identityT,
      workspace,
    })

    // The paged/search row builder must produce exactly the same row as the
    // dashboard's full list for the same employee — otherwise the employees
    // page and the dashboard could render differently from identical data.
    // The fixture includes an inactive (LEFT) worker and an orphan-role
    // employee so the invariant also covers the leave-inactive and no-Manager
    // fallback paths that the seam must build consistently.
    for (const employee of workspace.employees) {
      expect(derived.buildEmployeeTableRow(employee)).toEqual(
        derived.employeeRows.find((row) => row.id === employee.id),
      )
    }
    // The drift invariant would be vacuous if the seam returned no rows at
    // all, so pin the exact row count (every fixture employee is present).
    expect(derived.employeeRows).toHaveLength(workspace.employees.length)
    // And the fallback paths actually resolve through the seam.
    expect(derived.employeeRows.find((row) => row.id === "orphan-1")?.role).toBe("shell.noManager")
    expect(
      derived.employeeRows.find((row) => row.id === "inactive-worker-1")?.leaveDisabledReason,
    ).toBe("detailPages.employee.leaveReasonInactive")

    // The seam's aliases/derived aggregates stay internally consistent.
    expect(derived.managerOptions).toBe(derived.projectManagerOptions)
    expect(derived.metrics).toEqual({
      workers: 1,
      projects: 2,
      warehouses: 1,
      roles: 3,
    })
  })
})
