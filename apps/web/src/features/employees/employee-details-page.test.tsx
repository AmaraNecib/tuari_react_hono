// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentProps, ReactNode } from "react"
import { ALGERIA_DAY, MIDNIGHT_CROSSING, UTC_DAY, pinUtcTimeZone } from "@/test-utils/algeria-day"

const { approveEarning, sessionUser, earningHistoryItems } = vi.hoisted(() => ({
  approveEarning: vi.fn(),
  sessionUser: { id: "user-1" },
  earningHistoryItems: [] as unknown[],
}))

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")
  return { ...actual, Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a> }
})
vi.mock("@/features/employees/employee-earnings-queries", () => ({
  useApproveEmployeeEarningMutation: () => ({ mutateAsync: approveEarning, isPending: false }),
  useEmployeeEarningsQuery: () => ({ data: { items: earningHistoryItems }, isPending: false, isError: false, isFetching: false, error: null, refetch: vi.fn() }),
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

function renderDetails(employee: EmployeeTableRow = worker(), salaryPayments: SalaryPaymentsProp = [], onApproveEarning = vi.fn()) {
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
        onApproveEarning={onApproveEarning}
        salaryPayments={salaryPayments}
        workHistory={[]}
      />
    </QueryClientProvider>,
  )
}

describe("EmployeeDetailsPage earnings entry", () => {
  beforeEach(() => {
    approveEarning.mockReset().mockResolvedValue({})
    earningHistoryItems.length = 0
    localStorage.clear()
  })

  afterEach(cleanup)

  it("keeps the exact daily reference and routes both approval actions to the full page", () => {
    const onApproveEarning = vi.fn()
    renderDetails(worker({ salaryReference: { period: "DAILY", amount: "4500.1234" } }), [], onApproveEarning)

    expect(screen.getByText("4,500.1234")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "اعتماد الأجر" })[0]!)
    fireEvent.click(screen.getAllByRole("button", { name: "اعتماد الأجر" })[1]!)

    expect(onApproveEarning).toHaveBeenNthCalledWith(1, "worker-1")
    expect(onApproveEarning).toHaveBeenNthCalledWith(2, "worker-1")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("offers approval from an active manager profile without adding a worker-only debt tab", () => {
    const onApproveEarning = vi.fn()
    renderDetails(worker({ isWorker: false, roleKey: "project_manager", role: "مدير مشروع" }), [], onApproveEarning)

    const actions = screen.getAllByRole("button", { name: "اعتماد الأجر" })
    expect(actions).toHaveLength(2)
    fireEvent.click(actions[0]!)
    fireEvent.click(actions[1]!)
    expect(onApproveEarning).toHaveBeenCalledTimes(2)
    expect(onApproveEarning).toHaveBeenLastCalledWith("worker-1")
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.queryByRole("tab", { name: "الديون" })).toBeNull()
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

  it("uses the current project name in approved-earnings history", () => {
    earningHistoryItems.push({
      id: "earning-1",
      employeeId: "worker-1",
      periodStart: "2026-03-01T00:00:00.000Z",
      periodEnd: "2026-03-31T23:59:59.999Z",
      currencyCode: "DZD",
      totalAmount: "100.00",
      unallocatedAmount: "0.00",
      referenceSalary: null,
      segments: [{ id: "segment-1", projectId: PROJECT.id, days: 1, amount: "100.00" }],
      approvedAt: "2026-04-01T09:00:00.000Z",
      actorUserId: "user-1",
      transactionId: "transaction-1",
      createdAt: "2026-04-01T09:00:00.000Z",
    })

    renderDetails()

    expect(screen.getByRole("heading", { name: "سجل الأجور المعتمدة" })).toBeTruthy()
    expect(screen.getByText(PROJECT.name)).toBeTruthy()
    expect(screen.queryByText(PROJECT.id)).toBeNull()
  })

  it("routes approval for an employee without a salary reference", () => {
    const onApproveEarning = vi.fn()
    renderDetails(worker({ salaryReference: null }), [], onApproveEarning)
    fireEvent.click(screen.getAllByRole("button", { name: "اعتماد الأجر" })[0]!)

    expect(onApproveEarning).toHaveBeenCalledWith("worker-1")
    expect(approveEarning).not.toHaveBeenCalled()
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
