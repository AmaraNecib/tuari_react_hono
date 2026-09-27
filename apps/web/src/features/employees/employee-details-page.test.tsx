// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const { createSalaryPaymentMutate } = vi.hoisted(() => ({
  createSalaryPaymentMutate: vi.fn(),
}))

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")

  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  }
})

vi.mock("@/features/app-shell/mock-dashboard", () => ({
  useCreateSalaryPaymentMutation: () => ({
    isPending: false,
    isSuccess: false,
    mutate: createSalaryPaymentMutate,
  }),
}))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateSalaryPaymentMutation: () => ({
    isPending: false,
    isSuccess: false,
    mutate: createSalaryPaymentMutate,
    mutateAsync: vi.fn(),
  }),
}))

import { EmployeeDetailsPage } from "./employee-details-page"
import type { EmployeeTableRow } from "./employee-table"

const PROJECT = { id: "project-1", name: "مشروع الرواتب" }
// An open-ended window far wider than any payment month: the derived default
// is always full coverage, whichever month the dialog defaults to.
const ASSIGNMENT = { projectId: PROJECT.id, startDate: "2000-01-01T00:00:00+01:00", endDate: null }

function monthlyWorker(overrides: Partial<EmployeeTableRow> = {}): EmployeeTableRow {
  return {
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
    ...overrides,
  }
}

function renderDetails(employee: EmployeeTableRow = monthlyWorker()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <EmployeeDetailsPage
        activeTab="finance"
        debtAccounts={[]}
        debtEntriesByAccountId={{}}
        employee={employee}
        managedProjects={[]}
        managedWarehouses={[]}
        projects={[PROJECT]}
        projectAssignments={[ASSIGNMENT]}
        salaryPayments={[]}
        workHistory={[]}
        onTabChange={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe("EmployeeDetailsPage salary payments (#412)", () => {
  beforeEach(() => {
    createSalaryPaymentMutate.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("gives the payment dialog the project list and assignment windows", () => {
    renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة" }))

    // The dialog opened from the employee view can allocate: the project list
    // is present and the assignment window prefilled a full-period line.
    const projectSelect = screen.getByLabelText("المشروع") as HTMLSelectElement
    expect(projectSelect.value).toBe(PROJECT.id)
    expect(screen.getByText("أيام غير موزعة: 0")).toBeTruthy()
    const addProjectLine = screen.getByRole("button", { name: "إضافة مشروع" })
    expect(addProjectLine.hasAttribute("disabled")).toBe(false)
  })

  it("records the day count captured in the quick payment form", () => {
    renderDetails()

    fireEvent.click(screen.getByRole("button", { name: "إضافة دفعة راتب" }))
    const [daysInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]
    fireEvent.change(daysInput!, { target: { value: "15" } })

    // The expected amount follows the paid days rather than the full month.
    expect(screen.getAllByDisplayValue("15000").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "حفظ دفعة الراتب" }))

    expect(createSalaryPaymentMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "worker-1",
        days: 15,
        actualAmountDzd: 15000,
      }),
    )
  })
})