// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SalariedWorkersTable, type SalariedWorkerRow } from "./salaried-workers-table"

const PROJECT = { id: "project-1", name: "مشروع ألف" }

function makeWorkers(count: number, period: "MONTHLY" | "DAILY", idOffset = 0): SalariedWorkerRow[] {
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
      projectAssignments: [] as Array<{ projectId: string; startDate: string; endDate: string | null }>,
    }
  })
}

function renderTable(
  workers: ReturnType<typeof makeWorkers>,
  projects: Array<{ id: string; name: string }> = [PROJECT],
) {
  return render(
    <SalariedWorkersTable
      workers={workers}
      projects={projects}
      onAddPayment={vi.fn()}
      onEditSalary={vi.fn()}
    />,
  )
}

describe("SalariedWorkersTable (#453)", () => {
  afterEach(() => {
    cleanup()
  })

  it("lists each worker's wage with its own period label and last payment", () => {
    renderTable([
      {
        ...makeWorkers(1, "MONTHLY")[0]!,
        employeeId: "w-monthly",
        employeeName: "عامل شهري",
        lastPaymentDate: "2026-03-31T00:00:00.000Z",
      },
      {
        ...makeWorkers(1, "DAILY")[0]!,
        employeeId: "w-daily",
        employeeName: "عامل يومي",
      },
      {
        ...makeWorkers(1, "MONTHLY")[0]!,
        employeeId: "w-none",
        employeeName: "عامل بلا أجر",
        salaryAmountDzd: null,
        salaryPeriod: null,
      },
    ])

    expect(screen.getByText("عامل شهري")).toBeTruthy()
    expect(screen.getByText("عامل يومي")).toBeTruthy()
    // Each wage carries the worker's own period label, not a global default.
    expect(screen.getByText("/ شهري")).toBeTruthy()
    expect(screen.getByText("/ يومي")).toBeTruthy()
    // The last payment date renders for the worker who has one, not only a dash.
    const monthlyRow = screen.getByText("عامل شهري").closest("tr")!
    expect(within(monthlyRow).getByText(/2026/)).toBeTruthy()
    // A worker without a wage renders the placeholder rather than a zero wage.
    // Scope to that worker's row: every row has a dash in the last-payment
    // column, so an unscoped dash check would pass even if the wage rendered 0.
    const noWageRow = screen.getByText("عامل بلا أجر").closest("tr")!
    expect(within(noWageRow).getAllByText("—").length).toBeGreaterThan(0)
    expect(within(noWageRow).queryByText(/[0-9]/)).toBeNull()
  })

  it("filters by search and resets to page 1", () => {
    renderTable(makeWorkers(23, "MONTHLY"))

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    // "عامل" matches every worker, so the page count is unchanged and the reset
    // is observable: without it the table would stay on page 2.
    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "عامل" } })
    expect(screen.getByText("1 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "عامل 05" } })
    expect(screen.getByText("1-1 من 1")).toBeTruthy()
    expect(within(screen.getByRole("table")).getByText("عامل 05")).toBeTruthy()
    expect(within(screen.getByRole("table")).queryByText("عامل 01")).toBeNull()

    // A search that matches nothing shows the no-results empty state.
    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "لا يوجد" } })
    expect(screen.getByText("لا توجد نتائج")).toBeTruthy()
  })

  it("filters by period and resets to page 1", () => {
    renderTable([...makeWorkers(15, "MONTHLY"), ...makeWorkers(12, "DAILY", 15)])

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/الدورية/), { target: { value: "DAILY" } })

    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-10 من 12")).toBeTruthy()
    expect(within(screen.getByRole("table")).getByText("عامل 16")).toBeTruthy()
    expect(within(screen.getByRole("table")).queryByText("عامل 01")).toBeNull()
  })

  it("filters by project assignment and resets to page 1", () => {
    // 15 workers assigned to project-2 so the filtered result has two pages and
    // the reset is observable rather than masked by the page clamp.
    const workers: SalariedWorkerRow[] = makeWorkers(23, "MONTHLY").map((worker, index) => ({
      ...worker,
      projectAssignments:
        index < 15
          ? [{ projectId: "project-2", startDate: "2000-01-01T00:00:00+01:00", endDate: null }]
          : [],
    }))
    renderTable(workers, [PROJECT, { id: "project-2", name: "مشروع باء" }])

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/المشروع/), { target: { value: "project-2" } })

    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-10 من 15")).toBeTruthy()

    // The unassigned project still yields the no-results empty state.
    fireEvent.change(screen.getByLabelText(/المشروع/), { target: { value: "project-1" } })
    expect(screen.getByText("لا توجد نتائج")).toBeTruthy()
    expect(screen.queryByText("0-0 من 0")).toBeNull()
  })

  it("opens the payment dialog target through onAddPayment", () => {
    const onAddPayment = vi.fn()
    render(
      <SalariedWorkersTable
        workers={makeWorkers(1, "MONTHLY")}
        projects={[PROJECT]}
        onAddPayment={onAddPayment}
        onEditSalary={vi.fn()}
      />,
    )

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "إضافة دفعة" }))
    expect(onAddPayment).toHaveBeenCalledWith("worker-01", "عامل 01")
  })

  it("routes the edit action through onEditSalary", () => {
    const onEditSalary = vi.fn()
    render(
      <SalariedWorkersTable
        workers={makeWorkers(1, "MONTHLY")}
        projects={[PROJECT]}
        onAddPayment={vi.fn()}
        onEditSalary={onEditSalary}
      />,
    )

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "تعديل الأجر" }))
    expect(onEditSalary).toHaveBeenCalledWith("worker-01")
  })

  it("shows the workers empty state when there is no worker", () => {
    renderTable([])

    expect(screen.getByText("لا يوجد عاملون بإعدادات راتب جاهزة حاليًا.")).toBeTruthy()
    expect(screen.queryByLabelText("بحث باسم العامل...")).toBeNull()
    expect(screen.queryByText("0-0 من 0")).toBeNull()
  })
})
