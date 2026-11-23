// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { EmployeePayrollDebtSection } from "./employee-payroll-debt-section"
const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/features/employees/employee-earnings-queries", () => ({ useEmployeePayrollQuery: mocks.query }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const empty = { summary: { wagesOwed: "0.00", advancesOwed: "0.00" }, opening: { reminder: true }, earnings: [], advances: [], cash: [], repayments: [], offsets: [] }
it("selects only one employee and follows removed options and scoped identity", () => {
  mocks.query.mockReturnValue({ isPending: true })
  const second = { ...employee, id: "second", label: "Second" }
  const view = render(<EmployeePayrollDebtSection employees={[employee, second]} />)
  expect(mocks.query).toHaveBeenLastCalledWith("worker")
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "second" } })
  expect(mocks.query).toHaveBeenLastCalledWith("second")
  view.rerender(<EmployeePayrollDebtSection employees={[employee]} />)
  expect(mocks.query).toHaveBeenLastCalledWith("worker")
  view.rerender(<EmployeePayrollDebtSection employees={[employee]} scopedParty={second} />)
  expect(mocks.query).toHaveBeenLastCalledWith("second")
  view.rerender(<EmployeePayrollDebtSection employees={[]} />)
  expect(mocks.query).toHaveBeenLastCalledWith("")
  expect(screen.queryByRole("status")).toBeNull()
})
it("never shows balances during pending/error and retries the selected read", () => {
  const retry = vi.fn()
  mocks.query.mockReturnValue({ isPending: true })
  const view = render(<EmployeePayrollDebtSection employees={[employee]} />)
  expect(screen.getByRole("status")).toBeTruthy()
  expect(screen.queryByText("0")).toBeNull()
  mocks.query.mockReturnValue({ isError: true, refetch: retry })
  view.rerender(<EmployeePayrollDebtSection employees={[employee]} />)
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.queryByText("0")).toBeNull()
  mocks.query.mockReturnValue({ data: empty })
  view.rerender(<EmployeePayrollDebtSection employees={[employee]} />)
  expect(screen.getAllByText("0")).toHaveLength(2)
  expect(screen.getByRole("note")).toBeTruthy()
})
it("paginates history and separates cash from wage allocations and advances", () => {
  mocks.query.mockReturnValue({ data: { ...empty, cash: Array.from({ length: 26 }, (_, i) => ({
    id: `cash-${i}`, amount: "45000.00", paymentDate: "2026-11-19T09:00:00.000Z",
    wageAllocations: [{ id: `allocation-${i}`, amount: "40000.00", source: { id: "earning-source" }, paymentEntryId: `payment-${i}` }],
    advance: { id: `advance-${i}`, amount: "5000.00" },
  })) } })
  render(<EmployeePayrollDebtSection employees={[employee]} />)
  expect(screen.getAllByText("40,000")).toHaveLength(25)
  expect(screen.getAllByText("45,000")).toHaveLength(25)
  expect(screen.getByText("payment-0")).toBeTruthy()
  expect(screen.queryByText("cash-25")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "التالي" }))
  expect(screen.getByText("cash-25")).toBeTruthy()
  expect(screen.queryByText("cash-0")).toBeNull()
})
const employee = { id: "worker", label: "Ahmed", partyType: "INTERNAL_WORKER" as const }
it("renders actual earning periods and nested advance identity without inferring unpaid from attribution", () => {
  mocks.query.mockReturnValue({ data: { summary: { wagesOwed: "20000.00", advancesOwed: "5000.00", unallocatedEarnings: "15000.00" }, opening: { reminder: true }, earnings: [{ earning: { id: "earning", totalAmount: "60000.00", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z" }, remaining: "20000.00" }], advances: [{ advance: { id: "advance-reference", amount: "5000.00" }, remaining: "5000.00" }], cash: [], repayments: [], offsets: [] } })
  render(<EmployeePayrollDebtSection employees={[employee]} />)
  expect(screen.getByText(/advance-reference/)).toBeTruthy()
  expect(screen.getAllByText(/2026/)).toHaveLength(2)
  expect(screen.queryByText("15,000")).toBeNull()
  expect(screen.getAllByText("20,000")).toHaveLength(2)
  expect(screen.getAllByText("5,000")).toHaveLength(3)
  expect(screen.getByText("أجور مستحقة للموظف")).toBeTruthy()
  expect(screen.getByText("سلف مستحقة للشركة على الموظف")).toBeTruthy()
})
it("does not claim zero when opening wages exist without current earnings", () => {
  mocks.query.mockReturnValue({ data: { summary: { wagesOwed: "20000.00", advancesOwed: "0.00" }, opening: { reminder: false }, earnings: [], advances: [], cash: [], repayments: [], offsets: [] } })
  render(<EmployeePayrollDebtSection employees={[employee]} />)
  expect(screen.queryByText(/الرصيد المستحق 0/)).toBeNull()
})
