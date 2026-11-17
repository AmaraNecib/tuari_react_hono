import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { exactEmployeeBatchCreateInputSchema, type ExactEmployeeClient, type Role } from "@tuari/contracts"
import { i18n } from "@/i18n"
import { EmployeeEditPage } from "./employee-edit-page"
import { EmployeeDetailsPage } from "./employee-details-page"
import { EmployeeBatchCreatePage } from "./employee-batch-create-page"
import { ExactEmployeeTable, mapExactEmployeeTableRow } from "./exact-employee-pages"

const { legacyDebtDetailQuery } = vi.hoisted(() => {
  const query = vi.fn(() => ({ isPending: false, isError: false, data: { accounts: [], entriesByAccountId: {} } }))
  return { legacyDebtDetailQuery: query }
})
vi.mock("@/features/debts/debts-queries", () => ({ useDebtPartyDetailQuery: legacyDebtDetailQuery }))
vi.mock("@tanstack/react-router", async importOriginal => ({ ...await importOriginal<typeof import("@tanstack/react-router")>(), Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a> }))

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
    employeesListPaged: vi.fn().mockResolvedValue({ items: [employee], total: 1, nextCursor: null, hasMore: false }),
    employeeStateHistoryList: vi.fn().mockResolvedValue({ items: [{ ...employee, id: "state-a", employeeId: employee.id, eventType: "UPDATED", startDate: "2026-01-01T00:00:00.000Z", endDate: null, actorUserId: null, transactionId: null }] }),
  } as unknown as ExactEmployeeClient,
  roles: [role], managerOptions: [], projectOptions: [], warehouseOptions: [], managedProjectOptions: [], managedWarehouseOptions: [],
  assignmentReferences: { people: [employee], projects: [], warehouses: [], managerAssignments: [], projectAssignments: [], warehouseAssignments: [] },
  ...overrides,
})
afterEach(cleanup)

describe("exact employee page seams", () => {
  it("requires the original confirmation dialog before deleting an exact employee", async () => {
    const props = ctx()
    const onDeleted = vi.fn(async () => undefined)
    render(<ExactEmployeeTable {...props} onView={vi.fn()} onEdit={vi.fn()} onDeleted={onDeleted} />)
    await screen.findByText("Amina Kaci")
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.delete") }))
    expect(props.client.employeesDelete).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Amina Kaci", { exact: false })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: i18n.t("common.cancel") }))
    expect(props.client.employeesDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.delete") }))
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: i18n.t("common.confirm") }))
    await waitFor(() => expect(props.client.employeesDelete).toHaveBeenCalledExactlyOnceWith({ id: employee.id }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce())
  })
  it("does not announce deletion or drop the employee when the server refuses", async () => {
    const props = ctx()
    const onDeleted = vi.fn()
    vi.mocked(props.client.employeesDelete).mockResolvedValue({ success: false, error: { message: "Preserved earning evidence" } } as never)
    render(<ExactEmployeeTable {...props} onView={vi.fn()} onEdit={vi.fn()} onDeleted={onDeleted} />)
    await screen.findByText("Amina Kaci")
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.delete") }))
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: i18n.t("common.confirm") }))
    expect((await screen.findByRole("alert")).textContent).toContain("Preserved earning evidence")
    expect(screen.getByText("Amina Kaci")).toBeTruthy()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it("uses the original edit form sections and controls for the exact adapter", async () => {
    const props = ctx()
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: new RegExp(i18n.t("detailPages.employee.editTitle")) })
    expect(screen.getByRole("heading", { name: i18n.t("detailPages.employee.editPage.personalTitle") })).toBeTruthy()
    expect(screen.getByRole("heading", { name: i18n.t("detailPages.employee.editPage.workTitle") })).toBeTruthy()
    expect(screen.getByRole("heading", { name: i18n.t("detailPages.employee.editPage.salaryTitle") })).toBeTruthy()
    expect(screen.getByLabelText(i18n.t("employeeForm.notesLabel")).tagName).toBe("TEXTAREA")
    expect(screen.getByLabelText(i18n.t("employeeForm.salaryAmountLabel")).getAttribute("dir")).toBe("ltr")
    expect(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.backToRecord") })).toBeTruthy()
    expect(screen.getAllByRole("button", { name: i18n.t("common.cancel") })).toHaveLength(1)
  })


  it("renders the original employee list actions and keeps numeric salary payment unavailable", async () => {
    const props = ctx()
    vi.mocked(props.client.employeesListPaged).mockResolvedValue({ items: [{ ...employee, status: "ACTIVE" }], total: 1, nextCursor: null, hasMore: false })
    render(<ExactEmployeeTable {...props} onView={vi.fn()} onEdit={vi.fn()} />)
    await screen.findByText("Amina Kaci")
    expect(screen.getByRole("columnheader", { name: i18n.t("columns.name") })).toBeTruthy()
    expect(screen.getByRole("button", { name: i18n.t("common.leave") })).toBeTruthy()
    expect(screen.getByRole("button", { name: i18n.t("common.delete") })).toBeTruthy()
    expect(screen.queryByRole("button", { name: i18n.t("salaries.addPayment") })).toBeNull()
  })

  it("matches end-work eligibility to active relationship links and server reasons", async () => {
    const managerRole: Role = { ...role, id: "role-manager", key: "project_manager", name: "Project manager" }
    const warehouseManagerRole: Role = { ...role, id: "role-warehouse-manager", key: "warehouse_manager", name: "Warehouse manager" }
    const linkedWorker = { ...employee, id: "worker-linked", firstName: "Linked", status: "ACTIVE" as const }
    const unlinkedManager = { ...employee, id: "manager-unlinked", firstName: "Unlinked", roleId: managerRole.id, status: "ACTIVE" as const }
    const linkedManager = { ...employee, id: "manager-linked", firstName: "Project", roleId: managerRole.id, status: "ACTIVE" as const }
    const linkedWarehouseManager = { ...employee, id: "warehouse-manager-linked", firstName: "Warehouse", roleId: warehouseManagerRole.id, status: "ACTIVE" as const }
    const references = {
      people: [linkedWorker, unlinkedManager, linkedManager, linkedWarehouseManager],
      projects: [{ id: "managed-project", name: "Managed project", managerId: linkedManager.id, status: "ACTIVE" as const }],
      warehouses: [{ id: "managed-warehouse", name: "Managed warehouse", managerId: linkedWarehouseManager.id, status: "ACTIVE" as const }],
      managerAssignments: [
        { id: "worker-manager-link", workerId: linkedWorker.id, managerId: linkedManager.id, status: "ACTIVE" as const, startDate: "2026-11-01", endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: "2026-11-01", updatedAt: "2026-11-01" },
        { id: "manager-report-link", workerId: "worker-report", managerId: linkedManager.id, status: "ACTIVE" as const, startDate: "2026-11-01", endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: "2026-11-01", updatedAt: "2026-11-01" },
      ],
      projectAssignments: [{ id: "worker-project-link", employeeId: linkedWorker.id, projectId: "managed-project", status: "ACTIVE" as const, startDate: "2026-11-01", endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: "2026-11-01", updatedAt: "2026-11-01" }],
      warehouseAssignments: [],
    }
    const copy = {
      noManager: i18n.t("shell.noManager"),
      noWorkplace: i18n.t("detailPages.employee.noCurrentWorkplace"),
      leaveReasonInactive: i18n.t("detailPages.employee.leaveReasonInactive"),
      leaveReasonWorkerLinked: i18n.t("detailPages.employee.leaveReasonWorkerLinked"),
      leaveReasonProjectManagerLinked: i18n.t("detailPages.employee.leaveReasonProjectManagerLinked"),
      leaveReasonWarehouseManagerLinked: i18n.t("detailPages.employee.leaveReasonWarehouseManagerLinked"),
      leaveReasonFallback: i18n.t("detailPages.employee.leaveReasonFallback"),
    }
    const rows = [linkedWorker, unlinkedManager, linkedManager, linkedWarehouseManager].map(person => mapExactEmployeeTableRow(person, [role, managerRole, warehouseManagerRole], references, copy))
    expect(rows.find(row => row.id === unlinkedManager.id)).toMatchObject({ canLeave: true, leaveDisabledReason: null })
    expect(rows.find(row => row.id === linkedWorker.id)).toMatchObject({ canLeave: false, leaveDisabledReason: i18n.t("detailPages.employee.leaveReasonWorkerLinked") })
    expect(rows.find(row => row.id === linkedManager.id)).toMatchObject({ canLeave: false, leaveDisabledReason: i18n.t("detailPages.employee.leaveReasonProjectManagerLinked") })
    expect(rows.find(row => row.id === linkedWarehouseManager.id)).toMatchObject({ canLeave: false, leaveDisabledReason: i18n.t("detailPages.employee.leaveReasonWarehouseManagerLinked") })

    const props = ctx({ roles: [role, managerRole], assignmentReferences: references })
    vi.mocked(props.client.employeesListPaged).mockResolvedValue({ items: [linkedWorker, unlinkedManager], total: 2, nextCursor: null, hasMore: false })
    render(<ExactEmployeeTable {...props} onView={vi.fn()} onEdit={vi.fn()} />)
    const managerRow = await screen.findByRole("row", { name: /Unlinked Kaci/ })
    const workerRow = await screen.findByRole("row", { name: /Linked Kaci/ })
    expect((within(managerRow).getByRole("button", { name: i18n.t("common.leave") }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(workerRow).getByRole("button", { name: i18n.t("common.leave") }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows the active manager and assigned project from authenticated references", async () => {
    const managerRole: Role = { ...role, id: "role-manager", key: "project_manager", name: "Project manager" }
    const worker = { ...employee, status: "ACTIVE" as const }
    const manager = { ...employee, id: "manager-a", firstName: "Samir", lastName: "Belaid", roleId: managerRole.id }
    const props = ctx({
      roles: [role, managerRole],
      assignmentReferences: {
        people: [worker, manager],
        projects: [{ id: "project-a", name: "North site", managerId: manager.id }],
        warehouses: [],
        managerAssignments: [{ id: "manager-assignment-a", workerId: worker.id, managerId: manager.id, status: "ACTIVE", startDate: "2026-11-01T00:00:00.000Z", endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }],
        projectAssignments: [{ id: "project-assignment-a", employeeId: worker.id, projectId: "project-a", status: "ACTIVE", startDate: "2026-11-02T00:00:00.000Z", endDate: null, notes: null, actorUserId: null, transactionId: null, createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" }],
        warehouseAssignments: [],
      },
    })
    vi.mocked(props.client.employeesListPaged).mockResolvedValue({ items: [worker], total: 1, nextCursor: null, hasMore: false })
    render(<ExactEmployeeTable {...props} onView={vi.fn()} onEdit={vi.fn()} />)
    const row = await screen.findByRole("row", { name: /Amina Kaci/ })
    expect(within(row).getByText("Samir Belaid")).toBeTruthy()
    expect(within(row).getByText("North site")).toBeTruthy()
    expect(within(row).queryByText(i18n.t("shell.noManager"))).toBeNull()
    expect(within(row).queryByText(i18n.t("detailPages.employee.noCurrentWorkplace"))).toBeNull()
  })

  it("uses server-side search and cursor paging on the exact employee list", async () => {
    const props = ctx()
    vi.mocked(props.client.employeesListPaged)
      .mockResolvedValueOnce({ items: [employee], total: 51, nextCursor: "page-2", hasMore: true })
      .mockResolvedValueOnce({ items: [{ ...employee, id: "employee-b", firstName: "Beyond" }], total: 1, nextCursor: null, hasMore: false })
    const onPaginationChange = vi.fn()
    const onView = vi.fn()
    const onEdit = vi.fn()
    const mounted = render(<ExactEmployeeTable {...props} onPaginationChange={onPaginationChange} onView={onView} onEdit={onEdit} />)
    await screen.findByText("Amina Kaci")
    await waitFor(() => expect(props.client.employeesListPaged).toHaveBeenCalledWith({ limit: 50, search: undefined, cursor: undefined }))
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.next") }))
    expect(onPaginationChange).toHaveBeenCalledWith({ cursor: "page-2", limit: undefined, prevCursors: "" })
    mounted.rerender(<ExactEmployeeTable {...props} paginationCursor="page-2" paginationPrevCursors="" onPaginationChange={onPaginationChange} onView={onView} onEdit={onEdit} />)
    await screen.findByText("Beyond Kaci")
    expect(props.client.employeesListPaged).toHaveBeenLastCalledWith({ limit: 50, search: undefined, cursor: "page-2" })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.previous") }))
    expect(onPaginationChange).toHaveBeenLastCalledWith({ cursor: undefined, limit: undefined, prevCursors: undefined })
  })

  it("passes typed search to the exact paged client", async () => {
    const props = ctx()
    render(<ExactEmployeeTable {...props} onView={vi.fn()} onEdit={vi.fn()} />)
    const input = await screen.findByPlaceholderText(i18n.t("search.placeholder"))
    fireEvent.change(input, { target: { value: "0551234567" } })
    await waitFor(() => expect(props.client.employeesListPaged).toHaveBeenLastCalledWith({ limit: 50, search: "0551234567", cursor: undefined }), { timeout: 1500 })
  })

  it("retains one production heading when the workspace has no employees", async () => {
    const props = ctx()
    vi.mocked(props.client.employeesListPaged).mockResolvedValue({ items: [], total: 0, nextCursor: null, hasMore: false })
    render(<ExactEmployeeTable {...props} onView={vi.fn()} onEdit={vi.fn()} onAdd={vi.fn()} />)
    await screen.findByText(i18n.t("shell.empty"))
    expect(screen.getAllByRole("heading", { level: 1, name: i18n.t("sections.employees.label") })).toHaveLength(1)
  })

  it("keeps exact-only role choices and locks multiline note edits while the atomic save is in flight", async () => {
    const props = ctx({ roles: [role, { ...role, id: "admin-role", key: "admin", name: "Admin" }] })
    const onDone = vi.fn()
    const onCancel = vi.fn()
    let complete!: (result: unknown) => void
    vi.mocked(props.client.employeesSave).mockImplementation(() => new Promise(resolve => { complete = resolve }) as never)
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={onDone} onCancel={onCancel} />)
    const notes = await screen.findByLabelText(i18n.t("employeeForm.notesLabel"))
    expect(screen.getByRole("option", { name: "Admin" })).toBeTruthy()
    fireEvent.change(notes, { target: { value: "First line\nSecond line" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(vi.mocked(props.client.employeesSave).mock.calls[0]?.[0]).toEqual(expect.objectContaining({ notes: "First line\nSecond line", salaryReference: { period: "DAILY", amount: "0.0001" } }))
    expect(vi.mocked(props.client.employeesSave).mock.calls[0]?.[0]).not.toHaveProperty("salaryAmountDzd")
    expect(vi.mocked(props.client.employeesSave).mock.calls[0]?.[0]).not.toHaveProperty("placement")
    expect(notes.closest("fieldset")?.disabled).toBe(true)
    expect((screen.getByRole("button", { name: i18n.t("common.cancel") }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.cancel") }))
    expect(onCancel).not.toHaveBeenCalled()
    complete({ success: true, item: employee })
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(notes.closest("fieldset")?.disabled).toBe(true)
  })

  it("preserves a large MONTHLY reference as an exact string through edit", async () => {
    const props = ctx()
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText(i18n.t("employeeForm.salaryPeriodLabel")), { target: { value: "MONTHLY" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.salaryAmountLabel")), { target: { value: "9007199254740993.21" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(props.client.employeesSave).toHaveBeenCalledWith(expect.objectContaining({ salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" } }))
  })

  it("selects WEEKLY through the original form and enforces money precision before exact serialization", async () => {
    const props = ctx()
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    const period = await screen.findByLabelText(i18n.t("employeeForm.salaryPeriodLabel"))
    fireEvent.change(period, { target: { value: "WEEKLY" } })
    const amount = screen.getByLabelText(i18n.t("employeeForm.salaryAmountLabel"))
    fireEvent.change(amount, { target: { value: "12.3456" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await screen.findByRole("alert")
    expect(props.client.employeesSave).not.toHaveBeenCalled()
    fireEvent.change(amount, { target: { value: "١٢٣٤٥٫٦٧" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(props.client.employeesSave).toHaveBeenCalledWith(expect.objectContaining({ salaryReference: { period: "WEEKLY", amount: "12345.67" } }))
  })

  it.each([
    { name: "unset", period: "", amount: "", reference: null },
    { name: "zero", period: "WEEKLY", amount: "0", reference: { period: "WEEKLY", amount: "0.00" } },
  ])("preserves $name salary as distinct from the other through exact edit", async ({ period, amount, reference }) => {
    const props = ctx()
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText(i18n.t("employeeForm.salaryPeriodLabel")), { target: { value: period } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.salaryAmountLabel")), { target: { value: amount } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(props.client.employeesSave).toHaveBeenCalledWith(expect.objectContaining({ salaryReference: reference }))
  })

  it.each(["PROJECT", "WAREHOUSE"] as const)("removes an existing %s placement with an explicit atomic NONE directive", async nextType => {
    const currentPlacement = nextType === "PROJECT" ? { nextType, managerId: "manager-a", projectId: "project-a" } : { nextType, warehouseId: "warehouse-a" }
    const props = ctx({ currentPlacement, managerOptions: [{ id: "manager-a", label: "Manager A", projectOptions: [{ id: "project-a", label: "Project A" }] }], warehouseOptions: [{ id: "warehouse-a", label: "Warehouse A" }] })
    vi.mocked(props.client.employeesGet).mockResolvedValue({ success: true, message: "Loaded", item: { ...employee, status: "ACTIVE" } })
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    const placement = await screen.findByLabelText(i18n.t("detailPages.employee.editPage.workplaceType")) as HTMLSelectElement
    expect(placement.value).toBe(nextType)
    fireEvent.change(placement, { target: { value: "NONE" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(props.client.employeesSave).toHaveBeenCalledWith(expect.objectContaining({ placement: { nextType: "NONE" } }))
  })

  it.each(["PROJECT", "WAREHOUSE"] as const)("omits an untouched existing %s placement from a profile-only save", async nextType => {
    const currentPlacement = nextType === "PROJECT" ? { nextType, managerId: "manager-a", projectId: "project-a" } : { nextType, warehouseId: "warehouse-a" }
    const props = ctx({ currentPlacement, managerOptions: [{ id: "manager-a", label: "Manager A", projectOptions: [{ id: "project-a", label: "Project A" }] }], warehouseOptions: [{ id: "warehouse-a", label: "Warehouse A" }] })
    vi.mocked(props.client.employeesGet).mockResolvedValue({ success: true, message: "Loaded", item: { ...employee, status: "ACTIVE" } })
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText(i18n.t("employeeForm.notesLabel")), { target: { value: "Profile only" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(vi.mocked(props.client.employeesSave).mock.calls[0]?.[0]).not.toHaveProperty("placement")
    expect(vi.mocked(props.client.employeesSave).mock.calls[0]?.[0]).toHaveProperty("notes", "Profile only")
  })

  it("uses exact get and atomic save with a canonical DAILY reference, preserving the numeric page as a separate mode", async () => {
    const props = ctx()
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: new RegExp(i18n.t("detailPages.employee.editTitle")) })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.salaryAmountLabel")), { target: { value: "٠٫٠٠٠١" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledOnce())
    expect(props.client.employeesGet).toHaveBeenCalledWith({ id: "employee-a" })
    expect(props.client.employeesSave).toHaveBeenCalledWith(expect.objectContaining({ id: "employee-a", salaryReference: { period: "DAILY", amount: "0.0001" } }))
    expect((props.client as unknown as Record<string, ReturnType<typeof vi.fn>>).employeesUpdate).toBeUndefined()
  })

  it("keeps large MONTHLY exact value and NULL distinct from zero in submitted batches", async () => {
    const props = ctx({ managerOptions: [{ id: "manager-a", label: "Manager A", projectOptions: [{ id: "project-a", label: "Project A" }] }] })
    const onDone = vi.fn()
    render(<EmployeeBatchCreatePage mode="exact" operation="batch" {...props} onDone={onDone} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")), { target: { value: "Amina" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.lastNameLabel")), { target: { value: "Kaci" } })
    fireEvent.change(screen.getByLabelText(i18n.t("auth.phoneLabel")), { target: { value: "0551234567" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.managerLabel")), { target: { value: "manager-a" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.projectLabel")), { target: { value: "project-a" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.salaryPeriodLabel")), { target: { value: "MONTHLY" } })
    fireEvent.change(screen.getByRole("textbox", { name: new RegExp(i18n.t("employeeForm.salaryAmountLabel")) }), { target: { value: "9007199254740993.21" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("employeeForm.submitBatch") }))
    await waitFor(() => expect(props.client.employeesBatchCreate).toHaveBeenCalledOnce())
    expect(props.client.employeesBatchCreate).toHaveBeenCalledWith({ employees: [expect.objectContaining({ salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" } })] })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it("sends a batch only once for two synchronous submits", async () => {
    const props = ctx({ managerOptions: [{ id: "manager-a", label: "Manager A", projectOptions: [{ id: "project-a", label: "Project A" }] }] })
    const onDone = vi.fn()
    let resolveBatch!: (result: unknown) => void
    vi.mocked(props.client.employeesBatchCreate).mockImplementation(() => new Promise(resolve => { resolveBatch = resolve }) as never)
    render(<EmployeeBatchCreatePage mode="exact" operation="batch" {...props} onDone={onDone} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")), { target: { value: "Amina" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.lastNameLabel")), { target: { value: "Kaci" } })
    fireEvent.change(screen.getByLabelText(i18n.t("auth.phoneLabel")), { target: { value: "0551234567" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.managerLabel")), { target: { value: "manager-a" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.projectLabel")), { target: { value: "project-a" } })
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
    expect(screen.getByRole("link", { name: i18n.t("detailPages.employee.back") })).toBeTruthy()
    expect(screen.getByRole("tab", { name: i18n.t("detailPages.employee.historyTab") })).toBeTruthy()
    expect(screen.getByRole("tab", { name: i18n.t("detailPages.employee.financeTab") })).toBeTruthy()
    fireEvent.click(screen.getByRole("tab", { name: i18n.t("detailPages.employee.historyTab") }))
    expect(screen.getAllByText(i18n.t("common.edit")).length).toBeGreaterThan(0)
    expect(screen.queryByText("UPDATED")).toBeNull()
    fireEvent.click(screen.getByRole("tab", { name: i18n.t("detailPages.employee.personalTab") }))
    expect(screen.getByText(i18n.t("detailPages.employee.notes"))).toBeTruthy()
    fireEvent.click(screen.getByRole("tab", { name: i18n.t("detailPages.employee.financeTab") }))
    expect(screen.getByText("0.0001")).toBeTruthy()
    expect(screen.getByRole("link", { name: i18n.t("salaryEarnings.approvalSection") })).toBeTruthy()
  })

  it("keeps the original debts tab but refuses the legacy numeric debt read", async () => {
    legacyDebtDetailQuery.mockClear()
    const props = ctx()
    render(<EmployeeDetailsPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: "Amina Kaci" })
    fireEvent.click(screen.getByRole("tab", { name: "الديون" }))
    expect(screen.getByText(i18n.t("application.unavailable"))).toBeTruthy()
    expect(legacyDebtDetailQuery).not.toHaveBeenCalled()
  })

  it("renders stored history through the exact reference renderer and surfaces delete refusal without dropping the row", async () => {
    const props = ctx()
    vi.mocked(props.client.employeesDelete).mockResolvedValue({ success: false, error: { message: "Employee has linked work history" } } as never)
    render(<EmployeeDetailsPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: "Amina Kaci" })
    fireEvent.click(screen.getByRole("tab", { name: i18n.t("detailPages.employee.financeTab") }))
    expect(screen.getByText("0.0001")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.delete") }))
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: i18n.t("common.confirm") }))
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
    await screen.findByRole("heading", { name: new RegExp(i18n.t("detailPages.employee.editTitle")) })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")), { target: { value: "Amina revised" } })
    fireEvent.change(screen.getByLabelText(i18n.t("detailPages.employee.editPage.status")), { target: { value: "ACTIVE" } })
    fireEvent.change(screen.getByLabelText(i18n.t("detailPages.employee.editPage.workplaceType")), { target: { value: "PROJECT" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.managerLabel")), { target: { value: "manager-a" } })
    fireEvent.change(screen.getByLabelText(i18n.t("employeeForm.projectLabel")), { target: { value: "project-a" } })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    expect((await screen.findByRole("alert")).textContent).toContain("Server refused this change")
    expect((screen.getByLabelText(i18n.t("employeeForm.firstNameLabel")) as HTMLInputElement).value).toBe("Amina revised")
    expect((screen.getByLabelText(i18n.t("employeeForm.managerLabel")) as HTMLSelectElement).value).toBe("manager-a")
    fireEvent.click(screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }))
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledTimes(2))
    expect(props.client.employeesSave).toHaveBeenLastCalledWith(expect.objectContaining({ firstName: "Amina revised", placement: { nextType: "PROJECT", managerId: "manager-a", projectId: "project-a" } }))
  })

  it("sends only one edit mutation for two synchronous submits and unlocks after rejection", async () => {
    const props = ctx()
    let rejectSave!: (error: Error) => void
    vi.mocked(props.client.employeesSave).mockImplementation(() => new Promise((_, reject) => { rejectSave = reject }) as never)
    render(<EmployeeEditPage mode="exact" {...props} employeeId={employee.id} onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole("heading", { name: new RegExp(i18n.t("detailPages.employee.editTitle")) })
    const form = screen.getByRole("button", { name: i18n.t("detailPages.employee.editPage.saveAll") }).closest("form")!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(props.client.employeesSave).toHaveBeenCalledOnce()
    rejectSave(new Error("Retry allowed"))
    await screen.findByText("Retry allowed")
    fireEvent.submit(form)
    await waitFor(() => expect(props.client.employeesSave).toHaveBeenCalledTimes(2))
  })

  it("preserves batch drafts when switching to single mode and submits only the explicitly retained employee", async () => {
    const props = ctx({ managerOptions: [{ id: "manager-a", label: "Manager A", projectOptions: [{ id: "project-a", label: "Project A" }] }] })
    const onDone = vi.fn()
    const mounted = render(<EmployeeBatchCreatePage {...props} mode="exact" operation="batch" onDone={onDone} onCancel={vi.fn()} />)
    const fillEmployee = (index: number, person: { firstName: string; lastName: string; phone: string }) => {
      fireEvent.change(mounted.container.querySelector(`[name="employee-first-name-${index}"]`)!, { target: { value: person.firstName } })
      fireEvent.change(mounted.container.querySelector(`[name="employee-last-name-${index}"]`)!, { target: { value: person.lastName } })
      fireEvent.change(mounted.container.querySelector(`[name="employee-phone-${index}"]`)!, { target: { value: person.phone } })
      fireEvent.change(mounted.container.querySelector(`[name="employee-manager-${index}"]`)!, { target: { value: "manager-a" } })
      fireEvent.change(mounted.container.querySelector(`[name="employee-project-${index}"]`)!, { target: { value: "project-a" } })
    }
    fillEmployee(0, { firstName: "Amina", lastName: "Kaci", phone: "0551234567" })
    fireEvent.click(screen.getByRole("button", { name: i18n.t("employeeForm.addAnother") }))
    fillEmployee(1, { firstName: "Nadia", lastName: "Said", phone: "0661234567" })

    mounted.rerender(<EmployeeBatchCreatePage {...props} mode="exact" operation="create" onDone={onDone} onCancel={vi.fn()} />)
    expect((mounted.container.querySelector('[name="employee-first-name-0"]') as HTMLInputElement).value).toBe("Amina")
    expect((mounted.container.querySelector('[name="employee-first-name-1"]') as HTMLInputElement).value).toBe("Nadia")
    const form = mounted.container.querySelector("form")!
    fireEvent.submit(form)
    expect(props.client.employeesBatchCreate).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe(i18n.t("employeeForm.singleCreateRequiresOneRow"))
    expect((mounted.container.querySelector('[name="employee-first-name-0"]') as HTMLInputElement).value).toBe("Amina")
    expect((mounted.container.querySelector('[name="employee-first-name-1"]') as HTMLInputElement).value).toBe("Nadia")
    fireEvent.click(within(mounted.container.querySelectorAll("article")[1] as HTMLElement).getByRole("button", { name: i18n.t("employeeForm.remove") }))
    expect(mounted.container.querySelector('[name="employee-first-name-1"]')).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.create") }))
    await waitFor(() => expect(props.client.employeesBatchCreate).toHaveBeenCalledOnce())
    const submitted = vi.mocked(props.client.employeesBatchCreate).mock.calls[0]![0]
    expect(submitted.employees).toHaveLength(1)
    expect(submitted.employees[0]).toMatchObject({ firstName: "Amina", lastName: "Kaci", phone: "0551234567" })
    expect(submitted.employees.some(person => person.firstName === "Nadia")).toBe(false)
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
    await waitFor(() => expect(props.client.employeesBatchCreate).toHaveBeenCalledOnce())
    const input = vi.mocked(props.client.employeesBatchCreate).mock.calls[0]?.[0]
    expect(exactEmployeeBatchCreateInputSchema.parse(input).employees[0]).toMatchObject({ managerId: "manager-a", projectId: "project-a", firstName: "Amina" })
    expect(onDone).toHaveBeenCalledOnce()
    expect((await screen.findByRole("alert")).textContent).toBe(i18n.t("employeeForm.exactCompletionFailed", { error: "Refresh failed" }))
    fireEvent.submit(form)
    expect(props.client.employeesBatchCreate).toHaveBeenCalledOnce()
    expect((screen.getByRole("button", { name: i18n.t("common.create") }) as HTMLButtonElement).disabled).toBe(true)
    expect(props.client.employeesCreate).not.toHaveBeenCalled()
  })

  it("keeps exact reads as errors instead of falling back to legacy handlers", async () => {
    const props = ctx()
    vi.mocked(props.client.employeesGet).mockRejectedValue(new Error("Exact endpoint unavailable"))
    render(<EmployeeEditPage mode="exact" {...props} employeeId="employee-a" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect((await screen.findByRole("alert")).textContent).toContain("Exact endpoint unavailable")
    expect((props.client as unknown as Record<string, unknown>).employeesUpdate).toBeUndefined()
  })
})
