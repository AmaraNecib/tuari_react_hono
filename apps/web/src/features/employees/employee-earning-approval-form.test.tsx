import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
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
  DatePicker: ({ id, value, onChange, disabled, "aria-invalid": invalid, "aria-required": required, "aria-describedby": describedBy }: { id: string; value: string; onChange: (value: string) => void; disabled?: boolean; "aria-invalid"?: boolean; "aria-required"?: boolean | "true" | "false"; "aria-describedby"?: string }) => (
    <input aria-label={id} aria-invalid={invalid} aria-required={required} aria-describedby={describedBy} type="date" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
  ),
}))

import { EmployeeEarningApprovalForm } from "./employee-earning-approval-form"

const projects = [{ id: "project-a", name: "A" }, { id: "project-b", name: "B" }]
const props = { employeeId: "employee-1", employeeName: "worker", projects, onCancel: vi.fn(), onComplete: vi.fn() }

describe("earned-wage approval composer", () => {
  beforeEach(() => {
    localStorage.clear()
    mutateAsync.mockReset()
    props.onCancel.mockReset()
    props.onComplete.mockReset()
  })

  it("runs localized validation on save instead of browser-native required messages", async () => {
    render(<EmployeeEarningApprovalForm {...props} />)
    const form = document.querySelector("form")!
    expect(form.noValidate).toBe(true)
    expect(screen.getByLabelText("earnings.total").getAttribute("aria-required")).toBe("true")
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).required).toBe(false)
    expect(screen.queryByText("workforce.validation.earning.positiveTotal")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))

    fireEvent.submit(form)

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByText("workforce.validation.earning.totalRequired")).toBeTruthy()
    expect(screen.getByText("workforce.validation.earning.projectRequired")).toBeTruthy()
    expect(screen.getByText("workforce.validation.earning.daysPositive")).toBeTruthy()
    expect(screen.getByText("workforce.validation.earning.amountRequired")).toBeTruthy()
    expect(screen.queryByText("Please fill out this field.")).toBeNull()
    expect(screen.getByLabelText("earnings.total").getAttribute("aria-describedby")).toBeTruthy()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).validationMessage).toBe("")
    expect(document.activeElement).toBe(screen.getByLabelText("earnings.total"))
  })

  it("keeps total input focused while correcting validation errors and refocuses on each failed save", () => {
    render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    const total = screen.getByLabelText("earnings.total")

    fireEvent.submit(document.querySelector("form")!)
    expect(document.activeElement).toBe(total)

    for (const value of ["1", "12", "123", "1234"]) {
      fireEvent.change(total, { target: { value } })
      expect(document.activeElement).toBe(total)
      expect(screen.getByLabelText("earnings.project 1").getAttribute("aria-invalid")).toBe("true")
    }

    fireEvent.submit(document.querySelector("form")!)
    expect(document.activeElement).toBe(screen.getByLabelText("earnings.project 1"))
  })

  it("completes a mounted save once through StrictMode effect replay", async () => {
    mutateAsync.mockResolvedValue({})
    render(<StrictMode><EmployeeEarningApprovalForm {...props} /></StrictMode>)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "100" } })

    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })

  it("derives the remainder and requires acknowledgement before approval", async () => {
    mutateAsync.mockResolvedValue({})
    render(<EmployeeEarningApprovalForm {...props} salaryReference={{ period: "DAILY", amount: "4500.1234" }} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "1000" } })
    expect(screen.getByLabelText("earnings.total").getAttribute("aria-required")).toBe("true")
    expect(screen.getByLabelText("earnings.periodStart").getAttribute("aria-required")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "600" } })

    const remainder = screen.getByRole("status", { name: "earnings.unallocated" })
    expect(remainder.tagName).toBe("OUTPUT")
    expect(remainder.textContent).toBe("400")
    const acknowledgement = screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }) as HTMLInputElement
    expect(acknowledgement.getAttribute("aria-required")).toBe("true")
    expect(acknowledgement.required).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    expect(mutateAsync).not.toHaveBeenCalled()

    fireEvent.click(acknowledgement)
    expect(screen.queryByText("earnings.acknowledgementRequired")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({
      totalAmount: "1000.00",
      unallocatedAmount: "400.00",
      referenceSalary: { period: "DAILY", amount: "4500.1234" },
      segments: [{ projectId: "project-a", days: 1, amount: "600.00" }],
    })
  })

  it("formats the read-only daily salary reference without rounding its four meaningful places", () => {
    render(<EmployeeEarningApprovalForm {...props} salaryReference={{ period: "DAILY", amount: "2500.1234" }} />)
    expect(screen.getByText(/2,500\.1234/)).toBeTruthy()
  })

  it("opens approval help on hover, click, and keyboard, and dismisses it with Escape", async () => {
    render(<EmployeeEarningApprovalForm {...props} />)
    const help = screen.getByRole("button", { name: "earnings.approvalHelp" })
    expect(screen.queryByText("earnings.approvalPaymentClarification")).toBeNull()
    fireEvent.mouseOver(help)
    expect(await screen.findByText("earnings.approvalPaymentClarification")).toBeTruthy()
    fireEvent.keyDown(help, { key: "Escape" })
    await waitFor(() => expect(screen.queryByText("earnings.approvalPaymentClarification")).toBeNull())
    help.focus()
    expect(document.activeElement).toBe(help)
    fireEvent.keyDown(help, { key: "Enter" })
    fireEvent.click(help)
    expect(await screen.findByText("earnings.approvalPaymentClarification")).toBeTruthy()
    fireEvent.keyDown(help, { key: "Escape" })
    await waitFor(() => expect(screen.queryByText("earnings.approvalPaymentClarification")).toBeNull())
    fireEvent.click(help)
    expect(await screen.findByText("earnings.approvalPaymentClarification")).toBeTruthy()
    fireEvent.click(document.body)
    await waitFor(() => expect(screen.queryByText("earnings.approvalPaymentClarification")).toBeNull())
  })

  it("suggests an exact daily-reference amount for positive row days without changing the reference", () => {
    render(<EmployeeEarningApprovalForm {...props} salaryReference={{ period: "DAILY", amount: "2500" }} />)
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "5" } })

    fireEvent.click(screen.getByRole("button", { name: "earnings.suggestDailyReferenceAmount" }))

    expect((screen.getByLabelText("earnings.amount 1") as HTMLInputElement).value).toBe("12500.00")
    const suggestionAction = screen.getByRole("button", { name: "earnings.suggestDailyReferenceAmount" }) as HTMLButtonElement
    expect(suggestionAction.disabled).toBe(true)
    expect(screen.getByLabelText("earnings.amount 1").closest("label")?.contains(suggestionAction)).toBe(false)
    expect(screen.getByRole("button", { name: "earnings.removeProjectRow" }).textContent).toBe("common.delete")
  })

  it("suggests exact values only for blank rows and leaves manual amounts untouched", async () => {
    mutateAsync.mockResolvedValue({})
    render(<EmployeeEarningApprovalForm {...props} salaryReference={{ period: "MONTHLY", amount: "30000" }} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "100.01" } })
    for (let index = 0; index < 3; index++) fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    const projectsByRow = screen.getAllByLabelText(/earnings.project /)
    const daysByRow = screen.getAllByLabelText(/earnings.days /)
    const amountsByRow = screen.getAllByLabelText(/earnings.amount /)
    for (let index = 0; index < 3; index++) {
      fireEvent.change(projectsByRow[index]!, { target: { value: index === 1 ? "project-b" : "project-a" } })
    }
    fireEvent.change(daysByRow[0]!, { target: { value: "3" } })
    fireEvent.change(daysByRow[1]!, { target: { value: "1" } })
    fireEvent.change(daysByRow[2]!, { target: { value: "2" } })
    fireEvent.change(amountsByRow[0]!, { target: { value: "0.01" } })

    fireEvent.click(screen.getByRole("button", { name: "earnings.suggestRemainingAcrossProjects" }))
    expect((amountsByRow[0] as HTMLInputElement).value).toBe("0.01")
    expect((amountsByRow[1] as HTMLInputElement).value).toBe("33.33")
    expect((amountsByRow[2] as HTMLInputElement).value).toBe("66.67")
    expect(screen.queryByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({
      totalAmount: "100.01",
      unallocatedAmount: "0.00",
      referenceSalary: { period: "MONTHLY", amount: "30000.00" },
      segments: [
        { projectId: "project-a", days: 3, amount: "0.01" },
        { projectId: "project-b", days: 1, amount: "33.33" },
        { projectId: "project-a", days: 2, amount: "66.67" },
      ],
    })
  })

  it("retries the same fully unallocated approval after another tab clears completed storage", async () => {
    const serverRecords = new Map<string, unknown>()
    mutateAsync.mockImplementationOnce(async (payload: { requestId: string }) => {
      serverRecords.set(payload.requestId, payload)
      throw new Error("response lost after server commit")
    }).mockImplementationOnce(async (payload: { requestId: string }) => {
      serverRecords.set(payload.requestId, payload)
      return {}
    })
    const view = render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "62500" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }))
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const firstPayload = mutateAsync.mock.calls[0]![0]
    expect(firstPayload).toMatchObject({ totalAmount: "62500.00", unallocatedAmount: "62500.00", segments: [] })
    expect(serverRecords.size).toBe(1)

    // A second tab resolved the approval and removed its browser recovery entry.
    localStorage.clear()
    view.rerender(<EmployeeEarningApprovalForm {...props} active={false} />)
    view.rerender(<EmployeeEarningApprovalForm {...props} active />)
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "earnings.retryApproval" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0]).toEqual(firstPayload)
    expect(serverRecords.size).toBe(1)
    expect([...serverRecords.keys()]).toEqual([firstPayload.requestId])
  })

  it("allows an intentional repeat approval after the first success", async () => {
    mutateAsync.mockResolvedValue({})
    const view = render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "62500" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }))
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const firstRequestId = mutateAsync.mock.calls[0]![0].requestId
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1))

    view.rerender(<EmployeeEarningApprovalForm {...props} active={false} />)
    view.rerender(<EmployeeEarningApprovalForm {...props} active />)
    expect(screen.queryByText("earnings.pendingApproval")).toBeNull()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).value).toBe("")
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "62500" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }))
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0].requestId).not.toBe(firstRequestId)
  })

  it("keeps A/B/A amounts independent and retries the frozen approval after close and reopen", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("network uncertain"))
      .mockRejectedValueOnce(Object.assign(new Error("session expired"), { code: "UNAUTHORIZED", fieldErrors: [] }))
      .mockResolvedValueOnce({})
    const view = render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.periodStart"), { target: { value: "2026-03-01" } })
    fireEvent.change(screen.getByLabelText("earnings.periodEnd"), { target: { value: "2026-03-31" } })
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "62500" } })

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
    view.rerender(<EmployeeEarningApprovalForm {...props} active={false} />)
    view.rerender(<EmployeeEarningApprovalForm {...props} active />)
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    expect((screen.getByLabelText("earnings.periodStart") as HTMLInputElement).value).toBe("2026-03-01")
    expect((screen.getByLabelText("earnings.periodEnd") as HTMLInputElement).value).toBe("2026-03-31")
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "earnings.retryApproval" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0]).toEqual(submitted)
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(true)
    view.rerender(<EmployeeEarningApprovalForm {...props} active={false} />)
    view.rerender(<EmployeeEarningApprovalForm {...props} active />)
    expect(screen.getByText("earnings.pendingApproval")).toBeTruthy()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "earnings.retryApproval" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(3))
    expect(mutateAsync.mock.calls[2]![0]).toEqual(submitted)
  })

  it("does not let a completed save from an unmounted employee form navigate over a new draft", async () => {
    let resolveSave!: (value: unknown) => void
    mutateAsync.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    const oldOnComplete = vi.fn()
    const oldView = render(<EmployeeEarningApprovalForm {...props} employeeId="employee-old" onComplete={oldOnComplete} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "100" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const oldRequestId = mutateAsync.mock.calls[0]![0].requestId
    const oldStorageKey = localStorage.key(0)!
    expect(localStorage.getItem(oldStorageKey)).toContain(oldRequestId)
    localStorage.setItem("new-form-storage-marker", "preserve")

    oldView.rerender(<EmployeeEarningApprovalForm {...props} employeeId="employee-old" active={false} onComplete={oldOnComplete} />)
    oldView.unmount()
    const newOnComplete = vi.fn()
    render(<EmployeeEarningApprovalForm {...props} employeeId="employee-new" onComplete={newOnComplete} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "250" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-b" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "2" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "125" } })

    resolveSave({})
    await waitFor(() => expect(localStorage.getItem(oldStorageKey)).toBeNull())
    expect(localStorage.getItem("new-form-storage-marker")).toBe("preserve")
    expect(oldOnComplete).not.toHaveBeenCalled()
    expect(newOnComplete).not.toHaveBeenCalled()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).value).toBe("250")
    expect((screen.getByLabelText("earnings.project 1") as HTMLSelectElement).value).toBe("project-b")
    expect((screen.getByLabelText("earnings.days 1") as HTMLInputElement).value).toBe("2")
    expect((screen.getByLabelText("earnings.amount 1") as HTMLInputElement).value).toBe("125")
  })

  it("unlocks a first proven no-write rejection and marks the rejected row field", async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error("project does not exist"), {
      code: "NOT_FOUND",
      fieldErrors: [
        { field: "segments.2.projectId", message: "project does not exist" },
        { field: "periodStart", message: "period start is invalid" },
      ],
    })).mockResolvedValueOnce({})
    render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "1500" } })
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
    expect(document.activeElement).toBe(startDate)
    expect(screen.getByText("period start is invalid").id).toBe(startDate.getAttribute("aria-describedby"))
    expect(screen.getByText("project does not exist").id).toBe(projectFields[2]!.getAttribute("aria-describedby"))
    expect(screen.queryByText("earnings.pendingApproval")).toBeNull()
    expect((screen.getByLabelText("earnings.total") as HTMLInputElement).disabled).toBe(false)
    fireEvent.change(projectFields[2]!, { target: { value: "project-b" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls[1]![0].requestId).not.toBe(mutateAsync.mock.calls[0]![0].requestId)
  })

  it("derives positive remainder, invalidates acknowledgement after edits, and exposes over-allocation", () => {
    render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "1000" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "500" } })

    expect(screen.getByRole("status", { name: "earnings.unallocated" }).textContent).toContain("500")
    const acknowledgement = screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }) as HTMLInputElement
    fireEvent.click(acknowledgement)
    expect(acknowledgement.checked).toBe(true)
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "1000" } })
    expect(screen.queryByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ })).toBeNull()
    expect(screen.getByRole("status", { name: "earnings.unallocated" }).textContent).toContain("0")

    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "500" } })
    expect((screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }) as HTMLInputElement).checked).toBe(false)
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "1001" } })
    expect(screen.getByRole("status", { name: "earnings.unallocated" }).textContent).toContain("-1")
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    expect(screen.getByText("workforce.validation.earning.positiveTotal")).toBeTruthy()
    expect(mutateAsync).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "999" } })
    expect(screen.queryByText("workforce.validation.earning.positiveTotal")).toBeNull()
    expect(screen.getByRole("status", { name: "earnings.unallocated" }).textContent).toContain("1")
  })

  it("unlocks a first registered wire-validation rejection for correction", async () => {
    mutateAsync.mockRejectedValueOnce(Object.assign(new Error("Input validation failed"), {
      code: "BAD_REQUEST",
      data: { issues: [{ path: ["periodStart"], message: "workforce.validation.earning.periodOrder" }] },
    })).mockResolvedValueOnce({})
    render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.periodStart"), { target: { value: "2026-03-01" } })
    fireEvent.change(screen.getByLabelText("earnings.periodEnd"), { target: { value: "2026-03-31" } })
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "100" } })
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

  it("shows localized precision and requires acknowledgement for the exact remainder", () => {
    render(<EmployeeEarningApprovalForm {...props} />)
    fireEvent.change(screen.getByLabelText("earnings.total"), { target: { value: "1000" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.addProjectRow" }))
    fireEvent.change(screen.getByLabelText("earnings.project 1"), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText("earnings.days 1"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "1.234" } })
    fireEvent.click(screen.getByRole("button", { name: "earnings.approve" }))
    expect(screen.getByText("workforce.validation.earning.amountPrecision")).toBeTruthy()
    expect(mutateAsync).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("earnings.amount 1"), { target: { value: "500" } })
    expect(screen.getByRole("status", { name: "earnings.unallocated" }).textContent).toContain("500")
    expect((screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }) as HTMLInputElement).getAttribute("aria-required")).toBe("true")
    expect((screen.getByRole("checkbox", { name: /earnings\.acknowledgeUnallocatedBefore/ }) as HTMLInputElement).required).toBe(false)
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
