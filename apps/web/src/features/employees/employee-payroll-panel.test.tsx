// @vitest-environment jsdom

import "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  cash: vi.fn(), repay: vi.fn(), offset: vi.fn(),
  payroll: {
    employeeId: "employee-1", currency: "DZD",
    earnings: [{ earning: { id: "earning-1", employeeId: "employee-1", totalAmount: "10000.00", unallocatedAmount: "0.00", segments: [], periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-11-02T00:00:00.000Z", approvedAt: "2026-11-03T00:00:00.000Z" }, registration: "POSTED", remaining: "10000.00" }],
    advances: [{ cashId: "cash-advance-1", advance: { id: "advance-1", amount: "5000.00", debtAccountId: "debt-1", debtEntryId: "entry-1" }, remaining: "5000.00" }],
    cash: [], repayments: [], offsets: [],
    opening: { review: "UNREVIEWED", reminder: true, wages: null, advances: null },
    summary: { approvedEarnings: "10000.00", wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed: "10000.00", advancesGiven: "5000.00", advancesCashRecovered: "0.00", advancesOffset: "0.00", advancesOwed: "5000.00", unallocatedEarnings: "0.00", currentAppTotalsExcludeUnknownOpening: true },
  },
}))

vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "user-1" } } }) }))
vi.mock("@/features/employees/employee-earnings-queries", () => ({
  useEmployeePayrollQuery: () => ({ data: mocks.payroll, isPending: false, isError: false }),
  useRecordEmployeePayrollCashMutation: () => ({ mutateAsync: mocks.cash, isPending: false }),
  useRepayEmployeePayrollAdvanceMutation: () => ({ mutateAsync: mocks.repay, isPending: false }),
  useOffsetEmployeePayrollAdvanceMutation: () => ({ mutateAsync: mocks.offset, isPending: false }),
}))

import { EmployeePayrollPanel } from "./employee-payroll-panel"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return render(<EmployeePayrollPanel employeeId="employee-1" />, { wrapper: Wrapper })
}

afterEach(() => { cleanup(); localStorage.clear() })
beforeEach(() => { vi.clearAllMocks() })

describe("employee payroll controls", () => {
  it("records cash paid against an approved earning and shows the opening reminder without blocking", async () => {
    mocks.cash.mockResolvedValueOnce({ id: "cash-1" })
    renderPanel()
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("غير مراجعة")
    expect(screen.getAllByText("10,000").length).toBeGreaterThan(0)

    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "8,000" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))

    await waitFor(() => expect(mocks.cash).toHaveBeenCalledWith({
      requestId: expect.any(String), employeeId: "employee-1", amount: "8000.00",
      paymentDate: toAlgeriaDayBoundaryIso(getAlgeriaDateInputValue(), "start"),
      wages: [{ earningId: "earning-1", amount: "8000.00" }],
    }))
    expect(mocks.offset).not.toHaveBeenCalled()
    expect(mocks.repay).not.toHaveBeenCalled()
  })

  it("classifies cash above the wage balance as an explicit recoverable advance", async () => {
    mocks.cash.mockResolvedValueOnce({ id: "cash-with-advance" })
    renderPanel()
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "10,000" } })
    fireEvent.change(screen.getByRole("textbox", { name: "سلفة نقدية إضافية، اختيارية" }), { target: { value: "2,000" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))

    await waitFor(() => expect(mocks.cash).toHaveBeenCalledWith(expect.objectContaining({
      amount: "12000.00", wages: [{ earningId: "earning-1", amount: "10000.00" }], advanceAmount: "2000.00",
    })))
  })

  it("records repayment as a separate cash action", async () => {
    mocks.repay.mockResolvedValueOnce({ id: "repay-1" })
    renderPanel()
    fireEvent.click(screen.getByRole("tab", { name: "سداد سلفة" }))
    fireEvent.change(screen.getByRole("textbox", { name: "مبلغ السداد النقدي" }), { target: { value: "1,500" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل السداد" }))

    await waitFor(() => expect(mocks.repay).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: "employee-1", advanceId: "advance-1", amount: "1500.00",
    })))
    expect(mocks.cash).not.toHaveBeenCalled()
    expect(mocks.offset).not.toHaveBeenCalled()
  })

  it("rejects a payment above the selected earning balance before sending", async () => {
    renderPanel()
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "10,000.01" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(mocks.cash).not.toHaveBeenCalled()
  })

  it("uses an explicit offset command and preserves the independent balances", async () => {
    mocks.offset.mockResolvedValueOnce({ id: "offset-1" })
    renderPanel()
    fireEvent.click(screen.getByRole("tab", { name: "تسوية سلفة" }))
    fireEvent.change(screen.getByRole("textbox", { name: "مبلغ التسوية من الأجر" }), { target: { value: "2,000" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل التسوية" }))

    await waitFor(() => expect(mocks.offset).toHaveBeenCalledWith({
      requestId: expect.any(String), employeeId: "employee-1",
      wageSource: { kind: "EARNING", id: "earning-1" },
      advanceSource: { kind: "ADVANCE", id: "advance-1" },
      amount: "2000.00", settlementDate: toAlgeriaDayBoundaryIso(getAlgeriaDateInputValue(), "start"),
    }))
    expect(screen.getAllByText("10,000").length).toBeGreaterThan(0)
    expect(screen.getAllByText("5,000").length).toBeGreaterThan(0)
  })

  it("retries a lost response with the same persisted request id and payload after reload", async () => {
    mocks.cash.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ id: "cash-1" })
    const first = renderPanel()
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "8,000" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "إعادة العملية نفسها" })).toBeTruthy())
    const firstPayload = mocks.cash.mock.calls[0]![0]
    first.unmount()

    renderPanel()
    await waitFor(() => expect(screen.getByRole("button", { name: "إعادة العملية نفسها" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "إعادة العملية نفسها" }))
    await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(2))
    expect(mocks.cash.mock.calls[1]![0]).toEqual(firstPayload)
  })
})
