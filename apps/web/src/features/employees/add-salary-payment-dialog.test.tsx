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
        onClick={() => onChange("15/03/2026")}
      >
        pick
      </button>
    ),
  }
})

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

import { AddSalaryPaymentDialog } from "./add-salary-payment-dialog"

const PROJECT = { id: "project-1", name: "مشروع" }
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

    // The dialog hands the picker the display format it expects, not the raw
    // canonical state (a raw `yyyy-MM-dd` would render as a placeholder and a
    // picked day would come back as `dd/MM/yyyy` and null the pay period).
    const picker = screen.getByTestId("salary-date-picker")
    expect(picker.getAttribute("data-value")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)

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
})
