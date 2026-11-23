// @vitest-environment jsdom

import "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { employeePayrollOutputSchema, payrollCashRecordSchema, payrollOffsetRecordSchema, payrollRepaymentRecordSchema } from "@tuari/contracts"
import type { z } from "zod"
import { ORPCError } from "@orpc/client"
import { formatAlgeriaDate } from "@/lib/algeria-time"

const mocks = vi.hoisted(() => ({
  cash: vi.fn(), repay: vi.fn(), offset: vi.fn(), refetch: vi.fn(),
  openingSources: [] as Array<{ kind: "WAGE" | "ADVANCE"; sourceId: string; remaining: string }>,
  payroll: {
    employeeId: "employee-1", currency: "DZD",
    earnings: [{ earning: { id: "earning-1", employeeId: "employee-1", currencyCode: "DZD", referenceSalary: null, actorUserId: null, transactionId: null, createdAt: "2026-11-03T00:00:00.000Z", totalAmount: "10000.00", unallocatedAmount: "0.00", segments: [], periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-11-02T00:00:00.000Z", approvedAt: "2026-11-03T00:00:00.000Z" }, registration: "POSTED", remaining: "10000.00" }],
    advances: [{ cashId: "cash-advance-1", advance: { id: "advance-1", amount: "5000.00", debtAccountId: "debt-1", debtEntryId: "entry-1" }, remaining: "5000.00" }],
    cash: [], repayments: [], offsets: [],
    opening: { review: "UNREVIEWED", reminder: true, wages: null, advances: null },
    summary: { approvedEarnings: "10000.00", wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed: "10000.00", advancesGiven: "5000.00", advancesCashRecovered: "0.00", advancesOffset: "0.00", advancesOwed: "5000.00", unallocatedEarnings: "0.00", currentAppTotalsExcludeUnknownOpening: true },
  } as z.infer<typeof employeePayrollOutputSchema>,
}))

vi.mock("./employee-opening-panel", () => ({ EmployeeOpeningPanel: () => null }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "user-1" } } }) }))
vi.mock("@/features/employees/employee-earnings-queries", () => ({
  useEmployeeOpeningQuery: () => ({ data: { sources: mocks.openingSources } }),
  useEmployeePayrollQuery: () => ({ data: mocks.payroll, isPending: false, isError: false, refetch: mocks.refetch }),
  useRecordEmployeePayrollCashMutation: () => ({ mutateAsync: mocks.cash, isPending: false }),
  useRepayEmployeePayrollAdvanceMutation: () => ({ mutateAsync: mocks.repay, isPending: false }),
  useOffsetEmployeePayrollAdvanceMutation: () => ({ mutateAsync: mocks.offset, isPending: false }),
}))

import { EmployeePayrollPanel } from "./employee-payroll-panel"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

function renderPanel(employeeId = "employee-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return render(<EmployeePayrollPanel employeeId={employeeId} />, { wrapper: Wrapper })
}

afterEach(() => { cleanup(); localStorage.clear() })
beforeEach(() => {
  vi.resetAllMocks()
  employeePayrollOutputSchema.parse(mocks.payroll)
  let tail = Promise.resolve()
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    request: (_name: string, callback: () => Promise<unknown>) => {
      const next = tail.then(callback)
      tail = next.then(() => undefined, () => undefined)
      return next
    },
  } })
})

function paymentField(unit: "amount" | "percentage") {
  fireEvent.click(screen.getByRole("button", { name: unit === "amount" ? "د.ج" : "%" }))
  return screen.getByRole("textbox", { name: unit === "amount" ? "المبلغ المدفوع من الأجر" : "نسبة هذه الدفعة (%)" })
}

describe("employee payroll controls", () => {
  it("keeps distinct settlement visible when exact totals round to the same percentage", () => {
    const original = structuredClone(mocks.payroll)
    try {
      mocks.payroll.earnings[0]!.earning.totalAmount = "1000000.00"
      mocks.payroll.earnings[0]!.remaining = "999999.00"
      const timestamp = "2026-11-19T00:00:00.000Z"
      const leg = { debtAccountId: "debt-1", debtEntryId: "entry-1", settlementEntryId: "settlement-1" }
      mocks.payroll.offsets = [payrollOffsetRecordSchema.parse({ id: "offset-1", employeeId: "employee-1", currency: "DZD", amount: "1.00", settlementDate: timestamp, createdAt: timestamp, actorUserId: null, actorLabel: null, transactionId: null, wageSource: { kind: "EARNING", id: "earning-1" }, advanceSource: { kind: "ADVANCE", id: "advance-1" }, wage: leg, advance: leg })]
      renderPanel()
      fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "800000" } })
      expect(screen.getByText(/إجمالي المدفوع نقداً بعدها/).textContent).toContain("80%")
      expect(screen.getByText(/إجمالي المسوّى بعدها/).textContent).toContain("≈ 80%")
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("uses one payment field with inline currency and percentage modes without changing exact money", async () => {
    const original = structuredClone(mocks.payroll)
    try {
      mocks.payroll.earnings[0]!.earning.totalAmount = "0.03"
      mocks.payroll.earnings[0]!.remaining = "0.03"
      renderPanel()
      const unit = screen.getByRole("group", { name: "وحدة إدخال الدفعة" })
      expect(screen.getByRole("button", { name: "د.ج", pressed: true })).toBeTruthy()
      expect(unit.querySelectorAll("button")).toHaveLength(2)
      expect(screen.queryByRole("textbox", { name: "نسبة هذه الدفعة (%)" })).toBeNull()
      fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "0.01" } })
      for (let index = 0; index < 3; index++) {
        fireEvent.click(screen.getByRole("button", { name: "%" }))
        expect(screen.getByRole("textbox", { name: "نسبة هذه الدفعة (%)" })).toHaveProperty("value", "33.33")
        expect(screen.queryByRole("textbox", { name: "المبلغ المدفوع من الأجر" })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "د.ج" }))
        expect(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" })).toHaveProperty("value", "0.01")
      }
      fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
      await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(1))
      expect(mocks.cash.mock.calls[0]![0].wages).toEqual([{ earningId: "earning-1", amount: "0.01" }])
      await waitFor(() => expect(localStorage.length).toBe(0))
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("converts percentage and amount against approved earnings, not the remainder", async () => {
    const original = structuredClone(mocks.payroll)
    try {
      mocks.payroll.earnings[0]!.earning.totalAmount = "60000.00"
      mocks.payroll.earnings[0]!.remaining = "48000.00"
      renderPanel()
      fireEvent.change(paymentField("percentage"), { target: { value: "60" } })
      expect(paymentField("amount")).toHaveProperty("value", "36000.00")
      expect(screen.getByText(/إجمالي المسوّى بعدها/).textContent).toContain("80%")
      expect(screen.getByText(/المتبقي بعدها/).parentElement?.textContent).toContain("20%")
      expect(mocks.cash).not.toHaveBeenCalled()
      fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "30000" } })
      expect(paymentField("percentage")).toHaveProperty("value", "50")
      fireEvent.click(screen.getByRole("button", { name: "ربع الأجر" }))
      expect(paymentField("amount")).toHaveProperty("value", "15000.00")
      fireEvent.click(screen.getByRole("button", { name: "نصف الأجر" }))
      expect(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" })).toHaveProperty("value", "30000.00")
      fireEvent.click(screen.getByRole("button", { name: "كامل المتبقي" }))
      expect(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" })).toHaveProperty("value", "48000.00")
      fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
      await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(1))
      expect(mocks.cash.mock.calls[0]![0].wages).toEqual([{ earningId: "earning-1", amount: "48000.00" }])
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("clears editable payment drafts when refresh automatically selects another earning", () => {
    const original = structuredClone(mocks.payroll)
    try {
      mocks.payroll.earnings[0]!.earning.totalAmount = "60000.00"
      mocks.payroll.earnings[0]!.remaining = "60000.00"
      mocks.payroll.earnings.push({ ...structuredClone(mocks.payroll.earnings[0]!), earning: { ...mocks.payroll.earnings[0]!.earning, id: "earning-2", totalAmount: "100000.00" }, remaining: "100000.00" })
      const view = renderPanel()
      fireEvent.change(paymentField("percentage"), { target: { value: "50" } })
      expect(paymentField("amount")).toHaveProperty("value", "30000.00")
      mocks.payroll.earnings[0]!.remaining = "0.00"
      view.rerender(<EmployeePayrollPanel employeeId="employee-1" />)
      expect(screen.getByRole("combobox", { name: "الأجر المعتمد" })).toHaveProperty("value", "earning-2")
      expect(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" })).toHaveProperty("value", "")
      expect(paymentField("percentage")).not.toHaveProperty("value", "50")
      expect(mocks.cash).not.toHaveBeenCalled()
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("preserves an advance repayment draft when an unrelated earning is exhausted", async () => {
    const original = structuredClone(mocks.payroll)
    try {
      const view = renderPanel()
      fireEvent.click(screen.getByRole("button", { name: "سداد سلفة", pressed: false }))
      fireEvent.change(screen.getByRole("textbox", { name: "مبلغ السداد النقدي" }), { target: { value: "1500" } })
      mocks.payroll.earnings[0]!.remaining = "0.00"
      view.rerender(<EmployeePayrollPanel employeeId="employee-1" />)
      expect(screen.getByRole("textbox", { name: "مبلغ السداد النقدي" })).toHaveProperty("value", "1500")
      fireEvent.click(screen.getByRole("button", { name: "تسجيل السداد" }))
      await waitFor(() => expect(mocks.repay).toHaveBeenCalledTimes(1))
      expect(mocks.repay.mock.calls[0]![0]).toMatchObject({ employeeId: "employee-1", advanceId: "advance-1", amount: "1500.00" })
      await waitFor(() => expect(localStorage.length).toBe(0))
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("keeps an uncertain percentage payment frozen across automatic earning selection", async () => {
    const original = structuredClone(mocks.payroll)
    mocks.cash.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ id: "receipt" })
    try {
      mocks.payroll.earnings[0]!.earning.totalAmount = "60000.00"
      mocks.payroll.earnings[0]!.remaining = "60000.00"
      const view = renderPanel()
      fireEvent.change(paymentField("percentage"), { target: { value: "50" } })
      fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
      await screen.findByRole("button", { name: "إعادة العملية نفسها" })
      const first = mocks.cash.mock.calls[0]![0]
      expect(first.wages).toEqual([{ earningId: "earning-1", amount: "30000.00" }])
      mocks.payroll.earnings[0]!.remaining = "0.00"
      mocks.payroll.earnings.push({ ...structuredClone(mocks.payroll.earnings[0]!), earning: { ...mocks.payroll.earnings[0]!.earning, id: "earning-2", totalAmount: "100000.00" }, remaining: "100000.00" })
      view.rerender(<EmployeePayrollPanel employeeId="employee-1" />)
      expect(screen.getByRole("combobox", { name: "الأجر المعتمد" })).toHaveProperty("value", "earning-2")
      fireEvent.click(screen.getByRole("button", { name: "إعادة العملية نفسها" }))
      await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(2))
      expect(mocks.cash.mock.calls[1]![0]).toEqual(first)
      await waitFor(() => expect(localStorage.length).toBe(0))
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("explains excessive percentages using the balance error and clears it after correction", () => {
    const original = structuredClone(mocks.payroll)
    try {
      mocks.payroll.earnings[0]!.earning.totalAmount = "60000.00"
      mocks.payroll.earnings[0]!.remaining = "12000.00"
      renderPanel()
      const percentage = paymentField("percentage")
      fireEvent.change(percentage, { target: { value: "50" } })
      expect(screen.getByRole("alert").textContent).toContain("المبلغ يتجاوز الرصيد المتبقي")
      expect(screen.getByRole("button", { name: "تسجيل الدفع" })).toHaveProperty("disabled", true)
      fireEvent.change(percentage, { target: { value: "10" } })
      expect(screen.queryByRole("alert")).toBeNull()
      expect(screen.getByRole("button", { name: "تسجيل الدفع" })).toHaveProperty("disabled", false)
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("blocks invalid percentage rather than submitting the last valid amount", () => {
    renderPanel()
    const field = paymentField("percentage")
    fireEvent.change(field, { target: { value: "50" } })
    fireEvent.change(field, { target: { value: "1e1" } })
    expect(screen.getByRole("button", { name: "تسجيل الدفع" })).toHaveProperty("disabled", true)
    expect(field).toHaveProperty("value", "1e1")
    expect(mocks.cash).not.toHaveBeenCalled()
  })

  it("repays an opening-only advance and retries the identical frozen request", async () => {
    const advances = mocks.payroll.advances
    mocks.payroll.advances = []
    mocks.openingSources = [{ kind: "ADVANCE", sourceId: "opening-only", remaining: "300.00" }]
    mocks.repay.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ id: "receipt" })
    try {
      renderPanel()
      fireEvent.click(screen.getByRole("button", { name: "سداد سلفة", pressed: false }))
      fireEvent.change(screen.getByRole("textbox", { name: "مبلغ السداد النقدي" }), { target: { value: "300" } })
      expect(screen.getByRole("button", { name: "تسجيل السداد" })).toHaveProperty("disabled", false)
      fireEvent.click(screen.getByRole("button", { name: "تسجيل السداد" }))
      await screen.findByRole("button", { name: "إعادة العملية نفسها" })
      const payload = mocks.repay.mock.calls[0]![0]
      expect(payload).toMatchObject({ openingAdvanceId: "opening-only", amount: "300.00" })
      expect(payload).not.toHaveProperty("advanceId")
      fireEvent.click(screen.getByRole("button", { name: "إعادة العملية نفسها" }))
      await waitFor(() => expect(mocks.repay).toHaveBeenCalledTimes(2))
      expect(mocks.repay.mock.calls[1]![0]).toEqual(payload)
      await waitFor(() => expect(localStorage.length).toBe(0))
    } finally { mocks.payroll.advances = advances; mocks.openingSources = [] }
  })

  it("blocks repayment without a source and offset without a current earning", () => {
    const original = structuredClone(mocks.payroll)
    try {
      mocks.payroll.advances = []
      mocks.payroll.earnings = []
      renderPanel()
      fireEvent.click(screen.getByRole("button", { name: "سداد سلفة", pressed: false }))
      expect(screen.getByRole("button", { name: "تسجيل السداد" })).toHaveProperty("disabled", true)
      fireEvent.click(screen.getByRole("button", { name: "تسوية سلفة", pressed: false }))
      expect(screen.getByRole("button", { name: "تسجيل التسوية" })).toHaveProperty("disabled", true)
      expect(mocks.repay).not.toHaveBeenCalled()
      expect(mocks.offset).not.toHaveBeenCalled()
    } finally { Object.assign(mocks.payroll, original) }
  })

  it.each(["earning", "advance"] as const)("explains and blocks offset when only the current %s is missing", missing => {
    const original = structuredClone(mocks.payroll)
    try {
      if (missing === "earning") mocks.payroll.earnings = []
      else mocks.payroll.advances = []
      renderPanel()
      fireEvent.click(screen.getByRole("button", { name: "تسوية سلفة", pressed: false }))
      const submit = screen.getByRole("button", { name: "تسجيل التسوية" })
      expect(submit).toHaveProperty("disabled", true)
      expect(screen.getByText("التسوية تتطلب أجراً معتمداً وسلفة حالية متبقيين. الرصيد السابق غير متاح للتسوية.")).toBeTruthy()
      fireEvent.click(submit)
      expect(mocks.offset).not.toHaveBeenCalled()
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("settles selected opening wages and advances through the existing payment controls", async () => {
    mocks.openingSources = [{ kind: "WAGE", sourceId: "opening-wage", remaining: "2000.00" }, { kind: "ADVANCE", sourceId: "opening-advance", remaining: "300.00" }]
    mocks.cash.mockResolvedValue({ id: "opening-payment" })
    mocks.repay.mockResolvedValue({ id: "opening-repayment" })
    try {
      renderPanel()
      const wageOption = screen.getByRole("option", { name: /أجور سابقة مستحقة للموظف/ }) as HTMLOptionElement
      fireEvent.change(wageOption.closest("select")!, { target: { value: wageOption.value } })
      fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "100" } })
      fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
      await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(1))
      expect(mocks.cash.mock.calls[0]![0].wages).toEqual([{ openingId: "opening-wage", amount: "100.00" }])
      await waitFor(() => expect(localStorage.length).toBe(0))
      fireEvent.click(screen.getByRole("button", { name: "سداد سلفة", pressed: false }))
      const advanceOption = screen.getByRole("option", { name: /سلف سابقة مستحقة للشركة/ }) as HTMLOptionElement
      fireEvent.change(advanceOption.closest("select")!, { target: { value: advanceOption.value } })
      fireEvent.change(screen.getByRole("textbox", { name: "مبلغ السداد النقدي" }), { target: { value: "50" } })
      fireEvent.click(screen.getByRole("button", { name: "تسجيل السداد" }))
      await waitFor(() => expect(mocks.repay).toHaveBeenCalledTimes(1))
      expect(mocks.repay.mock.calls[0]![0]).toMatchObject({ openingAdvanceId: "opening-advance", amount: "50.00" })
      expect(mocks.repay.mock.calls[0]![0]).not.toHaveProperty("advanceId")
    } finally { mocks.openingSources = [] }
  })
  it("renders the selected Algeria day for cash, offset and repayment history", () => {
    const original = structuredClone(mocks.payroll)
    const day = "2026-11-19"
    const timestamp = toAlgeriaDayBoundaryIso(day, "start")!
    expect(timestamp.slice(0, 10)).toBe("2026-11-18")
    const audit = { actorUserId: null, actorLabel: null, transactionId: null, createdAt: timestamp }
    const shared = { ...audit, employeeId: "employee-1", currency: "DZD", amount: "100.00" }
    const leg = { debtAccountId: "debt-1", debtEntryId: "entry-1", settlementEntryId: "settlement-1" }
    try {
      mocks.payroll.cash = [payrollCashRecordSchema.parse({ ...shared, id: "cash-1", paymentDate: timestamp, wageAllocations: [], advance: { id: "advance-1", amount: "100.00", debtAccountId: "debt-1", debtEntryId: "entry-1" } })]
      mocks.payroll.offsets = [payrollOffsetRecordSchema.parse({ ...shared, id: "offset-1", settlementDate: timestamp, wageSource: { kind: "EARNING", id: "earning-1" }, advanceSource: { kind: "ADVANCE", id: "advance-1" }, wage: leg, advance: leg })]
      mocks.payroll.repayments = [payrollRepaymentRecordSchema.parse({ ...shared, id: "repay-1", paymentDate: timestamp, source: { kind: "ADVANCE", id: "advance-1" }, debtAccountId: "debt-1", debtEntryId: "entry-1", paymentEntryId: "payment-1" })]
      renderPanel()
      expect(screen.getAllByText(formatAlgeriaDate(timestamp, "ar", "DD/MM/YYYY"))).toHaveLength(3)
      expect(screen.queryByText("2026-11-18", { exact: false })).toBeNull()
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("allows explicit discard and correction only after a confirmed uncommitted refusal", async () => {
    mocks.repay.mockRejectedValueOnce(new ORPCError("BAD_REQUEST", { data: { payrollOutcome: "NOT_COMMITTED" } }))
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "سداد سلفة", pressed: false }))
    fireEvent.change(screen.getByRole("textbox", { name: "مبلغ السداد النقدي" }), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل السداد" }))
    const cancel = await screen.findByRole("button", { name: "إلغاء" })
    expect(localStorage.length).toBe(1)
    const original = mocks.repay.mock.calls[0]![0]
    fireEvent.click(cancel)
    await waitFor(() => expect(localStorage.length).toBe(0))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    mocks.repay.mockResolvedValueOnce({ id: "repay-corrected" })
    fireEvent.change(screen.getByRole("textbox", { name: "مبلغ السداد النقدي" }), { target: { value: "50" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل السداد" }))
    await waitFor(() => expect(mocks.repay).toHaveBeenCalledTimes(2))
    expect(mocks.repay.mock.calls[1]![0].requestId).not.toBe(original.requestId)
  })

  it("does not discard a refused request after another view starts a later uncertain retry", async () => {
    mocks.cash.mockRejectedValueOnce(new ORPCError("BAD_REQUEST", { data: { payrollOutcome: "NOT_COMMITTED" } })).mockRejectedValueOnce(new Error("response lost"))
    renderPanel()
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
    const cancel = await screen.findByRole("button", { name: "إلغاء" })
    renderPanel()
    const retries = screen.getAllByRole("button", { name: "إعادة العملية نفسها" })
    fireEvent.click(retries[1]!)
    await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(2))
    fireEvent.click(cancel)
    await waitFor(() => expect(screen.queryByRole("button", { name: "إلغاء" })).toBeNull())
    expect(mocks.cash.mock.calls[1]![0]).toEqual(mocks.cash.mock.calls[0]![0])
    expect(localStorage.length).toBe(1)
    expect(mocks.cash).toHaveBeenCalledTimes(2)
  })

  it.each([new ORPCError("CONFLICT"), new ORPCError("BAD_REQUEST"), new ORPCError("INTERNAL_SERVER_ERROR", { data: { payrollOutcome: "NOT_COMMITTED" } }), { code: "BAD_REQUEST", data: { payrollOutcome: "NOT_COMMITTED" } }])("keeps unconfirmed or malformed refusal frozen", async cause => {
    mocks.cash.mockRejectedValueOnce(cause)
    renderPanel()
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
    await screen.findByRole("button", { name: "إعادة العملية نفسها" })
    expect(screen.queryByRole("button", { name: "إلغاء" })).toBeNull()
    expect(localStorage.length).toBe(1)
  })

  it("reconciles exhausted earning and advance selections against available sources", async () => {
    const original = structuredClone(mocks.payroll)
    try {
      mocks.payroll.earnings.push({ ...original.earnings[0]!, earning: { ...original.earnings[0]!.earning, id: "earning-2" } })
      mocks.payroll.advances.push({ ...original.advances[0]!, advance: { ...original.advances[0]!.advance, id: "advance-2" } })
      const view = renderPanel()
      mocks.payroll.earnings[0]!.remaining = "0.00"
      mocks.payroll.advances[0]!.remaining = "0.00"
      view.rerender(<EmployeePayrollPanel employeeId="employee-1" />)
      await waitFor(() => expect(screen.getByRole("combobox", { name: "الأجر المعتمد" })).toHaveProperty("value", "earning-2"))
      fireEvent.click(screen.getByRole("button", { name: "تسوية سلفة", pressed: false }))
      expect(screen.getByRole("combobox", { name: "السلفة" })).toHaveProperty("value", "advance-2")
      fireEvent.change(screen.getByRole("textbox", { name: "مبلغ التسوية من الأجر" }), { target: { value: "100" } })
      fireEvent.click(screen.getByRole("button", { name: "تسجيل التسوية" }))
      await waitFor(() => expect(mocks.offset).toHaveBeenCalledWith(expect.objectContaining({ wageSource: { kind: "EARNING", id: "earning-2" }, advanceSource: { kind: "ADVANCE", id: "advance-2" } })))
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("selects the new worker's sources and clears editable cash amounts", async () => {
    const original = structuredClone(mocks.payroll)
    try {
      const view = renderPanel()
      fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "200" } })
      mocks.payroll.employeeId = "employee-2"
      mocks.payroll.earnings[0]!.earning = { ...mocks.payroll.earnings[0]!.earning, id: "worker2-earning", employeeId: "employee-2" }
      mocks.payroll.advances[0]!.advance.id = "worker2-advance"
      view.rerender(<EmployeePayrollPanel employeeId="employee-2" />)
      await waitFor(() => expect(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" })).toHaveProperty("value", ""))
      fireEvent.click(screen.getByRole("button", { name: "تسوية سلفة", pressed: false }))
      fireEvent.change(screen.getByRole("textbox", { name: "مبلغ التسوية من الأجر" }), { target: { value: "100" } })
      fireEvent.click(screen.getByRole("button", { name: "تسجيل التسوية" }))
      await waitFor(() => expect(mocks.offset).toHaveBeenCalledWith(expect.objectContaining({ employeeId: "employee-2", wageSource: { kind: "EARNING", id: "worker2-earning" }, advanceSource: { kind: "ADVANCE", id: "worker2-advance" } })))
    } finally { Object.assign(mocks.payroll, original) }
  })

  it("resets the editable draft on worker switch without deleting another worker's pending request", async () => {
    mocks.cash.mockRejectedValueOnce(new Error("response lost"))
    const view = renderPanel()
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
    await screen.findByRole("button", { name: "إعادة العملية نفسها" })
    const saved = localStorage.getItem(localStorage.key(0)!)
    view.rerender(<EmployeePayrollPanel employeeId="employee-2" />)
    await waitFor(() => expect(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" })).toHaveProperty("value", ""))
    expect(localStorage.getItem(localStorage.key(0)!)).toBe(saved)
    view.rerender(<EmployeePayrollPanel employeeId="employee-1" />)
    expect(await screen.findByRole("button", { name: "إعادة العملية نفسها" })).toBeTruthy()
  })

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

  it("records an advance without an outstanding earning", async () => {
    const earnings = mocks.payroll.earnings
    mocks.payroll.earnings = []
    try {
      mocks.cash.mockResolvedValueOnce({ id: "advance-only" })
      renderPanel()
      fireEvent.change(screen.getByRole("textbox", { name: "سلفة نقدية إضافية، اختيارية" }), { target: { value: "5,000" } })
      fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
      await waitFor(() => expect(mocks.cash).toHaveBeenCalledWith(expect.objectContaining({
        amount: "5000.00", wages: [], advanceAmount: "5000.00",
      })))
    } finally { mocks.payroll.earnings = earnings }
  })

  it("preserves the first uncertain request when two views submit concurrently", async () => {
    let fail!: (cause: Error) => void
    mocks.cash.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    const first = renderPanel()
    const second = renderPanel()
    const fields = screen.getAllByRole("textbox", { name: "المبلغ المدفوع من الأجر" })
    fields.forEach(field => fireEvent.change(field, { target: { value: "1000" } }))
    const buttons = screen.getAllByRole("button", { name: "تسجيل الدفع" })
    buttons.forEach(button => fireEvent.click(button))
    await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(1))
    const original = mocks.cash.mock.calls[0]![0]
    fail(new Error("response lost"))
    await waitFor(() => expect(screen.getAllByRole("button", { name: "إعادة العملية نفسها" })).toHaveLength(2))
    expect(mocks.cash).toHaveBeenCalledTimes(1)
    first.unmount()
    second.unmount()
    renderPanel()
    expect(screen.getByRole("button", { name: "إعادة العملية نفسها" })).toBeTruthy()
    mocks.cash.mockResolvedValueOnce({ id: "confirmed" })
    fireEvent.click(screen.getByRole("button", { name: "إعادة العملية نفسها" }))
    await waitFor(() => expect(mocks.cash).toHaveBeenCalledTimes(2))
    expect(mocks.cash.mock.calls[1]![0]).toEqual(original)
  })

  it("refuses new writes when cross-view coordination is unavailable", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined })
    renderPanel()
    fireEvent.change(screen.getByRole("textbox", { name: "المبلغ المدفوع من الأجر" }), { target: { value: "1000" } })
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدفع" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(mocks.cash).not.toHaveBeenCalled()
  })

  it("records repayment as a separate cash action", async () => {
    mocks.repay.mockResolvedValueOnce({ id: "repay-1" })
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: "سداد سلفة", pressed: false }))
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
    fireEvent.click(screen.getByRole("button", { name: "تسوية سلفة", pressed: false }))
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
