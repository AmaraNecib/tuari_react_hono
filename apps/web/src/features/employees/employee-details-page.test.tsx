// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentProps, ReactNode } from "react"
import { ALGERIA_DAY, MIDNIGHT_CROSSING, UTC_DAY, pinUtcTimeZone } from "@/test-utils/algeria-day"

const { approveEarning, sessionUser } = vi.hoisted(() => ({
  approveEarning: vi.fn(),
  sessionUser: { id: "user-1" },
}))

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")
  return { ...actual, Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a> }
})
vi.mock("@/features/employees/employee-earnings-queries", () => ({
  useApproveEmployeeEarningMutation: () => ({ mutateAsync: approveEarning, isPending: false }),
  useEmployeeEarningsQuery: () => ({ data: { items: [] }, isPending: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }),
}))
vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: () => ({ data: { user: sessionUser } }),
}))
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => (
    <input aria-label={id} type="date" value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

import { EmployeeDetailsPage } from "./employee-details-page"
import type { EmployeeTableRow } from "./employee-table"

type SalaryPaymentsProp = ComponentProps<typeof EmployeeDetailsPage>["salaryPayments"]
const PROJECT = { id: "project-1", name: "مشروع الرواتب" }

function worker(overrides: Partial<EmployeeTableRow> = {}): EmployeeTableRow {
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
    salaryReference: { period: "MONTHLY", amount: "30000.00" },
    status: "ACTIVE",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  }
}

function renderDetails(employee: EmployeeTableRow = worker(), salaryPayments: SalaryPaymentsProp = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <EmployeeDetailsPage
        activeTab="finance"
        debtAccounts={[]}
        debtEntriesByAccountId={{}}
        employee={employee}
        managedProjects={[]}
        managedWarehouses={[]}
        projects={[PROJECT]}
        onTabChange={vi.fn()}
        salaryPayments={salaryPayments}
        workHistory={[]}
      />
    </QueryClientProvider>,
  )
}

describe("EmployeeDetailsPage earnings entry", () => {
  beforeEach(() => {
    approveEarning.mockReset().mockResolvedValue({})
    localStorage.clear()
  })

  afterEach(cleanup)

  it("shows the exact daily reference and opens the shared approval dialog", async () => {
    renderDetails(worker({ salaryReference: { period: "DAILY", amount: "4500.1234" } }))

    expect(screen.getByText("4,500.1234")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "إضافة دفعة" })[0]!)

    const dialog = await screen.findByRole("dialog")
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain("عامل الرواتب")
    expect(screen.queryByRole("button", { name: "حفظ دفعة الراتب" })).toBeNull()
  })

  it("keeps a legal zero reference distinct from a missing reference and shows monthly precision", () => {
    renderDetails(worker({ salaryReference: { period: "WEEKLY", amount: "1250.50" } }))
    const weeklySalaryCard = screen.getByText("الأجر الحالي").closest("article")!
    expect(within(weeklySalaryCard).getByText("1,250.5")).toBeTruthy()

    cleanup()
    renderDetails(worker({ salaryReference: { period: "MONTHLY", amount: "0" } }))
    const zeroSalaryCard = screen.getByText("الأجر الحالي").closest("article")!
    expect(within(zeroSalaryCard).getByText("0")).toBeTruthy()

    cleanup()
    renderDetails(worker({ salaryReference: null }))
    const missingSalaryCard = screen.getByText("الأجر الحالي").closest("article")!
    expect(within(missingSalaryCard).getByText("غير محدد")).toBeTruthy()
    expect(within(missingSalaryCard).queryByText("0")).toBeNull()
  })

  it("opens approval without a salary reference and accepts an explicit earned amount", async () => {
    renderDetails(worker({ salaryReference: null }))
    fireEvent.click(screen.getAllByRole("button", { name: "إضافة دفعة" })[0]!)

    await screen.findByRole("dialog")
    fireEvent.change(screen.getByLabelText("إجمالي الأجر المعتمد بالدينار الجزائري"), { target: { value: "1250" } })
    fireEvent.change(screen.getByLabelText("المبلغ غير الموزع بالدينار الجزائري"), { target: { value: "1250" } })
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الأجر" }))

    await waitFor(() => expect(approveEarning).toHaveBeenCalledTimes(1))
    expect(approveEarning.mock.calls[0]![0]).toMatchObject({
      employeeId: "worker-1",
      currencyCode: "DZD",
      totalAmount: "1250.00",
      unallocatedAmount: "1250.00",
      segments: [],
    })
    expect(approveEarning.mock.calls[0]![0].referenceSalary).toBeNull()
  })

  it("keeps recorded salary payments and their day count read-only", () => {
    renderDetails(worker(), [{
      id: "payment-1",
      paymentDate: "2026-03-31T00:00:00.000Z",
      days: 15,
      expectedAmountDzd: 15000,
      actualAmountDzd: 15000,
      periodType: "MONTHLY",
      note: null,
    }])

    expect(screen.getByRole("columnheader", { name: "الأيام" })).toBeTruthy()
    expect(screen.getByText("15")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "حفظ دفعة الراتب" })).toBeNull()
  })
})

describe("stored business day timezone (#473)", () => {
  let restoreTimeZone: () => void

  beforeEach(() => {
    restoreTimeZone = pinUtcTimeZone()
  })

  afterEach(() => {
    cleanup()
    restoreTimeZone()
  })

  it("runs under UTC so the assertions are not vacuous", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC")
    expect(ALGERIA_DAY).not.toBe(UTC_DAY)
  })

  it("renders the salary payment history date on its Algeria day, not the ambient UTC day", () => {
    renderDetails(worker(), [{
      id: "payment-1",
      paymentDate: MIDNIGHT_CROSSING,
      days: 15,
      expectedAmountDzd: 15000,
      actualAmountDzd: 15000,
      periodType: "MONTHLY",
      note: null,
    }])

    expect(screen.getByText(ALGERIA_DAY)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY)).toBeNull()
  })
})
