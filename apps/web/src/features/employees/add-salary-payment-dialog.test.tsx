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

import { AddSalaryPaymentDialog } from "./add-salary-payment-dialog"

const PROJECT = { id: "project-1", name: "مشروع" }
// Open-ended window far wider than any payment month: the derived default is
// always full coverage of the dialog's period, whatever today's date is.
const ASSIGNMENT = { projectId: PROJECT.id, startDate: "2000-01-01T00:00:00+01:00", endDate: null }

function renderDialog() {
  const onOpenChange = vi.fn()
  render(
    <AddSalaryPaymentDialog
      employeeId="employee-1"
      employeeName="عامل"
      salaryAmountDzd={30000}
      salaryPeriod="MONTHLY"
      projectAssignments={[ASSIGNMENT]}
      projects={[PROJECT]}
      open
      onOpenChange={onOpenChange}
    />,
  )
  const [daysInput, lineDaysInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]
  return { daysInput, lineDaysInput }
}

describe("AddSalaryPaymentDialog (#412)", () => {
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
})
