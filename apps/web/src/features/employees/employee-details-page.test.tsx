// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

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
vi.mock("@/features/employees/employee-payroll-panel", () => ({ EmployeePayrollPanel: () => null }))
vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: () => ({ data: { user: sessionUser } }),
}))
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => (
    <input aria-label={id} type="date" value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

import { EmployeeDetailsPage } from "./employee-details-page"
import type { ExactDebtsClient } from "@tuari/contracts"
import type { EmployeeTableRow } from "./employee-table"

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

function renderDetails(employee: EmployeeTableRow = worker(), onApproveEarning = vi.fn(), activeTab = "finance") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <EmployeeDetailsPage
        activeTab={activeTab}
        debtClient={{ summary: vi.fn().mockResolvedValue({ accounts: [], grossPayableDzd: "0.00", grossReceivableDzd: "0.00" }) } as unknown as ExactDebtsClient}
        employee={employee}
        managedProjects={[]}
        managedWarehouses={[]}
        projects={[PROJECT]}
        onTabChange={vi.fn()}
        onApproveEarning={onApproveEarning}
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

  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); window.dispatchEvent(new Event("popstate")) })

  it("keeps the employee debt tab selected while the composed ledger changes its inner tab", async () => {
    window.history.replaceState({}, "", "/employees/worker-1?tab=debts")
    const account = { id: "account-1", partyType: "INTERNAL_WORKER", workerId: "worker-1", externalCounterpartyId: null, direction: "PAYABLE", currency: "DZD", currentBalance: "25.00" }
    const debtClient = { summary: vi.fn().mockResolvedValue({ accounts: [account], grossPayableDzd: "25.00", grossReceivableDzd: "0.00" }) } as unknown as ExactDebtsClient
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={queryClient}><EmployeeDetailsPage activeTab="debts" debtClient={debtClient} employee={worker()} managedProjects={[]} managedWarehouses={[]} projects={[PROJECT]} onTabChange={vi.fn()} workHistory={[]} /></QueryClientProvider>)
    expect((await screen.findByRole("tab", { name: "الديون" })).getAttribute("aria-selected")).toBe("true")
    await screen.findByRole("button", { name: /25/ })
    fireEvent.click(screen.getByRole("tab", { name: "اختيار أو إنشاء حساب" }))
    expect(new URLSearchParams(location.search).get("tab")).toBe("debts")
    expect(new URLSearchParams(location.search).get("debtTab")).toBe("accounts")
    expect(screen.getByRole("tab", { name: "الديون" }).getAttribute("aria-selected")).toBe("true")
    view.unmount()
    render(<QueryClientProvider client={queryClient}><EmployeeDetailsPage activeTab={new URLSearchParams(location.search).get("tab")!} debtClient={debtClient} employee={worker()} managedProjects={[]} managedWarehouses={[]} projects={[PROJECT]} onTabChange={vi.fn()} workHistory={[]} /></QueryClientProvider>)
    expect(screen.getByRole("tab", { name: "الديون" }).getAttribute("aria-selected")).toBe("true")
    expect(new URLSearchParams(location.search).get("debtTab")).toBe("accounts")
    cleanup()
  })

  it("keeps the exact daily reference and routes both approval actions to the full page", () => {
    const onApproveEarning = vi.fn()
    renderDetails(worker({ salaryReference: { period: "DAILY", amount: "4500.1234" } }), onApproveEarning)

    expect(screen.getByText("4,500.1234")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "اعتماد الأجر" })[0]!)
    fireEvent.click(screen.getAllByRole("button", { name: "اعتماد الأجر" })[1]!)

    expect(onApproveEarning).toHaveBeenNthCalledWith(1, "worker-1")
    expect(onApproveEarning).toHaveBeenNthCalledWith(2, "worker-1")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("offers approval from an active manager profile without adding a worker-only debt tab", () => {
    const onApproveEarning = vi.fn()
    renderDetails(worker({ isWorker: false, roleKey: "project_manager", role: "مدير مشروع" }), onApproveEarning)

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
    renderDetails(worker({ salaryReference: null }), onApproveEarning)
    fireEvent.click(screen.getAllByRole("button", { name: "اعتماد الأجر" })[0]!)

    expect(onApproveEarning).toHaveBeenCalledWith("worker-1")
    expect(approveEarning).not.toHaveBeenCalled()
  })

  it("does not present retired expected-versus-paid metrics as empty financial data", () => {
    renderDetails()
    expect(screen.queryByRole("columnheader", { name: "الأيام" })).toBeNull()
    expect(screen.getByRole("heading", { name: "سجل الأجور المعتمدة" })).toBeTruthy()
  })
})
