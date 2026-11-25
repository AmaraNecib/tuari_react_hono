// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))
vi.mock("react-i18next", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-i18next")>(),
  useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => "rtl" } }),
}))
vi.mock("@/features/app-shell/mock-dashboard", () => ({
  AppMutationError: class AppMutationError extends Error { fieldErrors = [] },
  useCreateEmployeesBatchMutation: () => ({ mutateAsync, isPending: false }),
}))
vi.mock("./employee-opening-panel", () => ({ EmployeeOpeningPanel: ({ employeeId }: { employeeId: string }) => <section aria-label={`opening-${employeeId}`} /> }))
vi.mock("@/lib/toast", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn(), showValidationToast: vi.fn() }))

import { EmployeeBatchCreatePage } from "./employee-batch-create-page"
import { showErrorToast, showValidationToast } from "@/lib/toast"

afterEach(() => { cleanup(); mutateAsync.mockReset(); vi.clearAllMocks() })

describe("employee batch create salary reference", () => {
  it("offers an optional opening review after creation and allows leaving it unreviewed", async () => {
    const onDone = vi.fn()
    mutateAsync.mockResolvedValue({ createdCount: 1, employees: [{ id: "created-worker", firstName: "سمير", lastName: "بوقرة" }] })
    render(<EmployeeBatchCreatePage roles={[{ id: "worker-role", key: "worker", name: "عامل" } as never]} managerOptions={[]} onCancel={vi.fn()} onDone={onDone} />)
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.firstNameLabel" }), { target: { value: "سمير" } })
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.lastNameLabel" }), { target: { value: "بوقرة" } })
    fireEvent.change(screen.getByRole("textbox", { name: "auth.phoneLabel" }), { target: { value: "0555123456" } })
    fireEvent.click(screen.getByRole("button", { name: "employeeForm.submitSingle" }))
    expect(await screen.findByRole("region", { name: "opening-created-worker" })).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "employeeOpening.finishCreation" }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })
  it("submits a localized four-place DAILY reference as its exact string", async () => {
    mutateAsync.mockResolvedValue({ createdCount: 1, employees: [{ id: "created-worker", firstName: "سمير", lastName: "بوقرة" }] })
    render(<EmployeeBatchCreatePage roles={[{ id: "worker-role", key: "worker", name: "عامل" } as never]} managerOptions={[]} onCancel={vi.fn()} onDone={vi.fn()} />)
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.firstNameLabel" }), { target: { value: "سمير" } })
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.lastNameLabel" }), { target: { value: "بوقرة" } })
    fireEvent.change(screen.getByRole("textbox", { name: "auth.phoneLabel" }), { target: { value: "0555123456" } })
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.salaryAmountLabelدج" }), { target: { value: "١٬٢٣٤٫٥٦٧٨" } })
    fireEvent.change(screen.getByRole("combobox", { name: "employeeForm.salaryPeriodLabel" }), { target: { value: "DAILY" } })
    fireEvent.click(screen.getByRole("button", { name: "employeeForm.submitSingle" }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ employees: [expect.objectContaining({ salaryReference: { period: "DAILY", amount: "1234.5678" } })] }))
  })

  it("shows the translated precision error on the amount field for MONTHLY", () => {
    render(<EmployeeBatchCreatePage roles={[{ id: "worker-role", key: "worker", name: "عامل" } as never]} managerOptions={[]} onCancel={vi.fn()} onDone={vi.fn()} />)
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.firstNameLabel" }), { target: { value: "سمير" } })
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.lastNameLabel" }), { target: { value: "بوقرة" } })
    fireEvent.change(screen.getByRole("textbox", { name: "auth.phoneLabel" }), { target: { value: "0555123456" } })
    fireEvent.change(screen.getByRole("textbox", { name: "employeeForm.salaryAmountLabelدج" }), { target: { value: "1.234" } })
    fireEvent.change(screen.getByRole("combobox", { name: "employeeForm.salaryPeriodLabel" }), { target: { value: "MONTHLY" } })
    fireEvent.click(screen.getByRole("button", { name: "employeeForm.submitSingle" }))
    expect(screen.getByText("workforce.validation.salaryReference.precision")).toBeTruthy()
    expect(showValidationToast).toHaveBeenCalledExactlyOnceWith("toasts.employeeBatchValidation")
    expect(showErrorToast).not.toHaveBeenCalled()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
