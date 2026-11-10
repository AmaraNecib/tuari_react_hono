import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/i18n"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"
import { ExactMonthlySalaryEditor } from "./exact-monthly-salary-editor"

const months = [
  { id: "oct", month: "2026-10", amount: "12000.00" },
  { id: "nov", month: "2026-11", amount: "18000.00" },
]
afterEach(cleanup)
beforeEach(() => setMoneyGrouping(false))

describe("approved month-first salary editor", () => {
  it("resolves its title, actions and validation through application translations", () => {
    const original = { title: i18n.t("salaryMonthly.title"), approve: i18n.t("salaryMonthly.approve"), invalid: i18n.t("salaryMonthly.invalid"), suggestionInvalid: i18n.t("salaryMonthly.suggestionInvalid") }
    i18n.addResourceBundle("ar", "translation", { salaryMonthly: { title: "localized-title", approve: "localized-submit", invalid: "localized-invalid", suggestionInvalid: "localized-calculation-error" } }, true, true)
    try {
      render(<ExactMonthlySalaryEditor defaultMonth="2026-10" initialMonths={months} onApprove={vi.fn()} />)
      expect(screen.getByRole("form", { name: "localized-title" })).toBeTruthy()
      expect(screen.getByRole("button", { name: /localized-submit/ })).toBeTruthy()
      fireEvent.change(screen.getByLabelText("مبلغ الشهر 1"), { target: { value: "1.001" } })
      expect(screen.getByText("localized-invalid")).toBeTruthy()
      fireEvent.click(screen.getByText("وزّع مبلغًا إجماليًا"))
      fireEvent.change(screen.getByLabelText("المبلغ المطلوب توزيعه"), { target: { value: "1.001" } })
      fireEvent.click(screen.getByRole("button", { name: "اعرض اقتراح الحساب" }))
      expect(screen.getByRole("alert").textContent).toBe("localized-calculation-error")
    } finally { i18n.addResourceBundle("ar", "translation", { salaryMonthly: original }, true, true) }
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
