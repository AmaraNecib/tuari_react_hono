import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/i18n"
import { ar } from "@/i18n/resources/ar"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"
import { ExactMonthlySalaryEditor } from "./exact-monthly-salary-editor"

const months = [
  { id: "oct", month: "2026-10", amount: "12000.00" },
  { id: "nov", month: "2026-11", amount: "18000.00" },
]
afterEach(cleanup)
beforeEach(() => setMoneyGrouping(false))

describe("approved month-first salary editor", () => {
  it("resolves all visible and accessible editor text through overridden resources", async () => {
    const original = { ...ar.translation.salaryMonthly }
    const originalCommon = { currency: i18n.t("common.currency"), loading: i18n.t("common.loading") }
    const translated: Record<keyof typeof original, string> = {
      title: "monthly-title", help: "monthly-help", month: "monthly-month {{index}}",
      amount: "monthly-amount {{index}}", remove: "monthly-remove {{index}}", add: "monthly-add",
      total: "monthly-total", invalid: "monthly-invalid", approve: "monthly-approve",
      approvalFailed: "monthly-approval-failed", distribute: "monthly-distribute", optional: "monthly-optional",
      target: "monthly-target", basis: "monthly-basis", equal: "monthly-equal", workDays: "monthly-work-days",
      calendarDays: "monthly-calendar-days", days: "monthly-days {{index}}", daysWeight: "monthly-weight {{days}}",
      periodStart: "monthly-start", periodEnd: "monthly-end", calendarHelp: "monthly-calendar-help",
      helperHelp: "monthly-helper-help", calculate: "monthly-calculate", preview: "monthly-preview",
      roundingHelp: "monthly-rounding", apply: "monthly-apply", cancel: "monthly-cancel",
      suggestionInvalid: "monthly-suggestion-invalid", totalChanged: "monthly-changed",
      suggestedTotal: "monthly-suggested-total", currentTotal: "monthly-current-total", undo: "monthly-undo",
    }
    i18n.addResourceBundle("ar", "translation", { salaryMonthly: translated, common: { currency: "monthly-currency", loading: "monthly-loading" } }, true, true)
    let rejectApproval: ((error: Error) => void) | undefined
    const onApprove = vi.fn(() => new Promise<void>((_, reject) => { rejectApproval = reject }))
    try {
      render(<ExactMonthlySalaryEditor defaultMonth="2026-10" initialMonths={months} onApprove={onApprove} />)
      expect(screen.getByRole("form", { name: "monthly-title" })).toBeTruthy()
      expect(screen.getAllByText("monthly-help").length).toBeGreaterThan(0)
      expect(screen.getByLabelText("monthly-month 1")).toBeTruthy()
      expect(screen.getByRole("button", { name: "monthly-remove 2" })).toBeTruthy()
      expect(screen.getByRole("button", { name: "monthly-add" })).toBeTruthy()
      expect(screen.getByText("monthly-total")).toBeTruthy()
      expect(screen.getAllByText("monthly-currency").length).toBeGreaterThan(0)
      fireEvent.click(screen.getByText("monthly-distribute"))
      expect(screen.getByText("monthly-optional")).toBeTruthy()
      expect(screen.getByText("monthly-helper-help")).toBeTruthy()
      expect(screen.getByLabelText("monthly-target")).toBeTruthy()
      const basis = screen.getByRole("combobox", { name: "monthly-basis" })
      expect(screen.getByRole("option", { name: "monthly-equal" })).toBeTruthy()
      expect(screen.getByRole("option", { name: "monthly-work-days" })).toBeTruthy()
      expect(screen.getByRole("option", { name: "monthly-calendar-days" })).toBeTruthy()
      fireEvent.change(basis, { target: { value: "WORK_DAYS" } })
      fireEvent.change(screen.getByLabelText("monthly-days 1"), { target: { value: "12" } })
      fireEvent.change(screen.getByLabelText("monthly-days 2"), { target: { value: "10" } })
      fireEvent.click(screen.getByRole("button", { name: "monthly-calculate" }))
      expect(screen.getByRole("region", { name: "monthly-preview" })).toBeTruthy()
      expect(screen.getByText("monthly-weight 12")).toBeTruthy()
      expect(screen.getByText("monthly-rounding")).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: "monthly-cancel" }))
      fireEvent.change(basis, { target: { value: "CALENDAR_DAYS" } })
      fireEvent.change(screen.getByLabelText("monthly-start"), { target: { value: "2026-10-20" } })
      fireEvent.change(screen.getByLabelText("monthly-end"), { target: { value: "2026-11-10" } })
      expect(screen.getByText("monthly-calendar-help")).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: "monthly-calculate" }))
      fireEvent.click(screen.getByRole("button", { name: "monthly-apply" }))
      fireEvent.click(screen.getByRole("button", { name: "monthly-undo" }))
      fireEvent.click(screen.getByText("monthly-distribute"))
      fireEvent.change(screen.getByRole("combobox", { name: "monthly-basis" }), { target: { value: "EQUAL" } })
      fireEvent.click(screen.getByRole("button", { name: "monthly-calculate" }))
      fireEvent.click(screen.getByRole("button", { name: "monthly-apply" }))
      fireEvent.change(screen.getByLabelText("monthly-amount 1"), { target: { value: "10000" } })
      expect(screen.getByText("monthly-changed")).toBeTruthy()
      expect(screen.getByText("monthly-suggested-total")).toBeTruthy()
      expect(screen.getByText("monthly-current-total")).toBeTruthy()
      fireEvent.change(screen.getByLabelText("monthly-amount 1"), { target: { value: "1.001" } })
      expect(screen.getByText("monthly-invalid")).toBeTruthy()
      fireEvent.change(screen.getByLabelText("monthly-amount 1"), { target: { value: "10000" } })
      fireEvent.click(screen.getByText("monthly-distribute"))
      fireEvent.change(screen.getByLabelText("monthly-target"), { target: { value: "1.001" } })
      fireEvent.click(screen.getByRole("button", { name: "monthly-calculate" }))
      expect(screen.getByRole("alert").textContent).toBe("monthly-suggestion-invalid")
      fireEvent.change(screen.getByLabelText("monthly-target"), { target: { value: "30000" } })
      fireEvent.click(screen.getByRole("button", { name: /monthly-approve/ }))
      expect(screen.getByRole("button", { name: "monthly-loading" })).toBeTruthy()
      rejectApproval!(new Error("private diagnostic"))
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("monthly-approval-failed"))
    } finally {
      cleanup()
      rejectApproval?.(new Error("test cleanup"))
      i18n.addResourceBundle("ar", "translation", { salaryMonthly: original, common: originalCommon }, true, true)
    }
  })

  it("supports explicit working-day and calendar previews, undo and stale-preview invalidation", () => {
    render(<ExactMonthlySalaryEditor defaultMonth="2026-10" initialMonths={months} onApprove={vi.fn()} />)
    fireEvent.click(screen.getByText("وزّع مبلغًا إجماليًا"))
    fireEvent.change(screen.getByLabelText("طريقة الاقتراح"), { target: { value: "WORK_DAYS" } })
    fireEvent.change(screen.getByLabelText("أيام العمل للشهر 1"), { target: { value: "12" } })
    fireEvent.change(screen.getByLabelText("أيام العمل للشهر 2"), { target: { value: "10" } })
    fireEvent.click(screen.getByRole("button", { name: "اعرض اقتراح الحساب" }))
    expect(screen.getByText("16363.64")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("طريقة الاقتراح"), { target: { value: "CALENDAR_DAYS" } })
    expect(screen.queryByRole("button", { name: "استخدم هذه المبالغ بدل الحالية" })).toBeNull()
    fireEvent.change(screen.getByLabelText("بداية الفترة"), { target: { value: "2026-10-20" } })
    fireEvent.change(screen.getByLabelText("نهاية الفترة"), { target: { value: "2026-11-10" } })
    fireEvent.click(screen.getByRole("button", { name: "اعرض اقتراح الحساب" }))
    expect(screen.getByText("13636.36")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "استخدم هذه المبالغ بدل الحالية" }))
    fireEvent.click(screen.getByRole("button", { name: "تراجع عن تطبيق الاقتراح" }))
    expect((screen.getByLabelText("مبلغ الشهر 1") as HTMLInputElement).value).toBe("12000.00")
    expect((screen.getByLabelText("مبلغ الشهر 2") as HTMLInputElement).value).toBe("18000.00")
  })

  it("preserves the draft after a failed approval, prevents concurrent submission and permits retry", async () => {
    let reject!: (error: Error) => void
    const onApprove = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail })).mockResolvedValueOnce(undefined)
    render(<ExactMonthlySalaryEditor defaultMonth="2026-10" initialMonths={months} onApprove={onApprove} />)
    fireEvent.click(screen.getByRole("button", { name: /اعتماد/ }))
    expect(screen.getByLabelText("مبلغ الشهر 1").matches(":disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "جارٍ التنفيذ..." }))
    expect(onApprove).toHaveBeenCalledOnce()
    reject(new Error("private server diagnostic"))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(i18n.t("salaryMonthly.approvalFailed")))
    expect(screen.queryByText("private server diagnostic")).toBeNull()
    expect((screen.getByLabelText("مبلغ الشهر 1") as HTMLInputElement).value).toBe("12000.00")
    fireEvent.click(screen.getByRole("button", { name: /اعتماد/ }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(2))
  })

  it("does not resubmit an approved plan when only its input notation changes", async () => {
    const onApprove = vi.fn()
    render(<ExactMonthlySalaryEditor defaultMonth="2026-10" initialMonths={months} onApprove={onApprove} />)
    fireEvent.click(screen.getByRole("button", { name: /اعتماد/ }))
    await waitFor(() => expect((screen.getByRole("button", { name: /اعتماد/ }) as HTMLButtonElement).disabled).toBe(true))
    fireEvent.change(screen.getByLabelText("مبلغ الشهر 1"), { target: { value: "١٢٬٠٠٠" } })
    fireEvent.click(screen.getByRole("button", { name: /اعتماد/ }))
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it("previews a distribution, applies it explicitly and allows later edits to change the total", async () => {
    const onApprove = vi.fn()
    render(<ExactMonthlySalaryEditor defaultMonth="2026-10" initialMonths={months} onApprove={onApprove} />)
    fireEvent.click(screen.getByText("وزّع مبلغًا إجماليًا"))
    fireEvent.change(screen.getByLabelText("المبلغ المطلوب توزيعه"), { target: { value: "٣٠٬٠٠٠" } })
    fireEvent.click(screen.getByRole("button", { name: "اعرض اقتراح الحساب" }))
    expect((screen.getByLabelText("مبلغ الشهر 1") as HTMLInputElement).value).toBe("12000.00")
    fireEvent.click(screen.getByRole("button", { name: "استخدم هذه المبالغ بدل الحالية" }))
    expect((screen.getByLabelText("مبلغ الشهر 1") as HTMLInputElement).value).toBe("15000.00")
    fireEvent.change(screen.getByLabelText("مبلغ الشهر 1"), { target: { value: "10000" } })
    expect((screen.getByLabelText("مبلغ الشهر 2") as HTMLInputElement).value).toBe("15000.00")
    expect(screen.getByText("تغيّر الإجمالي بعد تعديلك؛ الأشهر الأخرى لم تتغير تلقائيًا.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /اعتماد/ }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce())
    expect(onApprove.mock.calls[0]?.[0].totalAmount).toBe("25000.00")
  })

  it("submits canonical localized month amounts with a derived total and leaves neighboring months untouched", async () => {
    const onApprove = vi.fn()
    render(<ExactMonthlySalaryEditor defaultMonth="2026-10" initialMonths={months} onApprove={onApprove} />)
    fireEvent.change(screen.getByLabelText("مبلغ الشهر 1"), { target: { value: "١٠٬٠٠٠٫٠٠" } })
    expect((screen.getByLabelText("مبلغ الشهر 2") as HTMLInputElement).value).toBe("18000.00")
    fireEvent.click(screen.getByRole("button", { name: /اعتماد/ }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce())
    expect(onApprove).toHaveBeenCalledWith({ currency: "DZD", months: [{ ...months[0], amount: "10000.00" }, months[1]], totalAmount: "28000.00" })
  })
})
