// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateSalaryPaymentMutation: () => ({ mutateAsync, isPending: false, isSuccess: false, reset: vi.fn() }),
}))

import { SalariesSection } from "./salaries-section"

const PROJECT = { id: "project-1", name: "مشروع ألف" }

function worker(salaryAmountDzd: number) {
  return {
    employeeId: "worker-1",
    employeeName: "عامل الرواتب",
    employeePhone: "0555000001",
    employeeRole: "عامل",
    salaryAmountDzd,
    salaryPeriod: "MONTHLY" as const,
    lastPaymentDate: null,
    // An open-ended window far wider than any payment month: the derived
    // default always covers the dialog's period.
    projectAssignments: [{ projectId: PROJECT.id, startDate: "2000-01-01T00:00:00+01:00", endDate: null }],
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
  const view = render(
    <SalariesSection
      onEditSalary={vi.fn()}
      projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
      recentPayments={[PAYMENT]}
      workers={[worker(30000)]}
    />,
  )

  return {
    view,
    // Simulate a workspace refresh that changes the worker's wage while the
    // payment dialog stays open.
    refreshWage: (salaryAmountDzd: number) =>
      view.rerender(
        <SalariesSection
          onEditSalary={vi.fn()}
          projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
          recentPayments={[PAYMENT]}
          workers={[worker(salaryAmountDzd)]}
        />,
      ),
  }
}

describe("SalariesSection (#412)", () => {
  beforeEach(() => {
    mutateAsync.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("re-derives the open dialog's proposal from live query data after a wage refresh", () => {
    const { refreshWage } = renderSection()

    fireEvent.click(screen.getAllByRole("button", { name: "إضافة دفعة" })[0]!)

    // The dialog proposed salary / 30 x 30 days.
    expect(screen.getAllByDisplayValue("30000").length).toBeGreaterThan(0)

    // A workspace refresh changes the wage underneath the open dialog: the
    // proposal must follow rather than staying on the snapshotted value.
    refreshWage(60000)
    expect(screen.getAllByDisplayValue("60000").length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue("30000")).toBeNull()
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
        workers={[worker(30000)]}
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
        workers={[worker(30000)]}
      />,
    )

    // Whole-dinar rounding would show 101 paid beside 50.25 shares; the row
    // must render both at cent precision so they visibly reconcile.
    expect(screen.getAllByText(/100\.5/).length).toBe(2)
    expect(screen.queryByText(/101/)).toBeNull()
    expect(screen.getAllByText(/50\.25/).length).toBe(2)
  })

  it("lists the salaried workers with their wage, period, and last payment on the workers tab", () => {
    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[PROJECT, { id: "project-2", name: "مشروع باء" }]}
        recentPayments={[PAYMENT]}
        workers={[
          {
            ...worker(30000),
            employeeId: "w-monthly",
            employeeName: "عامل شهري",
            salaryPeriod: "MONTHLY" as const,
            lastPaymentDate: "2026-03-31T00:00:00.000Z",
          },
          {
            ...worker(1500),
            employeeId: "w-daily",
            employeeName: "عامل يومي",
            salaryPeriod: "DAILY" as const,
          },
          {
            ...worker(0),
            employeeId: "w-none",
            employeeName: "عامل بلا أجر",
            salaryAmountDzd: null,
            salaryPeriod: null,
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

    // The row's action opens the payment dialog for that worker.
    fireEvent.click(screen.getAllByRole("button", { name: "إضافة دفعة" })[0]!)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("shows the workers empty state when no worker has a wage", () => {
    render(
      <SalariesSection onEditSalary={vi.fn()} projects={[]} recentPayments={[]} workers={[]} />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))

    expect(screen.getByText("لا يوجد عاملون بإعدادات راتب جاهزة حاليًا.")).toBeTruthy()
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
      salaryAmountDzd: 30000,
      salaryPeriod: period,
      lastPaymentDate: null,
      projectAssignments: [],
    }
  })
}

/** The page-size select is the control with the 10/25/50/100 presets. */
function getPageSizeSelect(): HTMLSelectElement | undefined {
  return (screen.getAllByRole("combobox") as HTMLSelectElement[]).find(
    (select) => Array.from(select.options).map((option) => option.value).join(",") === "10,25,50,100",
  )
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

  it("keeps each tab's page, search and page size when the operator switches tabs", () => {
    // The workers fixture carries its own name token so each tab's search is
    // recognisably its own, and both tabs span more than one page.
    const workers = makeWorkers(40, "MONTHLY").map((row, index) => ({
      ...row,
      employeeName: `صانع ${String(index + 1).padStart(2, "0")}`,
    }))

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={makePayments(23)}
        workers={workers}
      />,
    )

    // History tab: its own search, page 2 of 3 and the default page size.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "عامل" } })
    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()
    expect(screen.getByText("11-20 من 23")).toBeTruthy()

    // Workers tab: a different search, a different page size, page 2 of 2.
    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "صانع" } })
    fireEvent.change(getPageSizeSelect()!, { target: { value: "25" } })
    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 2")).toBeTruthy()
    expect(screen.getByText("26-40 من 40")).toBeTruthy()

    const expectVisibleState = (page: string, range: string, query: string, pageSize: string) => {
      expect(screen.getByText(page)).toBeTruthy()
      expect(screen.getByText(range)).toBeTruthy()
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(query)
      expect(getPageSizeSelect()?.value).toBe(pageSize)
    }

    // Each visit must restore that tab's OWN state, never the other tab's, and
    // a second round trip proves the state was retained rather than recomputed.
    for (let roundTrip = 0; roundTrip < 2; roundTrip += 1) {
      fireEvent.click(screen.getByRole("tab", { name: "آخر دفعات الرواتب" }))
      expectVisibleState("2 / 3", "11-20 من 23", "عامل", "10")

      fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))
      expectVisibleState("2 / 2", "26-40 من 40", "صانع", "25")
    }
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

  it("does not block a second same-month payment at the screen level (owner item 6, decision C)", () => {
    const paidThisMonth = {
      ...makeWorkers(1, "MONTHLY")[0]!,
      lastPaymentDate: "2026-03-20T00:00:00.000Z",
    }
    const payment = {
      ...makePayments(1)[0]!,
      employeeId: paidThisMonth.employeeId,
      employeeName: paidThisMonth.employeeName,
    }

    render(
      <SalariesSection
        onEditSalary={vi.fn()}
        projects={[]}
        recentPayments={[payment]}
        workers={[paidThisMonth]}
      />,
    )

    fireEvent.click(screen.getByRole("tab", { name: "العاملون الجاهزون لتسجيل دفعة" }))
    const payButton = within(screen.getByRole("table")).getByRole("button", { name: "إضافة دفعة" })
    // A monthly guard would disable this for a worker already paid this month.
    expect(payButton.hasAttribute("disabled")).toBe(false)

    fireEvent.click(payButton)
    // The dialog opens with a live save control, proving the screen adds no
    // monthly guard of its own (the API has none either).
    const dialog = screen.getByRole("dialog")
    const submit = within(dialog).getByRole("button", { name: "إضافة دفعة" })
    expect(submit.hasAttribute("disabled")).toBe(false)
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
