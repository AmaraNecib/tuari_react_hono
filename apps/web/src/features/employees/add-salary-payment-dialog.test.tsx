import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { mockMutateAsync } = vi.hoisted(() => ({ mockMutateAsync: vi.fn() }))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}))

vi.mock("@/features/app-shell/workspace-mutations", () => ({
  useCreateSalaryPaymentMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

// The real picker renders and returns `dd/MM/yyyy` (see date-picker.test.ts);
// expose that contract directly so the dialog's conversion is exercised without
// driving the calendar popover in jsdom.
vi.mock("@/components/ui/date-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/date-picker")>()
  return {
    ...actual,
    DatePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
      <button
        type="button"
        data-testid="salary-date-picker"
        data-value={value}
        onClick={() => onChange("2026-03-15")}
      >
        pick
      </button>
    ),
  }
})

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

import { AddSalaryPaymentDialog } from "./add-salary-payment-dialog"

const PROJECT = { id: "project-1", name: "مشروع" }
const PROJECT_TWO = { id: "project-2", name: "مشروع ب" }
// Open-ended window far wider than any payment month: the derived default is
// always full coverage of the dialog's period, whatever today's date is.
const ASSIGNMENT = { projectId: PROJECT.id, startDate: "2000-01-01T00:00:00+01:00", endDate: null }

function renderDialog(salaryPeriod: "MONTHLY" | "DAILY" = "MONTHLY") {
  const onOpenChange = vi.fn()
  const renderDialogElement = (period: "MONTHLY" | "DAILY") => (
    <AddSalaryPaymentDialog
      employeeId="employee-1"
      employeeName="عامل"
      salaryAmountDzd={period === "DAILY" ? 1500 : 30000}
      salaryPeriod={period}
      projectAssignments={[ASSIGNMENT]}
      projects={[PROJECT]}
      open
      onOpenChange={onOpenChange}
    />
  )
  const view = render(renderDialogElement(salaryPeriod))
  const [daysInput, lineDaysInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]
  return {
    daysInput,
    lineDaysInput,
    // Simulate a workspace refresh that changes the worker's wage period while
    // the dialog stays open.
    rerenderPeriod: (period: "MONTHLY" | "DAILY") => view.rerender(renderDialogElement(period)),
  }
}

describe("AddSalaryPaymentDialog (#412)", () => {
  it("defaults a monthly worker to a full 30-day month", () => {
    mockMutateAsync.mockReset()
    const { daysInput } = renderDialog("MONTHLY")

    expect(daysInput?.value).toBe("30")
  })

  it("defaults a daily worker to one day, not a 30-day month", () => {
    mockMutateAsync.mockReset()
    const { daysInput } = renderDialog("DAILY")

    // A daily wage paid for "30 days" would propose 30x the day's pay.
    expect(daysInput?.value).toBe("1")
    expect(screen.getAllByDisplayValue("1500").length).toBeGreaterThan(0)
  })

  it("re-applies the daily default when the wage period changes while the dialog is open", () => {
    mockMutateAsync.mockReset()
    const { rerenderPeriod } = renderDialog("MONTHLY")

    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("30")

    // A refresh that reclassifies the worker as daily must not leave the stale
    // 30-day default behind: accepting it would record 30 days of daily pay.
    rerenderPeriod("DAILY")
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("1")
    expect(screen.getAllByDisplayValue("1500").length).toBeGreaterThan(0)
  })

  it("keeps an edited day count when the wage period changes", () => {
    mockMutateAsync.mockReset()
    const { daysInput, rerenderPeriod } = renderDialog("MONTHLY")

    fireEvent.change(daysInput!, { target: { value: "20" } })

    rerenderPeriod("DAILY")
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("20")
  })

  it("re-derives the split default from the new period when the day count was untouched", () => {
    mockMutateAsync.mockReset()
    const { rerenderPeriod } = renderDialog("MONTHLY")

    expect((screen.getAllByRole("spinbutton")[1] as HTMLInputElement).value).toBe("30")

    rerenderPeriod("DAILY")
    expect((screen.getAllByRole("spinbutton")[1] as HTMLInputElement).value).toBe("1")
  })

  it("prefills the split from the derived default and tracks the days input until a line is edited", () => {
    mockMutateAsync.mockReset()
    const { daysInput, lineDaysInput } = renderDialog()

    expect(daysInput?.value).toBe("30")
    expect(lineDaysInput?.value).toBe("30")
    expect(screen.getByText("salaries.unallocatedDays:0")).toBeTruthy()

    // The untouched default re-derives with the paid day count.
    fireEvent.change(daysInput!, { target: { value: "20" } })
    expect(lineDaysInput?.value).toBe("20")
    expect(screen.getByText("salaries.unallocatedDays:0")).toBeTruthy()
  })

  it("lets the person slide days off a project and shows the remainder", () => {
    mockMutateAsync.mockReset()
    const { daysInput, lineDaysInput } = renderDialog()

    fireEvent.change(daysInput!, { target: { value: "20" } })
    fireEvent.change(lineDaysInput!, { target: { value: "8" } })

    // The hand edit wins over the default and the unallocated remainder is explicit.
    expect(lineDaysInput?.value).toBe("8")
    expect(screen.getByText("salaries.unallocatedDays:12")).toBeTruthy()
  })

  it("blocks submit on an over-allocated split and then records the hand-edited split", async () => {
    mockMutateAsync.mockReset().mockResolvedValue({ message: "ok" })
    const { daysInput, lineDaysInput } = renderDialog()

    fireEvent.change(daysInput!, { target: { value: "5" } })
    fireEvent.change(lineDaysInput!, { target: { value: "8" } })

    expect(screen.getByText("salaries.overAllocatedDays:3")).toBeTruthy()
    const submit = screen.getByRole("button", { name: "salaries.addPayment" })
    expect(submit.hasAttribute("disabled")).toBe(true)

    // Sliding the line back under the paid days re-enables the submit.
    fireEvent.change(lineDaysInput!, { target: { value: "5" } })
    expect(screen.getByText("salaries.unallocatedDays:0")).toBeTruthy()
    expect(submit.hasAttribute("disabled")).toBe(false)

    fireEvent.click(submit)
    await vi.waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "employee-1",
        days: 5,
        projectSplits: [{ projectId: PROJECT.id, days: 5 }],
      }),
    )
  })

  it("keeps the derived split and submits the canonical day when a payment date is picked", async () => {
    mockMutateAsync.mockReset().mockResolvedValue({ message: "ok" })
    const { lineDaysInput } = renderDialog()

    // The dialog hands the picker canonical state and takes canonical back; a
    // mismatch here is what used to null the pay period.
    const picker = screen.getByTestId("salary-date-picker")
    expect(picker.getAttribute("data-value")).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Picking a day must not wipe the prefilled per-project split.
    fireEvent.click(picker)
    expect(lineDaysInput?.value).toBe("30")
    expect(screen.getByText("salaries.unallocatedDays:0")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "salaries.addPayment" }))
    await vi.waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDate: toAlgeriaDayBoundaryIso("2026-03-15", "start"),
        projectSplits: [{ projectId: PROJECT.id, days: 30 }],
      }),
    )
  })

  it("adopts a carried draft and normalises an over-precise override on submit", async () => {
    mockMutateAsync.mockReset().mockResolvedValue({ message: "ok" })
    const draft = {
      days: 12,
      daysTouched: true,
      amount: 100.005,
      amountTouched: true,
      date: "2026-03-15",
      note: "ملاحظة",
    }

    render(
      <AddSalaryPaymentDialog
        employeeId="employee-1"
        employeeName="عامل"
        salaryAmountDzd={30000}
        salaryPeriod="MONTHLY"
        projectAssignments={[ASSIGNMENT]}
        projects={[PROJECT]}
        initialDraft={draft}
        open
        onOpenChange={vi.fn()}
      />,
    )

    // The quick form's 12 days and amount open the dialog, not the monthly
    // 30-day default.
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("12")
    expect(screen.getByDisplayValue("100.005")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "salaries.addPayment" }))
    await vi.waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    // The override is stored at the currency's precision so it reconciles with
    // the whole-cent split shares.
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ days: 12, actualAmountDzd: 100.01 }),
    )
  })

  it("does not replay a carried draft over an operator edit on re-render", () => {
    mockMutateAsync.mockReset()
    const draft = {
      days: 12,
      daysTouched: true,
      amount: 100,
      amountTouched: true,
      date: "2026-03-15",
      note: "ملاحظة",
    }
    const element = (
      <AddSalaryPaymentDialog
        employeeId="employee-1"
        employeeName="عامل"
        salaryAmountDzd={30000}
        salaryPeriod="MONTHLY"
        projectAssignments={[ASSIGNMENT]}
        projects={[PROJECT]}
        initialDraft={draft}
        open
        onOpenChange={vi.fn()}
      />
    )
    const view = render(element)

    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("12")
    fireEvent.change(screen.getAllByRole("spinbutton")[0]!, { target: { value: "7" } })

    // The same draft object arrives again on a parent re-render: the
    // applied-draft guard must keep the operator's edit rather than re-adopting
    // the carried value.
    view.rerender(element)
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("7")
  })

  it("adds a second hand-built project line and removes it again", () => {
    mockMutateAsync.mockReset()
    render(
      <AddSalaryPaymentDialog
        employeeId="employee-1"
        employeeName="عامل"
        salaryAmountDzd={30000}
        salaryPeriod="MONTHLY"
        projectAssignments={[ASSIGNMENT]}
        projects={[PROJECT, PROJECT_TWO]}
        open
        onOpenChange={vi.fn()}
      />,
    )

    // Slide half the month off the prefilled line first.
    fireEvent.change(screen.getAllByRole("spinbutton")[1]!, { target: { value: "15" } })
    expect(screen.getByText("salaries.unallocatedDays:15")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "salaries.addProjectLine" }))
    // The new line takes the next unused project and the remaining days.
    const selects = screen.getAllByLabelText("salaries.project") as HTMLSelectElement[]
    expect(selects).toHaveLength(2)
    expect(selects[1]!.value).toBe(PROJECT_TWO.id)
    expect((screen.getAllByRole("spinbutton")[2] as HTMLInputElement).value).toBe("15")
    expect(screen.getByText("salaries.unallocatedDays:0")).toBeTruthy()

    // Removing the hand-built line returns to the prefilled single line.
    fireEvent.click(screen.getAllByRole("button", { name: "salaries.removeProjectLine" })[1]!)
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2)
    expect(screen.getByText("salaries.unallocatedDays:15")).toBeTruthy()
  })

  it("keeps submit blocked while a hand-added line is unassigned or duplicates a project", () => {
    mockMutateAsync.mockReset()
    renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "salaries.addProjectLine" }))
    const selects = screen.getAllByLabelText("salaries.project") as HTMLSelectElement[]
    const submit = screen.getByRole("button", { name: "salaries.addPayment" })

    // The only project is already used, so the new line starts unassigned and
    // cannot be submitted.
    expect(selects[1]!.value).toBe("")
    expect(submit.hasAttribute("disabled")).toBe(true)

    // Pointing it at the already-used project is a duplicate and stays blocked.
    fireEvent.change(selects[1]!, { target: { value: PROJECT.id } })
    expect(submit.hasAttribute("disabled")).toBe(true)
  })

  it("defaults the amount to the worker's full salary and keeps it editable", async () => {
    mockMutateAsync.mockReset().mockResolvedValue({ message: "ok" })
    renderDialog("MONTHLY")

    // The field starts on the figure the app already knows, not empty: a full
    // 30-day month is the worker's whole 30000 DZD wage.
    const amountInput = screen.getByLabelText(/salaries.actualAmount/) as HTMLInputElement
    expect(amountInput.value).toBe("30000")

    // A partial payment is legitimate: a hand edit wins and is what is stored.
    fireEvent.change(amountInput, { target: { value: "12000" } })
    expect(amountInput.value).toBe("12000")

    fireEvent.click(screen.getByRole("button", { name: "salaries.addPayment" }))
    await vi.waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30, actualAmountDzd: 12000 }),
    )
  })

  it("defaults the amount to the known wage when the wage period is unknown", () => {
    mockMutateAsync.mockReset()
    render(
      <AddSalaryPaymentDialog
        employeeId="employee-1"
        employeeName="عامل"
        salaryAmountDzd={30000}
        salaryPeriod={null}
        open
        onOpenChange={vi.fn()}
      />,
    )

    // The app knows the wage even without a period; the field must not fall
    // back to empty and force the operator to retype it.
    const amountInput = screen.getByLabelText(/salaries.actualAmount/) as HTMLInputElement
    expect(amountInput.value).toBe("30000")
    // The day default already treats an unknown period as a month, so the
    // amount default follows the same convention rather than inventing one.
    expect((screen.getByLabelText(/salaries.days/) as HTMLInputElement).value).toBe("30")
  })

  it("records a second payment for the same worker in the same month (owner item 6, decision C)", async () => {
    mockMutateAsync.mockReset().mockResolvedValue({ message: "ok" })
    renderDialog("MONTHLY")

    const submit = screen.getByRole("button", { name: "salaries.addPayment" })
    fireEvent.click(submit)
    await vi.waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))

    // The dialog closes (onOpenChange) but a controlled parent keeps it open;
    // nothing in the form refuses a second payment for the same worker/month.
    // Owner decision C: free payments, no monthly balance or guard.
    fireEvent.click(screen.getByRole("button", { name: "salaries.addPayment" }))
    await vi.waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2))

    const [firstCall, secondCall] = mockMutateAsync.mock.calls
    expect(firstCall![0]).toMatchObject({ employeeId: "employee-1", days: 30 })
    expect(secondCall![0]).toMatchObject({ employeeId: "employee-1", days: 30 })
  })
})
