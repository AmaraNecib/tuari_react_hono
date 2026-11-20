// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mutateAsync, approveAsync, sessionUser, earnings } = vi.hoisted(() => ({ mutateAsync: vi.fn(), approveAsync: vi.fn(), sessionUser: { id: "user-1" }, earnings: [] as Array<Record<string, unknown>> }))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateSalaryPaymentMutation: () => ({ mutateAsync, isPending: false, isSuccess: false, reset: vi.fn() }),
}))
vi.mock("@/features/employees/employee-earnings-queries", () => ({
  useApproveEmployeeEarningMutation: () => ({ mutateAsync: approveAsync, isPending: false }),
  useEmployeeEarningsQuery: () => ({ data: { items: earnings }, isPending: false, isError: false }),
}))
vi.mock("@/features/employees/employee-payroll-panel", () => ({ EmployeePayrollPanel: ({ employeeId }: { employeeId: string }) => <div data-testid="payroll-panel" data-employee-id={employeeId} /> }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: sessionUser } }) }))
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => (
    <input aria-label={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

import { ALGERIA_DAY, MIDNIGHT_CROSSING, UTC_DAY, pinUtcTimeZone } from "@/test-utils/algeria-day"

import { SalariesSection as SalariesSectionView } from "./salaries-section"

type SalariesSectionProps = ComponentProps<typeof SalariesSectionView>
function SalariesSection({ employees = [], ...props }: Omit<SalariesSectionProps, "employees"> & { employees?: SalariesSectionProps["employees"] }) {
  return <SalariesSectionView employees={employees} {...props} />
}

const PROJECT = { id: "project-1", name: "مشروع ألف" }

function worker(salaryAmount: string | null = "30000") {
  return {
    employeeId: "worker-1",
    employeeName: "عامل الرواتب",
    employeePhone: "0555000001",
    employeeRole: "عامل",
    salaryReference: salaryAmount === null ? null : { period: "MONTHLY" as const, amount: salaryAmount },
    lastPaymentDate: null,
    projectAssignments: [],
  }
}

const PAYMENT = {
  id: "payment-1",
  employeeId: "worker-1",
  employeeName: "عامل الرواتب",
  employeePhone: "0555000001",
  employeeRole: "عامل",
  paymentDate: "2026-03-31T00:00:00.000Z",
  days: 30,
  expectedAmountDzd: 30000,
  actualAmountDzd: 30000,
  projectSplits: [
    { projectId: PROJECT.id, days: 15 },
    { projectId: "project-2", days: 15 },
  ],
  note: null,
}

function renderSection() {
  return render(
    <SalariesSection
      onEditSalary={vi.fn()}
      projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
      recentPayments={[PAYMENT]}
      workers={[worker()]}
    />,
  )
}

describe("SalariesSection (#412)", () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    approveAsync.mockReset()
    earnings.length = 0
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("opens payroll controls for the selected worker on the salary earnings tab", () => {
    renderSection()
    fireEvent.click(screen.getByRole("tab", { name: "سجل الأجور المعتمدة" }))

    expect((screen.getByLabelText("الموظف") as HTMLSelectElement).value).toBe("worker-1")
    expect(screen.getByTestId("payroll-panel").getAttribute("data-employee-id")).toBe("worker-1")
  })

  it("routes approval from the worker table without treating it as a payment", () => {
    const onAddPayment = vi.fn()
    render(
      <SalariesSection onAddPayment={onAddPayment} onEditSalary={vi.fn()} projects={[PROJECT]} recentPayments={[]} workers={[worker("30000.25")]} />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))
    fireEvent.click(screen.getByRole("button", { name: "اعتماد الأجر" }))

    expect(onAddPayment).toHaveBeenCalledWith("worker-1", "عامل الرواتب")
    expect(approveAsync).not.toHaveBeenCalled()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it("shows each project's days and prorated amount in the payment history row", () => {
    renderSection()

    // The row is not enough on its own: the operator must see which projects
    // received the days and how the paid amount was shared. Scoped to the table
    // because the project filter options repeat the same names.
    const table = within(screen.getByRole("table"))
    expect(table.getByText("مشروع ألف")).toBeTruthy()
    expect(table.getByText("مشروع باء")).toBeTruthy()
    expect(table.getAllByText("15 يوم").length).toBe(2)
    expect(table.getAllByText(/15,000/).length).toBe(2)
  })

  it("reconciles the displayed split shares with the paid amount", () => {
    const payment = {
      ...PAYMENT,
      days: 3,
      expectedAmountDzd: 100,
      actualAmountDzd: 100,
      projectSplits: [
        { projectId: PROJECT.id, days: 1 },
        { projectId: "project-2", days: 1 },
        { projectId: "project-3", days: 1 },
      ],
    }

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[
          PROJECT,
          { id: "project-2", name: "مشروع باء" },
          { id: "project-3", name: "مشروع جيم" },
        ]}
        recentPayments={[payment]}
        workers={[worker("30000")]}
      />,
    )

    // Three one-day lines of a 100 DZD payment must sum to 100, not 99.99:
    // the leftover cent lands on the first line and is shown.
    expect(screen.getByText(/33\.34/)).toBeTruthy()
    expect(screen.getAllByText(/33\.33/).length).toBe(2)
  })

  it("renders the paid and expected amounts with the shares' precision", () => {
    const payment = {
      ...PAYMENT,
      days: 2,
      expectedAmountDzd: 100.5,
      actualAmountDzd: 100.5,
      projectSplits: [
        { projectId: PROJECT.id, days: 1 },
        { projectId: "project-2", days: 1 },
      ],
    }

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
        recentPayments={[payment]}
        workers={[worker("30000")]}
      />,
    )

    // Whole-dinar rounding would show 101 paid beside 50.25 shares; the row
    // must render both at cent precision so they visibly reconcile.
    expect(screen.getAllByText(/100\.5/).length).toBe(2)
    expect(screen.queryByText(/101/)).toBeNull()
    expect(screen.getAllByText(/50\.25/).length).toBe(2)
  })

  it("lists salaried workers and exposes the approval action", () => {
    const onAddPayment = vi.fn()
    render(
      <SalariesSection
        onAddPayment={onAddPayment}
        onEditSalary={vi.fn()}
        projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
        recentPayments={[PAYMENT]}
        workers={[
          {
            ...worker("30000"),
            employeeId: "w-monthly",
            employeeName: "عامل شهري",
            lastPaymentDate: "2026-03-31T00:00:00.000Z",
          },
          {
            ...worker("1500"),
            employeeId: "w-daily",
            employeeName: "عامل يومي",
            salaryReference: { period: "DAILY" as const, amount: "1500" },
          },
          {
            ...worker(null),
            employeeId: "w-none",
            employeeName: "عامل بلا أجر",
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))

    expect(screen.getByText("عامل شهري")).toBeTruthy()
    expect(screen.getByText("عامل يومي")).toBeTruthy()
    // Each worker's wage carries its own period label.
    expect(screen.getByText("/ شهري")).toBeTruthy()
    expect(screen.getByText("/ يومي")).toBeTruthy()
    // A worker without a wage renders the placeholder rather than a zero wage.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)

    // Approval is delegated to the route owner; this table does not create a payment.
    const monthlyRow = screen.getByRole("row", { name: /عامل شهري/ })
    fireEvent.click(within(monthlyRow).getByRole("button", { name: "اعتماد الأجر" }))
    expect(onAddPayment).toHaveBeenCalledWith("w-monthly", "عامل شهري")
  })

  it("shows the workers empty state when no worker has a wage", () => {
    render(
      <SalariesSection onEditSalary={vi.fn()} projects={[]} recentPayments={[]} workers={[]} />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))

    expect(screen.getByText("لا يوجد عاملون بإعدادات راتب جاهزة حاليًا.")).toBeTruthy()
  })

  it("keeps names for employees without a salary reference or after it is cleared", () => {
    earnings.push(
      { id: "earning-no-reference", employeeId: "employee-no-reference", periodStart: "2026-03-01T00:00:00.000Z", periodEnd: "2026-03-31T00:00:00.000Z", approvedAt: "2026-04-01T00:00:00.000Z", totalAmount: "100.00", unallocatedAmount: "100.00", segments: [] },
      { id: "earning-cleared-reference", employeeId: "employee-cleared-reference", periodStart: "2026-03-01T00:00:00.000Z", periodEnd: "2026-03-31T00:00:00.000Z", approvedAt: "2026-04-01T00:00:00.000Z", totalAmount: "200.00", unallocatedAmount: "200.00", segments: [] },
    )
    render(
      <SalariesSection
        employees={[
          { id: "employee-no-reference", name: "عامل بلا مرجع" },
          { id: "employee-cleared-reference", name: "عامل أزيل مرجعه" },
        ]}
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={[]}
        workers={[]}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))
    expect(screen.getByText("لا يوجد عاملون بإعدادات راتب جاهزة حاليًا.")).toBeTruthy()
    expect(screen.queryByText("عامل بلا مرجع")).toBeNull()
    expect(screen.queryByText("عامل أزيل مرجعه")).toBeNull()

    fireEvent.click(screen.getByRole("tab", { name: "سجل الأجور المعتمدة" }))
    const history = screen.getByRole("table", { name: "سجل الأجور المعتمدة" })
    expect(within(history).getByText("عامل بلا مرجع")).toBeTruthy()
    expect(within(history).getByText("عامل أزيل مرجعه")).toBeTruthy()
    expect(within(history).queryByText("employee-no-reference")).toBeNull()
    expect(within(history).queryByText("employee-cleared-reference")).toBeNull()
  })
})

/**
 * Owner item 7: the salary tables must window through the shared
 * `usePaginatedRows` + `TablePaginationControls` primitives, and search/filters
 * must operate on the rows the tables actually display.
 */
function makePayments(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `payment-${String(index + 1).padStart(2, "0")}`,
    employeeId: `worker-${String(index + 1).padStart(2, "0")}`,
    employeeName: `عامل ${String(index + 1).padStart(2, "0")}`,
    employeePhone: `055500${String(index + 1).padStart(4, "0")}`,
    employeeRole: "عامل",
    paymentDate: "2026-03-31T00:00:00.000Z",
    days: 30,
    expectedAmountDzd: 30000,
    actualAmountDzd: 30000,
    periodType: "MONTHLY" as const,
    projectSplits: [],
    note: null,
  }))
}

function makeWorkers(count: number, period: "MONTHLY" | "DAILY", idOffset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1 + idOffset
    return {
      employeeId: `worker-${String(number).padStart(2, "0")}`,
      employeeName: `عامل ${String(number).padStart(2, "0")}`,
      employeePhone: `055500${String(number).padStart(4, "0")}`,
      employeeRole: "عامل",
      salaryReference: { period, amount: "30000" },
      lastPaymentDate: null,
      projectAssignments: [],
    }
  })
}

/** The page-size select is the control with the 10/25/50/100 presets. */
function getPageSizeSelect(): HTMLSelectElement | undefined {
  const pageSizeSelects = (screen.getAllByRole("combobox") as HTMLSelectElement[]).filter(
    (select) => Array.from(select.options).map((option) => option.value).join(",") === "10,25,50,100",
  )
  const activeTabIndex = screen.getAllByRole("tab").findIndex((tab) => tab.getAttribute("aria-selected") === "true")
  return pageSizeSelects[activeTabIndex] ?? pageSizeSelects[0]
}

function clickNextPage(pageStatus: string) {
  const status = screen.getByText(pageStatus)
  const controls = status.parentElement
  if (!controls) throw new Error(`Missing pagination controls for ${pageStatus}`)
  const buttons = within(controls).getAllByRole("button")
  fireEvent.click(buttons[1]!)
}

describe("SalariesSection table controls (owner items 6 and 7)", () => {
  beforeEach(() => {
    mutateAsync.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  // The history table repeats project/worker names in the filter option lists,
  // so row assertions are scoped to the table itself.
  const historyTable = () => within(screen.getByRole("table"))

  it("shows every payment and no next page when the history is exactly one page", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(10)}
        workers={[]}
      />,
    )

    // Exactly one page: all ten rows, a disabled Next, and the page-size
    // control still reachable so the operator can change the window.
    expect(screen.getByText("1-10 من 10")).toBeTruthy()
    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true)
    // The page-size control is reachable and still on its default size at one page.
    expect(getPageSizeSelect()?.value).toBe("10")
  })

  it("windows the payment history through the shared pagination controls", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(23)}
        workers={[]}
      />,
    )

    expect(historyTable().getByText("عامل 01")).toBeTruthy()
    expect(historyTable().queryByText("عامل 11")).toBeNull()
    expect(screen.getByText("1-10 من 23")).toBeTruthy()
    expect(screen.getByText("1 / 3")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(historyTable().getByText("عامل 11")).toBeTruthy()
    expect(historyTable().queryByText("عامل 01")).toBeNull()
    expect(screen.getByText("2 / 3")).toBeTruthy()
  })

  it("clamps the payment page on the first render after the history shrinks across a boundary", () => {
    const { rerender } = render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(23)}
        workers={[]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("3 / 3")).toBeTruthy()

    rerender(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(12)}
        workers={[]}
      />,
    )

    // The shared hook clamps synchronously, so the first render after the
    // shrink already shows page 2 with its rows rather than an empty page 3.
    expect(screen.getByText("2 / 2")).toBeTruthy()
    expect(screen.getByText("11-12 من 12")).toBeTruthy()
    expect(historyTable().getByText("عامل 11")).toBeTruthy()
    expect(historyTable().getByText("عامل 12")).toBeTruthy()
  })

  it("resets the payment page to 1 when the search changes", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(23)}
        workers={[]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "عامل 05" } })

    // Filtering to one row must land on page 1, not stay on the now-empty
    // page 2.
    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect(screen.getByText("1-1 من 1")).toBeTruthy()
    expect(historyTable().getByText("عامل 05")).toBeTruthy()
    expect(historyTable().queryByText("عامل 01")).toBeNull()
  })

  it("filters the payment history by project and resets to page 1", () => {
    const payments = makePayments(23).map((payment, index) => ({
      ...payment,
      projectSplits: [{ projectId: index % 2 === 0 ? "project-1" : "project-2", days: 30 }],
    }))

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[
          { id: "project-1", name: "مشروع ألف" },
          { id: "project-2", name: "مشروع باء" },
        ]}
        recentPayments={payments}
        workers={[]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/المشروع/), { target: { value: "project-2" } })

    // 11 of the 23 payments belong to project-2; the page resets to 1.
    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-10 من 11")).toBeTruthy()
    expect(historyTable().getByText("عامل 02")).toBeTruthy()
    expect(historyTable().queryByText("عامل 01")).toBeNull()
  })

  it("filters the workers by period and resets to page 1", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={[]}
        workers={[...makeWorkers(15, "MONTHLY"), ...makeWorkers(12, "DAILY", 15)]}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))
    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/الدورية/), { target: { value: "DAILY" } })

    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-10 من 12")).toBeTruthy()
    expect(within(screen.getByRole("table")).getByText("عامل 16")).toBeTruthy()
    expect(within(screen.getByRole("table")).queryByText("عامل 01")).toBeNull()
  })

  it("resets shared pagination on tab changes", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(23)}
        workers={makeWorkers(40, "MONTHLY")}
      />,
    )

    clickNextPage("1 / 3")
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.click(screen.getByRole("tab", { name: "\u0627\u0644\u0639\u0627\u0645\u0644\u0648\u0646\u0020\u0627\u0644\u062c\u0627\u0647\u0632\u0648\u0646\u0020\u0644\u062a\u0633\u062c\u064a\u0644\u0020\u062f\u0641\u0639\u0629" }))
    expect(screen.getByText("1 / 4")).toBeTruthy()
    expect(screen.getByText("1-10 \u0645\u0646 40")).toBeTruthy()
    clickNextPage("1 / 4")
    expect(screen.getByText("2 / 4")).toBeTruthy()

    fireEvent.change(getPageSizeSelect()!, { target: { value: "25" } })
    expect(screen.getByText("1 / 2")).toBeTruthy()
    clickNextPage("1 / 2")
    expect(screen.getByText("2 / 2")).toBeTruthy()

    fireEvent.click(screen.getByRole("tab", { name: "\u0622\u062e\u0631\u0020\u062f\u0641\u0639\u0627\u062a\u0020\u0627\u0644\u0631\u0648\u0627\u062a\u0628" }))
    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect(screen.getByText("1-23 \u0645\u0646 23")).toBeTruthy()
    expect(getPageSizeSelect()?.value).toBe("25")
  }, 15000) // Instrumented coverage runs this multi-render test past the 5s default; the assertions are the guard.

  it("shows a no-results message instead of dead controls when a filter matches nothing", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(3)}
        workers={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "لا يوجد" } })

    expect(screen.getByText("لا توجد نتائج")).toBeTruthy()
    expect(historyTable().queryByText("عامل 01")).toBeNull()
    // No rows means no pagination bar: the range must not read "0-0 of 0" next
    // to the empty state, and the search field stays so the filter can be cleared.
    expect(screen.queryByText("0-0 من 0")).toBeNull()
    expect(getPageSizeSelect()).toBeUndefined()
    expect(screen.getByLabelText("بحث باسم العامل...")).toBeTruthy()
  })

  it("changes the page size from the shared control and re-windows the table", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(23)}
        workers={[]}
      />,
    )

    expect(screen.getByText("1-10 من 23")).toBeTruthy()

    const pageSizeSelect = getPageSizeSelect()
    expect(pageSizeSelect?.value).toBe("10")
    fireEvent.change(pageSizeSelect!, { target: { value: "25" } })

    // 23 rows at 25/page is one page: the window and the range line follow the
    // new size, and no stale page 2 survives.
    expect(screen.getByText("1-23 من 23")).toBeTruthy()
    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect(historyTable().getByText("عامل 23")).toBeTruthy()
  })

  it("applies the search and the project filter together", () => {
    const payments = makePayments(23).map((payment, index) => ({
      ...payment,
      projectSplits: [{ projectId: index % 2 === 0 ? "project-1" : "project-2", days: 30 }],
    }))

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[
          { id: "project-1", name: "مشروع ألف" },
          { id: "project-2", name: "مشروع باء" },
        ]}
        recentPayments={payments}
        workers={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText(/المشروع/), { target: { value: "project-1" } })
    expect(screen.getByText("1-10 من 12")).toBeTruthy()

    // Search and filter are ANDed, not either/or: only the project-1 payment
    // whose worker matches remains, and the page resets to 1 for the join.
    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), {
      target: { value: "عامل 01" },
    })
    expect(screen.getByText("1-1 من 1")).toBeTruthy()
    expect(historyTable().getByText("عامل 01")).toBeTruthy()
    expect(historyTable().queryByText("عامل 03")).toBeNull()
  })

  it("shows one page with no phantom next when a filter matches exactly the page size", () => {
    const payments = makePayments(23).map((payment, index) => ({
      ...payment,
      projectSplits: [{ projectId: index < 10 ? "project-1" : "project-2", days: 30 }],
    }))

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[
          { id: "project-1", name: "مشروع ألف" },
          { id: "project-2", name: "مشروع باء" },
        ]}
        recentPayments={payments}
        workers={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText(/المشروع/), { target: { value: "project-1" } })

    expect(screen.getByText("1-10 من 10")).toBeTruthy()
    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("allows approval after a same-month payment without proposing a payment amount", () => {
    const paidThisMonth = {
      ...makeWorkers(1, "MONTHLY")[0]!,
      lastPaymentDate: "2026-03-20T00:00:00.000Z",
    }
    const payment = {
      ...makePayments(1)[0]!,
      employeeId: paidThisMonth.employeeId,
      employeeName: paidThisMonth.employeeName,
    }

    const onAddPayment = vi.fn()
    render(
      <SalariesSection
        onAddPayment={onAddPayment}
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={[payment]}
        workers={[paidThisMonth]}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))
    const payButton = within(screen.getByRole("table")).getByRole("button", { name: "اعتماد الأجر" })
    // A monthly guard would disable this for a worker already paid this month.
    expect(payButton.hasAttribute("disabled")).toBe(false)

    fireEvent.click(payButton)
    // The full-page route receives identity only, not the historical cash amount.
    expect(onAddPayment).toHaveBeenCalledWith(paidThisMonth.employeeId, paidThisMonth.employeeName)
  })

  it("does not render a remaining or paid-vs-salary balance (owner item 6, decision C)", () => {
    const payment = {
      ...makePayments(1)[0]!,
      employeeId: "worker-01",
      expectedAmountDzd: 30000,
      actualAmountDzd: 12000,
    }

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={[payment]}
        workers={[makeWorkers(1, "MONTHLY")[0]!]}
      />,
    )

    // The payment's own figures render (expected 30000, paid 12000), but no
    // derived "remaining 18000" / balance figure is computed on the screen.
    expect(historyTable().getByText(/30,000/)).toBeTruthy()
    expect(historyTable().getByText(/12,000/)).toBeTruthy()
    expect(screen.queryByText(/18,000|18000/)).toBeNull()
    expect(screen.queryByText(/المتبقي|متبق|الرصيد|رصيد/)).toBeNull()
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

  it("renders the payment history date on its Algeria day, not the ambient UTC day", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[PROJECT]}
        recentPayments={[{ ...PAYMENT, paymentDate: MIDNIGHT_CROSSING }]}
        workers={[worker("30000")]}
      />,
    )

    expect(screen.getByText(ALGERIA_DAY)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY)).toBeNull()
  })

  it("renders the workers' last-payment date on its Algeria day, not the ambient UTC day", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[PROJECT]}
        recentPayments={[]}
        workers={[{ ...worker("30000"), lastPaymentDate: MIDNIGHT_CROSSING }]}
      />,
    )
    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))

    expect(screen.getByText(ALGERIA_DAY)).toBeTruthy()
    expect(screen.queryByText(UTC_DAY)).toBeNull()
  })
})
