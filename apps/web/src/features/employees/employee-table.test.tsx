// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("react-i18next", () => ({
  // status-meta imports @/i18n, which calls i18n.use(initReactI18next).
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateSalaryPaymentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

import { EmployeeTable, type EmployeeTableRow } from "./employee-table"

const PROJECT = { id: "project-1", name: "مشروع" }
// An open-ended window far wider than any payment month: the derived default
// always covers the dialog's period.
const ASSIGNMENT = { projectId: PROJECT.id, startDate: "2000-01-01T00:00:00+01:00", endDate: null }

const copy = {
  name: "name",
  role: "role",
  manager: "manager",
  project: "project",
  phone: "phone",
  status: "status",
  actions: "actions",
  empty: "empty",
  addWorker: "addWorker",
  view: "view",
  edit: "edit",
  leave: "leave",
  delete: "delete",
}

const row: EmployeeTableRow = {
  canDelete: false,
  canLeave: false,
  createdAt: "2026-03-01T10:00:00.000Z",
  currentManagerId: null,
  currentProjectAssignmentId: null,
  currentProjectId: null,
  currentWarehouseAssignmentId: null,
  currentWarehouseId: null,
  currentWorkplace: "بدون مشروع نشط",
  deleteDisabledReason: null,
  firstName: "عامل",
  id: "worker-1",
  isWorker: true,
  lastName: "الرواتب",
  leaveDisabledReason: null,
  managerAssignmentId: null,
  managerName: "",
  name: "عامل الرواتب",
  notes: null,
  occupation: null,
  phone: "0555000001",
  role: "عامل",
  roleId: "role-worker",
  roleKey: "worker",
  salaryAmountDzd: 30000,
  salaryPeriod: "MONTHLY",
  status: "ACTIVE",
  updatedAt: "2026-03-01T10:00:00.000Z",
}

describe("EmployeeTable salary payment entry point (#412)", () => {
  afterEach(() => {
    cleanup()
  })

  it("opens the payment dialog with the project list and assignment windows", () => {
    render(
      <EmployeeTable
        copy={copy}
        rows={[row]}
        projects={[PROJECT]}
        projectAssignmentsByEmployeeId={{ [row.id]: [ASSIGNMENT] }}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onLeave={vi.fn()}
        onView={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "salaries.addPayment" }))

    // The dialog can attribute the payment: the project is selectable and the
    // assignment window prefilled a full-period split.
    const projectSelect = screen.getByLabelText("salaries.project") as HTMLSelectElement
    expect(projectSelect.value).toBe(PROJECT.id)
    expect(screen.getByText("salaries.unallocatedDays:0")).toBeTruthy()
    expect(screen.getByRole("button", { name: "salaries.addProjectLine" }).hasAttribute("disabled")).toBe(false)
  })
})