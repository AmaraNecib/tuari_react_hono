import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mutateAsync, sessionUser } = vi.hoisted(() => ({ mutateAsync: vi.fn(), sessionUser: { id: "user-1" } }))

vi.mock("react-i18next", async importOriginal => {
  const actual = await importOriginal<typeof import("react-i18next")>()
  return { ...actual, useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => "rtl" } }) }
})
vi.mock("@/features/employees/employee-earnings-queries", () => ({
  useApproveEmployeeEarningMutation: () => ({ mutateAsync, isPending: false }),
}))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: sessionUser } }) }))
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ id, value, onChange, disabled, "aria-invalid": invalid, "aria-describedby": describedBy }: { id: string; value: string; onChange: (value: string) => void; disabled?: boolean; "aria-invalid"?: boolean; "aria-describedby"?: string }) => (
    <input aria-label={id} aria-invalid={invalid} aria-describedby={describedBy} type="date" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
  ),
}))

import { AddSalaryPaymentDialog } from "./add-salary-payment-dialog"

const projects = [{ id: "project-a", name: "A" }, { id: "project-b", name: "B" }]
const props = { employeeId: "employee-1", employeeName: "عامل", projects, open: true, onOpenChange: vi.fn() }

describe("earned-wage approval composer", () => {
  beforeEach(() => {
    localStorage.clear()
    mutateAsync.mockReset()
    props.onOpenChange.mockReset()
  })

  it("keeps A/B/A amounts independent and retries the frozen approval after close and reopen", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("network uncertain"))
      .mockRejectedValueOnce(Object.assign(new Error("session expired"), { code: "UNAUTHORIZED", fieldErrors: [] }))
      .mockResolvedValueOnce({})
    const view = render(<AddSalaryPaymentDialog {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.periodStart"), { target: { value: "2026-03-01" } })
    fireEvent.change(screen.getByLabelText("earnings.periodEnd"), { target: { value: "2026-03-31" } })
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "62500" } })
    fireEvent.change(screen.getByLabelText("earnings.unallocated"), { target: { value: "0" } })

    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    const selects = screen.getAllByLabelText(/earnings.project/) as HTMLSelectElement[]
    fireEvent.change(selects[0]!, { target: { value: "project-a" } })
    fireEvent.change(selects[1]!, { target: { value: "project-b" } })
    fireEvent.change(selects[2]!, { target: { value: "project-a" } })
    const days = screen.getAllByLabelText(/earnings.days /)
    const amounts = screen.getAllByLabelText(/earnings.amount /)
    for (const [index, value] of ["5", "15", "5"].entries()) fireEvent.change(days[index]!, { target: { value } })
    for (const [index, value] of ["10000", "37500", "15000"].entries()) fireEvent.change(amounts[index]!, { target: { value } })
    fireEvent.change(amounts[1]!, { target: { value: "36000" } })
    expect((amounts[0] as HTMLInputElement).value).toBe("10000")
    expect((amounts[2] as HTMLInputElement).value).toBe("15000")
    fireEvent.change(amounts[1]!, { target: { value: "37500" } })

    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const submitted = mutateAsync.mock.calls[0]![0]
    expect(submitted).toMatchObject({
      employeeId: "employee-1", currencyCode: "DZD", totalAmount: "62500.00", unallocatedAmount: "0.00",
      segments: [
        { projectId: "project-a", days: 5, amount: "10000.00" },
        { projectId: "project-b", days: 15, amount: "37500.00" },
        { projectId: "project-a", days: 5, amount: "15000.00" },
      ],
    })
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    view.rerender(<AddSalaryPaymentDialog {...props} open={false} />)
    view.rerender(<AddSalaryPaymentDialog {...props} open />)
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    expect((screen.getByLabelText("earnings.periodStart") as HTMLInputElement).value).toBe("2026-03-01")
    expect((screen.getByLabelText("earnings.periodEnd") as HTMLInputElement).value).toBe("2026-03-31")
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "earnings.retryApproval" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0]).toEqual(submitted)
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(true)
    view.rerender(<AddSalaryPaymentDialog {...props} open={false} />)
    view.rerender(<AddSalaryPaymentDialog {...props} open />)
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "earnings.retryApproval" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(3))
    expect(mutateAsync.mock.calls[2]![0]).toEqual(submitted)
  })

  it("unlocks a first proven no-write rejection and marks the rejected row field", async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error("project does not exist"), {
      code: "NOT_FOUND",
      fieldErrors: [
        { field: "segments.2.projectId", message: "project does not exist" },
        { field: "periodStart", message: "period start is invalid" },
      ],
    })).mockResolvedValueOnce({})
    render(<AddSalaryPaymentDialog {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "1500" } })
    fireEvent.change(screen.getByLabelText("earnings.unallocated"), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    const projectFields = screen.getAllByLabelText(/earnings.project /) as HTMLSelectElement[]
    fireEvent.change(projectFields[0]!, { target: { value: "project-a" } })
    fireEvent.change(projectFields[1]!, { target: { value: "project-b" } })
    fireEvent.change(projectFields[2]!, { target: { value: "project-a" } })
    for (let index = 1; index <= 3; index++) {
      fireEvent.change(screen.getByLabelText(`earnings.days ${index}`), { target: { value: "5" } })
      fireEvent.change(screen.getByLabelText(`earnings.amount ${index}`), { target: { value: "500" } })
    }
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(projectFields[2]!.getAttribute("aria-invalid")).toBe("true"))
    expect(projectFields[0]!.getAttribute("aria-invalid")).toBeNull()
    expect(projectFields[1]!.getAttribute("aria-invalid")).toBeNull()
    const startDate = screen.getByLabelText("earnings.periodStart")
    expect(startDate.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("period start is invalid").id).toBe(startDate.getAttribute("aria-describedby"))
    expect(screen.getByText("project does not exist").id).toBe(projectFields[2]!.getAttribute("aria-describedby"))
    expect(screen.queryByText("earnings.pendingApproval")).toBeNull()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(projectFields[2]!, { target: { value: "project-b" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0].requestId).not.toBe(mutateAsync.mock.calls[0]![0].requestId)
  })

  it("unlocks a first registered wire-validation rejection for correction", async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error("Input validation failed"), {
      code: "BAD_REQUEST",
      data: { issues: [{ path: ["periodStart"], message: "workforce.validation.earning.periodOrder" }] },
    })).mockResolvedValueOnce({})
    render(<AddSalaryPaymentDialog {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.periodStart"), { target: { value: "2026-03-01" } })
    fireEvent.change(screen.getByLabelText("earnings.periodEnd"), { target: { value: "2026-03-31" } })
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "100" } })
    fireEvent.change(screen.getByLabelText("earnings.unallocated"), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect((screen.getByLabelText("earnings.periodStart") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true"))
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText("earnings.periodStart"), { target: { value: "2026-03-02" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0].requestId).not.toBe(mutateAsync.mock.calls[0]![0].requestId)
  })

  it("shows localized precision and conservation issues without sending an invalid approval", () => {
    render(<AddSalaryPaymentDialog {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("earnings.unallocated"), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "1.234" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    expect(screen.getByText("workforce.validation.earning.amountPrecision")).toBeTruthy()
    expect(mutateAsync).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    const conservation = screen.getByText("workforce.validation.earning.conservation")
    const totalField = screen.getByLabelText("earnings.total")
    expect(totalField.getAttribute("aria-invalid")).toBe("true")
    expect(totalField.getAttribute("aria-describedby")).toBe(conservation.id)
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
