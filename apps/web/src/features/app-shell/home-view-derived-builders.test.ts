import { describe, expect, it } from "vitest"

import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import { buildEmployeeHistoryCollections } from "./home-view-derived-employee-history"
import { buildEmployeeSalaryCollections } from "./home-view-derived-employee-salary"
import {
  buildEmployeeRows,
  buildManagerOptions,
  deriveEmployeeDeleteState,
  deriveEmployeeLeaveState,
} from "./home-view-derived-employees"
import { buildHomeViewDerivedLookups } from "./home-view-derived-lookups"
import { buildProjectDerivedCollections, buildProjectRows } from "./home-view-derived-projects"
import { buildWarehouseDerivedCollections, buildWarehouseRows } from "./home-view-derived-warehouses"
import type { DemoWorkspace } from "./workspace-queries"

const t = (key: string, options?: Record<string, unknown>) =>
  key === "detailPages.shell.activeWorkersCount" ? `عمال نشطون: ${String(options?.count ?? 0)}` : key

const copy = {
  shell: {
    noManager: "بدون مدير",
    noProject: "بدون مشروع",
  },
} as Pick<HomeViewCopy, "shell">

const detailCopy = {
  shared: {
    back: "رجوع",
    activeWorkerMissing: "عامل مفقود",
    currentAssignment: "تكليف حالي",
    currentlySelected: "محدد حاليا",
    activeRoleMissing: "دور مفقود",
    activeWarehouseMissing: "مخزن مفقود",
    missingRecordDescription: "السجل غير موجود",
    ongoing: "مستمر",
  },
  salary: {
    paymentLabel: "دفعة",
    expectedAmountLabel: "المبلغ المتوقع",
    actualAmountLabel: "المبلغ المدفوع",
    periodLabel: "الفترة",
    noteLabel: "ملاحظة",
    noPayments: "لا توجد دفعات",
    activeSalaryPrefix: "الراتب الحالي",
    currency: "دج",
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
  },
  employee: {
    fileTitle: "ملف العامل",
    editTitle: "تعديل العامل",
    managerLabel: "المدير",
    projectLabel: "المشروع",
    warehouseLabel: "المخزن",
  },
  project: {
    managerLabel: "مدير المشروع",
  },
  warehouse: {
    managerLabel: "مدير المخزن",
  },
} as unknown as HomeViewDetailCopy

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
      salaryReference: { amount: "0.00", period: "MONTHLY" },
      notes: null,
      occupation: null,
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
      salaryReference: { amount: "4500.1250", period: "DAILY" },
      notes: null,
      occupation: null,
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
      salaryReference: { amount: "70000.00", period: "MONTHLY" },
      notes: null,
      occupation: null,
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
}

describe("home view derived builders", () => {
  it("keeps employee row state and manager options unchanged", () => {
    const lookups = buildHomeViewDerivedLookups(workspace)
    const employeeRows = buildEmployeeRows({ copy, lookups, t, workspace })
    const managerOptions = buildManagerOptions({ lookups, workspace })

    expect(employeeRows.find((employee) => employee.id === "worker-1")!).toMatchObject({
      salaryReference: { amount: "4500.1250", period: "DAILY" },
      canDelete: false,
      deleteDisabledReason: "detailPages.employee.deleteReasonManagementHistory",
      canLeave: false,
      leaveDisabledReason: "detailPages.employee.leaveReasonWorkerLinked",
      currentWorkplace: "مبنى الإدارة",
    })

    expect(managerOptions).toEqual([
      {
        id: "manager-1",
        label: "أحمد بلخير - 0555000001",
        projectOptions: [{ id: "project-1", label: "مبنى الإدارة" }],
      },
    ])
  })

  it("groups project assignment windows per employee in one pass", () => {
    const lookups = buildHomeViewDerivedLookups(workspace)
    const employeeRows = buildEmployeeRows({ copy, lookups, t, workspace })
    const salary = buildEmployeeSalaryCollections({ detailCopy, employeeRows, lookups, workspace })

    // worker-1's two windows keep snapshot order; everyone gets a key, even
    // with no assignments.
    expect(salary.projectAssignmentsByEmployeeId["worker-1"]).toEqual([
      { projectId: "project-1", startDate: "2026-03-13T10:00:00.000Z", endDate: null },
      { projectId: "project-2", startDate: "2026-02-13T10:00:00.000Z", endDate: "2026-03-01T10:00:00.000Z" },
    ])
    expect(salary.projectAssignmentsByEmployeeId["manager-1"]).toEqual([])
    expect(salary.projectAssignmentsByEmployeeId["warehouse-manager-1"]).toEqual([])
    expect(salary.salariedEmployees.find((employee) => employee.employeeId === "worker-1")?.salaryReference).toEqual({
      amount: "4500.1250",
      period: "DAILY",
    })
    expect(salary.salariedEmployees.find((employee) => employee.employeeId === "manager-1")?.salaryReference).toEqual({
      amount: "0.00",
      period: "MONTHLY",
    })
    expect(
      salary.salariedEmployees.find((employee) => employee.employeeId === "worker-1")?.projectAssignments,
    ).toHaveLength(2)

    // An assignment whose employee is not in the snapshot stays out, as before.
    const withOrphan = buildEmployeeSalaryCollections({
      detailCopy,
      employeeRows,
      lookups,
      workspace: {
        ...workspace,
        projectAssignments: [
          ...workspace.projectAssignments,
          {
            id: "orphan-1",
            employeeId: "ghost-1",
            projectId: "project-1",
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
      },
    })
    expect(withOrphan.projectAssignmentsByEmployeeId["ghost-1"]).toBeUndefined()
  })

  it("keeps state-history salary references as snapshots after the employee reference changes", () => {
    const snapshot = { amount: "4500.1250", period: "DAILY" as const }
    const current = { amount: "5200.0000", period: "DAILY" as const }
    const historyWorkspace: DemoWorkspace = {
      ...workspace,
      employees: workspace.employees.map((employee) =>
        employee.id === "worker-1" ? { ...employee, salaryReference: current } : employee,
      ),
      employeeStateHistory: [{
        id: "worker-state-1",
        employeeId: "worker-1",
        roleId: "role-worker",
        status: "ACTIVE",
        salaryReference: snapshot,
        eventType: "UPDATED",
        startDate: "2026-03-10T10:00:00.000Z",
        endDate: null,
        notes: null,
        actorUserId: null,
        transactionId: null,
        createdAt: "2026-03-10T10:00:00.000Z",
        updatedAt: "2026-03-10T10:00:00.000Z",
      }],
    }
    const history = buildEmployeeHistoryCollections({
      copy,
      detailCopy,
      lookups: buildHomeViewDerivedLookups(historyWorkspace),
      workspace: historyWorkspace,
    })

    expect(historyWorkspace.employees.find((employee) => employee.id === "worker-1")?.salaryReference).toEqual(current)
    expect(history.workHistoryByEmployeeId["worker-1"]?.find((entry) => entry.id === "state-worker-state-1")).toMatchObject({
      salaryReference: snapshot,
      detail: "الراتب الحالي 4500.1250 دج / يومي",
    })
  })

  it("leaves archived assignments out of the wage-day windows", () => {
    const lookups = buildHomeViewDerivedLookups(workspace)
    const employeeRows = buildEmployeeRows({ copy, lookups, t, workspace })
    const salary = buildEmployeeSalaryCollections({
      detailCopy,
      employeeRows,
      lookups,
      workspace: {
        ...workspace,
        // An archived, open-ended window: if it counted, it would cover the
        // whole payment period and suggest a full month of days to a project
        // the worker no longer works on.
        projectAssignments: [
          ...workspace.projectAssignments,
          {
            id: "project-assignment-archived",
            employeeId: "worker-1",
            projectId: "project-archived",
            status: "ARCHIVED",
            startDate: "2000-01-01T00:00:00.000Z",
            endDate: null,
            notes: null,
            actorUserId: null,
            transactionId: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
        ],
      },
    })

    const windows = salary.projectAssignmentsByEmployeeId["worker-1"] ?? []
    expect(windows.some((window) => window.projectId === "project-archived")).toBe(false)
    expect(windows).toEqual([
      { projectId: "project-1", startDate: "2026-03-13T10:00:00.000Z", endDate: null },
      { projectId: "project-2", startDate: "2026-02-13T10:00:00.000Z", endDate: "2026-03-01T10:00:00.000Z" },
    ])
  })

  it("uses the warehouse name as the current workplace when a worker is only warehouse-assigned", () => {
    const lookups = buildHomeViewDerivedLookups({
      ...workspace,
      projectAssignments: [],
    })
    const employeeRows = buildEmployeeRows({
      copy,
      lookups,
      t,
      workspace: {
        ...workspace,
        projectAssignments: [],
      },
    })

    expect(employeeRows.find((employee) => employee.id === "worker-1")).toMatchObject({
      currentProjectId: null,
      currentWarehouseId: "warehouse-1",
      currentWorkplace: "المستودع الرئيسي",
    })
  })

  it("prioritizes relationship-history delete reasons before broader fallback reasons", () => {
    expect(
      deriveEmployeeDeleteState(
        {
          hasManagedProjectHistory: false,
          hasManagedWarehouseHistory: false,
          hasManagerHistory: true,
          hasProjectHistory: true,
          hasWarehouseHistory: true,
          managesAnyProject: true,
          managesAnyWarehouse: true,
        },
        t,
      ),
    ).toEqual({
      canDelete: false,
      deleteDisabledReason: "detailPages.employee.deleteReasonManagementHistory",
    })
  })

  it("prioritizes inactive leave reasons before worker linkage reasons", () => {
    expect(
      deriveEmployeeLeaveState(
        {
          employeeStatus: "LEFT",
          hasActiveProjectManagerProject: false,
          hasActiveProjectManagerReports: false,
          hasActiveWarehouseManagerWarehouse: false,
          hasManagerAssignment: true,
          hasProjectAssignment: true,
          hasWarehouseAssignment: true,
          roleKey: "worker",
        },
        t,
      ),
    ).toEqual({
      canLeave: false,
      leaveDisabledReason: "detailPages.employee.leaveReasonInactive",
    })
  })

  it("groups project rows and history without changing output", () => {
    const lookups = buildHomeViewDerivedLookups(workspace)
    const projects = buildProjectRows({ copy, lookups, t, workspace })
    const projectCollections = buildProjectDerivedCollections({ copy, detailCopy, lookups, workspace })

    expect(projects).toEqual([
      expect.objectContaining({ id: "project-1", activeWorkers: 1, canArchive: false }),
      expect.objectContaining({ id: "project-2", activeWorkers: 0, canArchive: true }),
    ])
    expect(projectCollections.projectWorkersByProjectId["project-1"]).toHaveLength(1)
    expect(projectCollections.projectWorkersByProjectId["project-2"]).toEqual([])
    expect(projectCollections.projectManagementHistoryByProjectId["project-1"]!.map((entry) => entry.id)).toEqual([
      "project-history-1",
      "project-history-2",
    ])
  })

  it("groups warehouse rows and history without changing output", () => {
    const lookups = buildHomeViewDerivedLookups(workspace)
    const warehouses = buildWarehouseRows({ copy, lookups, t, workspace })
    const warehouseCollections = buildWarehouseDerivedCollections({ copy, detailCopy, lookups, workspace })

    expect(warehouses).toEqual([
      expect.objectContaining({ id: "warehouse-1", canArchive: false, archiveDisabledReason: "detailPages.warehouse.archiveReasonManagerAndWorkers" }),
    ])
    expect(warehouseCollections.warehouseWorkersByWarehouseId["warehouse-1"]).toHaveLength(1)
    expect(warehouseCollections.warehouseManagementHistoryByWarehouseId["warehouse-1"]!.map((entry) => entry.id)).toEqual([
      "warehouse-history-1",
    ])
  })
})
