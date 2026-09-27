// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EmployeeEditPage } from "@/features/employees/employee-edit-page"

const {
  mockNavigate,
  mockNavigateToWorkspaceRoute,
  mockSaveEmployee,
  mockEmployeesGet,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockNavigateToWorkspaceRoute: vi.fn(),
  mockSaveEmployee: vi.fn(),
  mockEmployeesGet: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock("@/router/navigation", () => ({
  navigateToWorkspaceRoute: mockNavigateToWorkspaceRoute,
  workspaceRoutes: {
    employeeDetails: (id: string) => `/employees/${id}`,
    employees: () => "/employees",
  },
}))

vi.mock("@/features/app-shell/mock-dashboard", () => ({
  useSaveEmployeeMutation: () => ({ isPending: false, mutateAsync: mockSaveEmployee }),
}))

vi.mock("@/lib/orpc-client", () => ({
  rpcClient: { employeesGet: mockEmployeesGet },
}))

const workerEmployee = {
  id: "emp-worker",
  firstName: "أحمد",
  lastName: "صالح",
  name: "أحمد صالح",
  phone: "0555555555",
  roleId: "role-worker",
  roleKey: "worker",
  role: "عامل",
  status: "ACTIVE",
  salaryAmountDzd: 12000,
  salaryPeriod: "MONTHLY",
  notes: null,
  occupation: null,
  currentManagerId: "mgr-1",
  currentManagerName: "مدير 1",
  currentProjectId: "proj-1",
  currentWarehouseId: null,
  currentWorkplace: "مشروع 1",
} as const

const projectManagerEmployee = {
  id: "emp-pm",
  firstName: "سمير",
  lastName: "بوعلام",
  name: "سمير بوعلام",
  phone: "0666666666",
  roleId: "role-project-manager",
  roleKey: "project_manager",
  role: "مدير مشروع",
  status: "ACTIVE",
  salaryAmountDzd: 20000,
  salaryPeriod: "MONTHLY",
  notes: null,
  occupation: null,
  currentManagerId: null,
  currentManagerName: null,
  currentProjectId: null,
  currentWarehouseId: null,
  currentWorkplace: "",
} as const

const warehouseManagerEmployee = {
  id: "emp-wh",
  firstName: "كمال",
  lastName: "زروقي",
  name: "كمال زروقي",
  phone: "0777777777",
  roleId: "role-warehouse-manager",
  roleKey: "warehouse_manager",
  role: "مدير مستودع",
  status: "ACTIVE",
  salaryAmountDzd: 18000,
  salaryPeriod: "MONTHLY",
  notes: null,
  occupation: null,
  currentManagerId: null,
  currentManagerName: null,
  currentProjectId: null,
  currentWarehouseId: null,
  currentWorkplace: "",
} as const

const workerNoPlacementEmployee = {
  ...workerEmployee,
  id: "emp-np",
  currentManagerId: null,
  currentManagerName: null,
  currentProjectId: null,
  currentWarehouseId: null,
  currentWorkplace: "",
} as const

const workerManagerOptions = [
  { id: "mgr-1", label: "مدير 1", projectOptions: [{ id: "proj-1", label: "مشروع 1" }] },
  { id: "mgr-2", label: "مدير 2", projectOptions: [{ id: "proj-2", label: "مشروع 2" }] },
]
const workerRoles = [{ id: "role-worker", key: "worker", name: "عامل" }]
const pmRoles = [{ id: "role-project-manager", key: "project_manager", name: "مدير مشروع" }]
const warehouseManagerRoles = [{ id: "role-warehouse-manager", key: "warehouse_manager", name: "مدير مستودع" }]

function renderWorker(employee: object = workerEmployee) {
  return render(
    <EmployeeEditPage
      currentManagedProjectIds={[]}
      currentManagedWarehouseIds={[]}
      employee={employee as never}
      managedProjectOptions={[]}
      managedWarehouseOptions={[]}
      managerOptions={workerManagerOptions}
      roles={workerRoles as never}
    />,
  )
}

function renderWarehouseManager() {
  return render(
    <EmployeeEditPage
      currentManagedProjectIds={[]}
      currentManagedWarehouseIds={["wh-1"]}
      employee={warehouseManagerEmployee as never}
      managedProjectOptions={[]}
      managedWarehouseOptions={[
        { id: "wh-1", label: "مستودع 1", secondary: "الرويبة" },
        { id: "wh-2", label: "مستودع 2", secondary: "سطاوالي" },
      ]}
      managerOptions={[]}
      roles={warehouseManagerRoles as never}
    />,
  )
}

function renderProjectManager() {
  return render(
    <EmployeeEditPage
      currentManagedProjectIds={["proj-1"]}
      currentManagedWarehouseIds={[]}
      employee={projectManagerEmployee as never}
      managedProjectOptions={[
        { id: "proj-1", label: "مشروع 1", secondary: "الجزائر" },
        { id: "proj-2", label: "مشروع 2", secondary: "وهران" },
      ]}
      managedWarehouseOptions={[]}
      managerOptions={[]}
      roles={pmRoles as never}
    />,
  )
}

function clickSaveAll() {
  fireEvent.click(screen.getByRole("button", { name: "حفظ كل التغييرات" }))
}

afterEach(cleanup)

describe("employee edit atomic save (issue #49)", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockNavigateToWorkspaceRoute.mockReset()
    mockSaveEmployee.mockReset()
    mockEmployeesGet.mockReset()
  })

  it("rejects an untouched save for an ACTIVE worker with no placement (issue #20)", async () => {
    // E2E regression: an ACTIVE worker must have a placement, so saving with
    // the default NONE workplace is rejected inline even when the user never
    // touched a relationship control.
    mockSaveEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderWorker(workerNoPlacementEmployee)

    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "اسم معدل" } })
    clickSaveAll()

    await waitFor(() => expect(screen.getByText("اختر مكان عمل للعامل النشط (مشروع أو مستودع).")).toBeTruthy())
    expect(mockSaveEmployee).not.toHaveBeenCalled()
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("omits untouched relationship fields from a stale profile-only save", async () => {
    // PR #51 review: the page loads with mgr-1/proj-1, but the user only edits
    // the profile. The load-time placement snapshot must NOT be submitted, or a
    // stale page could revert newer concurrent relationship changes.
    mockSaveEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderWorker()

    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "اسم معدل" } })
    clickSaveAll()

    await waitFor(() => {
      expect(mockNavigateToWorkspaceRoute).toHaveBeenCalledWith(mockNavigate, "/employees/emp-worker")
    })
    expect(mockSaveEmployee).toHaveBeenCalledTimes(1)
    const payload = mockSaveEmployee.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.id).toBe("emp-worker")
    expect(payload.firstName).toBe("اسم معدل")
    expect(payload).not.toHaveProperty("placement")
    expect(payload).not.toHaveProperty("managedProjectIds")
    expect(payload).not.toHaveProperty("managedWarehouseIds")
  })

  it("sends edited relationship fields alongside the profile in one batch", async () => {
    mockSaveEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderWorker()

    fireEvent.change(screen.getByLabelText("المدير المباشر"), { target: { value: "mgr-2" } })
    fireEvent.change(screen.getByLabelText("المشروع الحالي"), { target: { value: "proj-2" } })
    clickSaveAll()

    await waitFor(() => expect(mockNavigateToWorkspaceRoute).toHaveBeenCalled())
    expect(mockSaveEmployee).toHaveBeenCalledWith(expect.objectContaining({
      id: "emp-worker",
      placement: {
        managerId: "mgr-2",
        nextType: "PROJECT",
        projectId: "proj-2",
        warehouseId: null,
      },
    }))
  })

  it("sends the managed scope in the same batch when it was edited", async () => {
    mockSaveEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderProjectManager()
    fireEvent.click(screen.getAllByRole("checkbox")[1]!)
    clickSaveAll()

    await waitFor(() => expect(mockNavigateToWorkspaceRoute).toHaveBeenCalled())
    const payload = mockSaveEmployee.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.managedProjectIds).toEqual(["proj-1", "proj-2"])
    expect(payload).not.toHaveProperty("placement")
    expect(payload).not.toHaveProperty("managedWarehouseIds")
  })

  it("keeps typed edits and shows the nothing-saved banner after a rejected batch", async () => {
    // The batch is atomic server-side: a rejection means nothing persisted, so
    // the page must keep the user's edits (PR #51 Greptile finding) instead of
    // reloading the old record over them.
    mockSaveEmployee.mockRejectedValue(new Error("تعذر حفظ الدفعة"))
    renderWorker()

    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "اسم معدل" } })
    fireEvent.change(screen.getByLabelText("المدير المباشر"), { target: { value: "mgr-2" } })
    fireEvent.change(screen.getByLabelText("المشروع الحالي"), { target: { value: "proj-2" } })
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("تعذر حفظ التغييرات — لم يُحفظ أي تعديل. تحقق من البيانات ثم أعد المحاولة.")).toBeTruthy()
    })
    expect(mockSaveEmployee).toHaveBeenCalledTimes(1)
    expect(mockEmployeesGet).not.toHaveBeenCalled()
    expect((screen.getByLabelText("الاسم الأول") as HTMLInputElement).value).toBe("اسم معدل")
    expect((screen.getByLabelText("المدير المباشر") as HTMLSelectElement).value).toBe("mgr-2")
    expect((screen.getByLabelText("المشروع الحالي") as HTMLSelectElement).value).toBe("proj-2")
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("keeps edited managed-warehouse selections after a rejected batch", async () => {
    mockSaveEmployee.mockRejectedValue(new Error("تعذر مزامنة المستودعات"))
    renderWarehouseManager()
    fireEvent.click(screen.getAllByRole("checkbox")[1]!)
    clickSaveAll()

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
    expect(checkboxes[0]!.checked).toBe(true)
    expect(checkboxes[1]!.checked).toBe(true)
    expect(mockEmployeesGet).not.toHaveBeenCalled()
  })

  it("ignores edited placement for a non-active worker while still saving the profile", async () => {
    mockSaveEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderWorker(workerNoPlacementEmployee)

    fireEvent.change(screen.getByLabelText("مكان العمل"), { target: { value: "PROJECT" } })
    fireEvent.change(screen.getByLabelText("المدير المباشر"), { target: { value: "mgr-1" } })
    fireEvent.change(screen.getByLabelText("المشروع الحالي"), { target: { value: "proj-1" } })
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "INACTIVE" } })
    clickSaveAll()

    await waitFor(() => expect(mockNavigateToWorkspaceRoute).toHaveBeenCalledWith(mockNavigate, "/employees/emp-np"))
    const payload = mockSaveEmployee.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.status).toBe("INACTIVE")
    expect(payload).not.toHaveProperty("placement")
    expect(payload).not.toHaveProperty("managedProjectIds")
    expect(payload).not.toHaveProperty("managedWarehouseIds")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("clears the save banner when a later submit fails validation", async () => {
    mockSaveEmployee.mockRejectedValue(new Error("تعذر حفظ الدفعة"))
    renderWorker()
    clickSaveAll()

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "" } })
    clickSaveAll()

    await waitFor(() => expect(screen.getByText("الاسم الأول مطلوب.")).toBeTruthy())
    expect(screen.queryByRole("alert")).toBeNull()
    expect(mockSaveEmployee).toHaveBeenCalledTimes(1)
  })

  it("ignores a second submit while the batch is in flight", async () => {
    mockSaveEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderWorker()
    clickSaveAll()
    clickSaveAll()

    await waitFor(() => expect(mockNavigateToWorkspaceRoute).toHaveBeenCalled())
    expect(mockSaveEmployee).toHaveBeenCalledTimes(1)
  })

  it("keeps WEEKLY selectable for a legacy weekly employee after switching the draft period", () => {
    // A legacy WEEKLY row must be able to go back to WEEKLY. Basing the option
    // list on the DRAFT period removed the option the moment the user switched
    // the draft to DAILY, locking them out of their own stored value.
    renderWorker({ ...workerEmployee, salaryPeriod: "WEEKLY" })

    const periodSelect = screen.getByLabelText("دورية الأجر") as HTMLSelectElement
    const weeklyOptionCount = () =>
      Array.from(periodSelect.options).filter((option) => option.value === "WEEKLY").length
    expect(weeklyOptionCount()).toBe(1)

    fireEvent.change(periodSelect, { target: { value: "DAILY" } })
    expect(periodSelect.value).toBe("DAILY")
    expect(weeklyOptionCount()).toBe(1)

    fireEvent.change(periodSelect, { target: { value: "WEEKLY" } })
    expect(periodSelect.value).toBe("WEEKLY")
  })
})
