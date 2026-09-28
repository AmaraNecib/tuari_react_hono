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
  useCreateSalaryPaymentMutation: () => ({ isPending: false, mutateAsync: vi.fn(), reset: vi.fn() }),
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

  function renderTable(overrides: Partial<EmployeeTableRow> = {}) {
    const element = (next: Partial<EmployeeTableRow>) => (
      <EmployeeTable
        copy={copy}
        rows={[{ ...row, ...next }]}
        projects={[PROJECT]}
        projectAssignmentsByEmployeeId={{ [row.id]: [ASSIGNMENT] }}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onLeave={vi.fn()}
        onView={vi.fn()}
      />
    )

    const view = render(element(overrides))
    return {
      view,
      // Simulate a workspace refresh that changes the row underneath the open
      // dialog.
      refresh: (next: Partial<EmployeeTableRow>) => {
        view.rerender(element(next))
      },
    }
  }

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

  it("re-derives the open dialog's proposal from the live row after a wage refresh", () => {
    const { refresh } = renderTable({ salaryAmountDzd: 30000, salaryPeriod: "MONTHLY" })

    fireEvent.click(screen.getByRole("button", { name: "salaries.addPayment" }))
    expect(screen.getAllByDisplayValue("30000").length).toBeGreaterThan(0)

    // The open dialog snapshotted only the target's identity: the wage must
    // follow the refreshed row rather than staying on the old proposal.
    refresh({ salaryAmountDzd: 60000, salaryPeriod: "MONTHLY" })
    expect(screen.getAllByDisplayValue("60000").length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue("30000")).toBeNull()
  })

  it("follows a refreshed wage period so the untouched day default tracks it", () => {
    const { refresh } = renderTable({ salaryAmountDzd: 30000, salaryPeriod: "MONTHLY" })

    fireEvent.click(screen.getByRole("button", { name: "salaries.addPayment" }))
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("30")

    refresh({ salaryAmountDzd: 1500, salaryPeriod: "DAILY" })
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("1")
    expect(screen.getAllByDisplayValue("1500").length).toBeGreaterThan(0)
  })
})