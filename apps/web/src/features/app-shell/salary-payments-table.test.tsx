// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SalaryPaymentsTable, type SalaryPaymentRow } from "./salary-payments-table"

const PROJECT = { id: "project-1", name: "مشروع ألف" }

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
    projectSplits: [] as Array<{ projectId: string; days: number }>,
    note: null,
  }))
}

function renderTable(payments: SalaryPaymentRow[]) {
  return render(
    <SalaryPaymentsTable
      payments={payments}
      projects={[
        PROJECT,
        { id: "project-2", name: "مشروع باء" },
      ]}
      onAddPayment={vi.fn()}
      onEditSalary={vi.fn()}
    />,
  )
}

describe("SalaryPaymentsTable (#453)", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows each project's days and prorated share in the payment row", () => {
    renderTable([
      {
        ...makePayments(1)[0]!,
        projectSplits: [
          { projectId: PROJECT.id, days: 15 },
          { projectId: "project-2", days: 15 },
        ],
      },
    ])

    // The row must name the projects and reconcile the shares with the paid
    // amount (15/15 days of 30,000 -> 15,000 each), not just list days.
    const table = within(screen.getByRole("table"))
    expect(table.getByText("مشروع ألف")).toBeTruthy()
    expect(table.getByText("مشروع باء")).toBeTruthy()
    expect(table.getAllByText("15 يوم").length).toBe(2)
    expect(table.getAllByText(/15,000/).length).toBe(2)
  })

  it("windows its own rows and resets to page 1 when the search changes", () => {
    renderTable(makePayments(23))

    const table = () => within(screen.getByRole("table"))
    expect(table().getByText("عامل 01")).toBeTruthy()
    expect(table().queryByText("عامل 11")).toBeNull()
    expect(screen.getByText("1 / 3")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    // A search matching the same 23 rows keeps the page count, so the reset is
    // observable: without it the table would stay on page 2.
    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "عامل " } })
    expect(screen.getByText("1 / 3")).toBeTruthy()

    // Filtering to one row must land on page 1, not stay on the now-empty page 2.
    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "عامل 05" } })
    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect(screen.getByText("1-1 من 1")).toBeTruthy()
    expect(table().getByText("عامل 05")).toBeTruthy()
    expect(table().queryByText("عامل 01")).toBeNull()
  })

  it("filters by project and resets to page 1", () => {
    const payments = makePayments(23).map((row, index) => ({
      ...row,
      projectSplits: [{ projectId: index % 2 === 0 ? "project-1" : "project-2", days: 30 }],
    }))
    renderTable(payments)

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/المشروع/), { target: { value: "project-2" } })

    // 11 of the 23 payments belong to project-2; the page resets to 1.
    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-10 من 11")).toBeTruthy()
    expect(within(screen.getByRole("table")).getByText("عامل 02")).toBeTruthy()
    expect(within(screen.getByRole("table")).queryByText("عامل 01")).toBeNull()
  })

  it("filters by worker and resets to page 1", () => {
    // Give one worker enough rows that the filtered result still spans two
    // pages: a single-row result would be clamped to page 1 even without a
    // reset, which is exactly the toothless assertion to avoid.
    const payments: SalaryPaymentRow[] = makePayments(23).map((payment, index) => ({
      ...payment,
      employeeId: index < 15 ? "worker-01" : payment.employeeId,
      employeeName: index < 15 ? "عامل موحد" : payment.employeeName,
    }))
    renderTable(payments)

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("العامل"), { target: { value: "worker-01" } })

    // 15 rows for that worker is two pages; the page resets to 1 rather than
    // staying on page 2 (which the clamp would otherwise accept).
    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-10 من 15")).toBeTruthy()
    expect(within(screen.getByRole("table")).getAllByText("عامل موحد").length).toBeGreaterThan(0)
  })

  it("filters by period and resets to page 1", () => {
    const payments: SalaryPaymentRow[] = makePayments(23).map((payment, index) => ({
      ...payment,
      periodType: index % 2 === 0 ? "MONTHLY" : "DAILY",
    }))
    renderTable(payments)

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 3")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/الدورية/), { target: { value: "DAILY" } })

    // 11 of the 23 payments are DAILY; the page resets to 1.
    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-10 من 11")).toBeTruthy()
  })

  it("excludes a payment with no period when a period filter is set", () => {
    renderTable(makePayments(2).map((payment) => ({ ...payment, periodType: null })))

    fireEvent.change(screen.getByLabelText(/الدورية/), { target: { value: "MONTHLY" } })

    expect(screen.getByText("لا توجد نتائج")).toBeTruthy()
    expect(screen.queryByText("0-0 من 0")).toBeNull()
  })

  it("shows the no-results empty state without a dead pagination bar", () => {
    renderTable(makePayments(3))

    fireEvent.change(screen.getByLabelText("بحث باسم العامل..."), { target: { value: "لا يوجد" } })

    expect(screen.getByText("لا توجد نتائج")).toBeTruthy()
    expect(within(screen.getByRole("table")).queryByText("عامل 01")).toBeNull()
    // No rows means no pagination bar, but the search field stays so the
    // filter can be cleared.
    expect(screen.queryByText("0-0 من 0")).toBeNull()
    expect(screen.getByLabelText("بحث باسم العامل...")).toBeTruthy()
  })

  it("shows the history empty state when there are no payments at all", () => {
    renderTable([])

    expect(screen.getByText("لا توجد دفعات راتب مسجلة بعد.")).toBeTruthy()
    // With no rows there is no filter bar to clear, and no pagination bar.
    expect(screen.queryByLabelText("بحث باسم العامل...")).toBeNull()
    expect(screen.queryByText("0-0 من 0")).toBeNull()
  })
})
