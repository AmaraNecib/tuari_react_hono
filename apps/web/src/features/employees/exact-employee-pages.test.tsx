import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactEmployeeClient, Role } from "@tuari/contracts"
import { i18n } from "@/i18n"
import { EmployeeEditPage } from "./employee-edit-page"
import { EmployeeDetailsPage } from "./employee-details-page"
import { EmployeeBatchCreatePage } from "./employee-batch-create-page"

const role: Role = { id: "role-worker", key: "worker", name: "Worker", description: null, isSystem: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
const employee = { id: "employee-a", firstName: "Amina", lastName: "Kaci", phone: "0551234567", roleId: role.id, status: "INACTIVE" as const, occupation: null, notes: null, salaryReference: { period: "DAILY" as const, amount: "0.0001" }, currency: "DZD" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
const ctx = (overrides: Record<string, unknown> = {}) => ({
  client: {
    employeesGet: vi.fn().mockResolvedValue({ success: true, item: employee }),
    employeesSave: vi.fn().mockResolvedValue({ success: true, item: employee }),
    employeesCreate: vi.fn().mockResolvedValue({ success: true, item: employee }),
    employeesBatchCreate: vi.fn().mockResolvedValue({ success: true, item: { employees: [employee], managerAssignments: [], projectAssignments: [] } }),
    employeesDelete: vi.fn().mockResolvedValue({ success: true, message: "Deleted" }),
    employeesList: vi.fn().mockResolvedValue({ items: [employee] }),
    employeeStateHistoryList: vi.fn().mockResolvedValue({ items: [{ ...employee, id: "state-a", employeeId: employee.id, eventType: "UPDATED", startDate: "2026-01-01T00:00:00.000Z", endDate: null, actorUserId: null, transactionId: null }] }),
  } as unknown as ExactEmployeeClient,
  roles: [role], managerOptions: [], projectOptions: [], warehouseOptions: [], managedProjectOptions: [], managedWarehouseOptions: [],
  ...overrides,
})
afterEach(cleanup)

describe("exact employee page seams", () => {
  it("uses exact get and atomic save with a canonical DAILY reference, preserving the numeric page as a separate mode", async () => {
    const props = ctx()
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: i18n.t("detailPages.employee.editTitle") })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.salaryAmountLabel")), { target: { value: "٠٫٠٠٠١" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.save") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(props.client.employeesGet).toHaveBeenCalledWith({ id: "employee-a" })
    expect(props.client.employeesSave).toHaveBeenCalledWith(expect.objectContaining({ id: "employee-a", salaryReference: { period: "DAILY", amount: "0.0001" } }))
    expect((props.client as unknown as Record<string, ReturnType<typeof vi.fn>>).employeesUpdate).toBeUndefined()
  })

  it("keeps large MONTHLY exact value and NULL distinct from zero in submitted batches", async () => {
    const props = ctx()
    const onDone = vi.fn()
    render(<EmployeeBatchCreatePage mode="exact" operation="batch" {...props} onDone={onDone} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")), { target: { value: "Amina" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.lastNameLabel")), { target: { value: "Kaci" } })
    fireEvent.change(screen.getByLabelText(i18n.t("auth.phoneLabel")), { target: { value: "0551234567" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.salaryPeriodLabel")), { target: { value: "MONTHLY" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.salaryAmountLabel")), { target: { value: "9007199254740993.21" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("employeeForm.submitBatch") }))
    await waitFor(() => expect(props.client.employeesBatchCreate).toHaveBeenCalledOnce())
    expect(props.client.employeesBatchCreate).toHaveBeenCalledWith({ employees: [expect.objectContaining({ salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" } })] })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it("sends a batch only once for two synchronous submits", async () => {
    const props = ctx()
    const onDone = vi.fn()
    let resolveBatch!: (result: unknown) => void
    vi.mocked(props.client.employeesBatchCreate).mockImplementation(() => new Promise(resolve => { resolveBatch = resolve }) as never)
    render(<EmployeeBatchCreatePage mode="exact" operation="batch" {...props} onDone={onDone} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")), { target: { value: "Amina" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.lastNameLabel")), { target: { value: "Kaci" } })
    fireEvent.change(screen.getByLabelText(i18n.t("auth.phoneLabel")), { target: { value: "0551234567" } })
    const form = screen.getByRole("button", { name: i18n.t("employeeForm.submitBatch") }).closest("form")!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(props.client.employeesBatchCreate).toHaveBeenCalledOnce()
    resolveBatch({ success: true, item: { employees: [employee], managerAssignments: [], projectAssignments: [] } })
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it("composes exact employee details from the production record frame and translated history table", async () => {
    const props = ctx()
    render(<EmployeeDetailsPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: "Amina Kaci" })
    expect(screen.getAllByText(i18n.t("status.inactive")).length).toBeGreaterThan(0)
    expect(screen.getByRole("table")).toBeTruthy()
    expect(screen.getByText(i18n.t("detailPages.employee.notes"))).toBeTruthy()
  })

  it("renders stored history through the exact reference renderer and surfaces delete refusal without dropping the row", async () => {
    const props = ctx()
    vi.mocked(props.client.employeesDelete).mockResolvedValue({ success: false, error: { message: "Employee has linked work history" } } as never)
    render(<EmployeeDetailsPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findAllByText("0.0001")
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.delete") }))
    expect((await screen.findByRole("alert")).textContent).toContain("Employee has linked work history")
    expect(await screen.findByRole("heading", { name: "Amina Kaci" })).toBeTruthy()
    expect(props.client.employeeStateHistoryList).toHaveBeenCalledWith({ employeeId: "employee-a" })
  })

  it("keeps the edit draft and relationship edits after a rejected save, then submits them on retry", async () => {
    const manager = { id: "manager-a", label: "Manager A", projectOptions: [{ id: "project-a", label: "Project A" }] }
    const props = ctx({ managerOptions: [manager] })
    vi.mocked(props.client.employeesSave)
      .mockRejectedValueOnce(new Error("Server refused this change"))
      .mockResolvedValueOnce({ success: true, item: employee } as never)
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: i18n.t("detailPages.employee.editTitle") })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")), { target: { value: "Amina revised" } })
    fireEvent.change(screen.getByLabelText(i18n.t("status.active")), { target: { value: "ACTIVE" } })
    fireEvent.change(screen.getByLabelText(i18n.t("detailPages.employee.editPage.workplaceType")), { target: { value: "PROJECT" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.managerLabel")), { target: { value: "manager-a" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.projectLabel")), { target: { value: "project-a" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.save") }))
    expect((await screen.findByRole("alert")).textContent).toContain("Server refused this change")
    expect((screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")) as HTMLInputElement).value).toBe("Amina revised")
    expect((screen.getByLabelText(i18n.t("employeeForm.managerLabel")) as HTMLSelectElement).value).toBe("manager-a")
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.save") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledTimes(2))
    expect(props.client.employeesSave).toHaveBeenLastCalledWith(expect.objectContaining({ firstName: "Amina revised", placement: { nextType: "PROJECT", managerId: "manager-a", projectId: "project-a" } }))
  })

  it("sends only one edit mutation for two synchronous submits and unlocks after rejection", async () => {
    const props = ctx()
    let rejectSave!: (error: Error) => void
    vi.mocked(props.client.employeesSave).mockImplementation(() => new Promise((_, reject) => { rejectSave = reject }) as never)
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: i18n.t("detailPages.employee.editTitle") })
    const form = screen.getByRole("button", { name: i18n.t("common.save") }).closest("form")!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(props.client.employeesSave).toHaveBeenCalledOnce()
    rejectSave(new Error("Retry allowed"))
    await screen.findByText("Retry allowed")
    fireEvent.submit(form)
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledTimes(2))
  })

  it("routes exact single create through the exported page and keeps success terminal if onDone throws", async () => {
    const props = ctx({ managerOptions: [{ id: "manager-a", label: "Manager A", projectOptions: [{ id: "project-a", label: "Project A" }] }] })
    const onDone = vi.fn(() => { throw new Error("Refresh failed") })
    render(<EmployeeBatchCreatePage {...props} mode="exact" operation="create" onDone={onDone} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")), { target: { value: "Amina" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.lastNameLabel")), { target: { value: "Kaci" } })
    fireEvent.change(screen.getByLabelText(i18n.t("auth.phoneLabel")), { target: { value: "0551234567" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.managerLabel")), { target: { value: "manager-a" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.projectLabel")), { target: { value: "project-a" } })
    const form = screen.getByRole("button", { name: i18n.t("common.create") }).closest("form")!
    fireEvent.submit(form)
    await waitFor(() => expect(props.client.employeesCreate).toHaveBeenCalledOnce())
    expect(onDone).toHaveBeenCalledOnce()
    expect((await screen.findByRole("alert")).textContent).toBe(i18n.t("employeeForm.exactCompletionFailed", { error: "Refresh failed" }))
    fireEvent.submit(form)
    expect(props.client.employeesCreate).toHaveBeenCalledOnce()
    expect((screen.getByRole("button", { name: i18n.t("common.loading") }) as HTMLButtonElement).disabled).toBe(true)
    expect(props.client.employeesBatchCreate).not.toHaveBeenCalled()
  })

  it("keeps exact reads as errors instead of falling back to legacy handlers", async () => {
    const props = ctx()
    vi.mocked(props.client.employeesGet).mockRejectedValue(new Error("Exact endpoint unavailable"))
    render(<EmployeeEditPage mode="exact" {...props} employeeId="employee-a" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect((await screen.findByRole("alert")).textContent).toContain("Exact endpoint unavailable")
    expect((props.client as unknown as Record<string, unknown>).employeesUpdate).toBeUndefined()
  })
})
