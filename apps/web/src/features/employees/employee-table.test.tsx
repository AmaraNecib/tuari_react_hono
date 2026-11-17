// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mutateAsync, sessionUser } = vi.hoisted(() => ({ mutateAsync: vi.fn(), sessionUser: { id: "user-1" } }))

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    i18n: { dir: () => "rtl" },
    t: (key: string) => key,
  }),
}))

vi.mock("@/features/employees/employee-earnings-queries", () => ({
  useApproveEmployeeEarningMutation: () => ({ mutateAsync, isPending: false }),
}))

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: () => ({ data: { user: sessionUser } }),
}))

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled?: boolean }) => (
    <input aria-label={id} type="date" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
  ),
}))

import { EmployeeTable, type EmployeeTableRow } from "./employee-table"

const PROJECT = { id: "project-1", name: "مشروع" }
const REFERENCE = { period: "MONTHLY" as const, amount: "30000.00" }
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
  salaryReference: REFERENCE,
  status: "ACTIVE",
  updatedAt: "2026-03-01T10:00:00.000Z",
}

describe("EmployeeTable salary approval entry point", () => {
  beforeEach(() => {
    localStorage.clear()
    mutateAsync.mockReset().mockResolvedValue({})
  })

  afterEach(cleanup)

  function renderTable(overrides: Partial<EmployeeTableRow> = {}) {
    const element = (next: Partial<EmployeeTableRow>) => (
      <EmployeeTable
        copy={copy}
        rows={[{ ...row, ...next }]}
        projects={[PROJECT]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onLeave={vi.fn()}
        onView={vi.fn()}
      />
    )
    const view = render(element(overrides))
    return {
      refresh: (next: Partial<EmployeeTableRow>) => view.rerender(element(next)),
    }
  }

  it("opens the real approval dialog and submits the exact employee reference", async () => {
    renderTable()

    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    expect(screen.getByRole("heading", { name: "earnings.title" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "50000" } })
    fireEvent.change(screen.getByLabelText("earnings.unallocated"), { target: { value: "50000" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({
      employeeId: "worker-1",
      currencyCode: "DZD",
      referenceSalary: { period: "MONTHLY", amount: "30000.00" },
    })
  })

  it("allows approval entry when the employee has no reference salary", async () => {
    renderTable({ salaryReference: null })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    expect(screen.getByRole("heading", { name: "earnings.title" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "50000" } })
    fireEvent.change(screen.getByLabelText("earnings.unallocated"), { target: { value: "50000" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ employeeId: "worker-1", currencyCode: "DZD" })
    expect(mutateAsync.mock.calls[0]![0].referenceSalary).toBeNull()
  })

  it("uses the refreshed reference while preserving employee identity", async () => {
    const { refresh } = renderTable()
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    refresh({ salaryReference: { period: "DAILY", amount: "1500.00" }, name: "عامل محدّث" })
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "50000" } })
    fireEvent.change(screen.getByLabelText("earnings.unallocated"), { target: { value: "50000" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({
      employeeId: "worker-1",
      referenceSalary: { period: "DAILY", amount: "1500.0000" },
    })
    expect(screen.getByText("عامل محدّث")).toBeTruthy()
  })
})
