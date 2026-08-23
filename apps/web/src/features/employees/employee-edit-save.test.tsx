// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EmployeeEditPage } from "@/features/employees/employee-edit-page"

const {
  mockNavigate,
  mockNavigateToWorkspaceRoute,
  mockUpdateEmployee,
  mockUpdateEmployeeWorkplace,
  mockSyncManagedProjects,
  mockSyncManagedWarehouses,
  mockEmployeesGet,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockNavigateToWorkspaceRoute: vi.fn(),
  mockUpdateEmployee: vi.fn(),
  mockUpdateEmployeeWorkplace: vi.fn(),
  mockSyncManagedProjects: vi.fn(),
  mockSyncManagedWarehouses: vi.fn(),
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
  useUpdateEmployeeMutation: () => ({ isPending: false, mutateAsync: mockUpdateEmployee }),
  useUpdateEmployeeWorkplaceMutation: () => ({ isPending: false, mutateAsync: mockUpdateEmployeeWorkplace }),
  useSyncManagedProjectsMutation: () => ({ isPending: false, mutateAsync: mockSyncManagedProjects }),
  useSyncManagedWarehousesMutation: () => ({ isPending: false, mutateAsync: mockSyncManagedWarehouses }),
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

const workerManagerOptions = [
  { id: "mgr-1", label: "مدير 1", projectOptions: [{ id: "proj-1", label: "مشروع 1" }] },
  { id: "mgr-2", label: "مدير 2", projectOptions: [{ id: "proj-2", label: "مشروع 2" }] },
]

const workerNoPlacementEmployee = {
  ...workerEmployee,
  id: "emp-np",
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

const workerRoles = [{ id: "role-worker", key: "worker", name: "عامل" }]
const pmRoles = [{ id: "role-project-manager", key: "project_manager", name: "مدير مشروع" }]
const warehouseManagerRoles = [{ id: "role-warehouse-manager", key: "warehouse_manager", name: "مدير مستودع" }]

function renderWorkerEditPage() {
  return render(
    <EmployeeEditPage
      currentManagedProjectIds={[]}
      currentManagedWarehouseIds={[]}
      employee={workerEmployee as never}
      managedProjectOptions={[]}
      managedWarehouseOptions={[]}
      managerOptions={workerManagerOptions}
      roles={workerRoles as never}
    />,
  )
}

function renderWorkerNoPlacementEditPage() {
  return render(
    <EmployeeEditPage
      currentManagedProjectIds={[]}
      currentManagedWarehouseIds={[]}
      employee={workerNoPlacementEmployee as never}
      managedProjectOptions={[]}
      managedWarehouseOptions={[]}
      managerOptions={workerManagerOptions}
      roles={workerRoles as never}
    />,
  )
}

function renderWarehouseManagerEditPage() {
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

function renderProjectManagerEditPage() {
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

/** Move a worker from mgr-1/proj-1 to mgr-2/proj-2 and change the first name. */
function changeWorkerPlacementAndName() {
  fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "اسم معدل" } })
  fireEvent.change(screen.getByLabelText("المدير المباشر"), { target: { value: "mgr-2" } })
  fireEvent.change(screen.getByLabelText("المشروع الحالي"), { target: { value: "proj-2" } })
}

function clickSaveAll() {
  fireEvent.click(screen.getByRole("button", { name: "حفظ كل التغييرات" }))
}

const serverProfile = {
  id: "emp-worker",
  firstName: "اسم معدل",
  lastName: "صالح",
  phone: "0555555555",
  roleId: "role-worker",
  roleKey: "worker",
  status: "ACTIVE",
  salaryAmountDzd: 12000,
  salaryPeriod: "MONTHLY",
  notes: null,
  // The `employeesGet` fetch can return fields the user never typed (server
  // normalization / a concurrent edit) — the reconcile must surface them.
  occupation: "عامل بناء جديد",
} as const

afterEach(() => {
  cleanup()
})

describe("employee edit save atomicity (issue #35)", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockNavigateToWorkspaceRoute.mockReset()
    mockUpdateEmployee.mockReset()
    mockUpdateEmployeeWorkplace.mockReset()
    mockSyncManagedProjects.mockReset()
    mockSyncManagedWarehouses.mockReset()
    mockEmployeesGet.mockReset()
  })

  it("navigates to the details route when every step succeeds", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    mockSyncManagedProjects.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderProjectManagerEditPage()

    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سمير جديد" } })
    fireEvent.click(screen.getAllByRole("checkbox")[1]!)

    clickSaveAll()

    await waitFor(() => {
      expect(mockNavigateToWorkspaceRoute).toHaveBeenCalledWith(mockNavigate, "/employees/emp-pm")
    })
    expect(mockSyncManagedProjects).toHaveBeenCalledWith({
      currentIds: ["proj-1"],
      employeeId: "emp-pm",
      nextIds: ["proj-1", "proj-2"],
    })
    expect(mockEmployeesGet).not.toHaveBeenCalled()
  })

  it("reconciles the form to persisted truth when the workplace step fails after the profile persisted", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    mockUpdateEmployeeWorkplace.mockRejectedValue(new Error("تعذر ربط مكان العمل"))
    mockEmployeesGet.mockResolvedValue({ success: true, item: serverProfile, message: "ok" })
    renderWorkerEditPage()

    changeWorkerPlacementAndName()
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("لم تُحفظ كل التغييرات. عُدِّلت الحقول لتعكس آخر حالة محفوظة — راجعها ثم أعد الحفظ.")).toBeTruthy()
    })

    // The workplace write failed -> placement controls restore to the pre-save state.
    expect((screen.getByLabelText("المدير المباشر") as HTMLSelectElement).value).toBe("mgr-1")
    expect((screen.getByLabelText("المشروع الحالي") as HTMLSelectElement).value).toBe("proj-1")
    // The profile write succeeded -> fields reconcile to the FETCHED server truth,
    // including a field the user never typed.
    expect((screen.getByLabelText("المهنة / الدور الوظيفي") as HTMLInputElement).value).toBe("عامل بناء جديد")
    expect(mockEmployeesGet).toHaveBeenCalledWith({ id: "emp-worker" })
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("keeps the persisted placement and restores managed projects when the managed-projects step fails", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    mockSyncManagedProjects.mockRejectedValue(new Error("تعذر مزامنة المشاريع"))
    mockEmployeesGet.mockResolvedValue({
      success: true,
      item: { ...serverProfile, id: "emp-pm", firstName: "سمير جديد", roleId: "role-project-manager" },
      message: "ok",
    })
    renderProjectManagerEditPage()

    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "سمير جديد" } })
    fireEvent.click(screen.getAllByRole("checkbox")[1]!)
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("لم تُحفظ كل التغييرات. عُدِّلت الحقول لتعكس آخر حالة محفوظة — راجعها ثم أعد الحفظ.")).toBeTruthy()
    })

    // The managed-projects write failed -> the scope returns to the pre-save set.
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
    expect(checkboxes[0]!.checked).toBe(true)
    expect(checkboxes[1]!.checked).toBe(false)
    // Profile persisted -> server truth wins.
    expect(screen.getByDisplayValue("سمير جديد")).toBeTruthy()
    expect(mockEmployeesGet).toHaveBeenCalledWith({ id: "emp-pm" })
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("keeps the typed form when the profile step itself fails (nothing persisted)", async () => {
    mockUpdateEmployee.mockRejectedValue(new Error("رقم الهاتف مستخدم"))
    renderWorkerEditPage()

    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "اسم معدل" } })
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("تعذر حفظ التغييرات — لم يُحفظ أي تعديل. تحقق من البيانات ثم أعد المحاولة.")).toBeTruthy()
    })
    expect(screen.getByDisplayValue("اسم معدل")).toBeTruthy()
    expect(mockEmployeesGet).not.toHaveBeenCalled()
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("shows the cannot-fully-restore banner when the reconcile fetch fails after a partial save", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    mockUpdateEmployeeWorkplace.mockRejectedValue(new Error("تعذر ربط مكان العمل"))
    mockEmployeesGet.mockRejectedValue(new Error("شبكة معطلة"))
    renderWorkerEditPage()

    changeWorkerPlacementAndName()
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("حدث خطأ أثناء الحفظ وقد لا تكون بعض التغييرات محفوظة. أعد تحميل الصفحة للتحقق من الحالة الحالية.")).toBeTruthy()
    })

    // Placement still resets to the pre-save truth; the unknown profile state
    // keeps the submitted values and tells the user to reload.
    expect((screen.getByLabelText("المدير المباشر") as HTMLSelectElement).value).toBe("mgr-1")
    expect((screen.getByLabelText("المشروع الحالي") as HTMLSelectElement).value).toBe("proj-1")
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("handles the employeesGet success:false response as an unverified partial save", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    mockUpdateEmployeeWorkplace.mockRejectedValue(new Error("تعذر ربط مكان العمل"))
    mockEmployeesGet.mockResolvedValue({
      success: false,
      error: { code: "NOT_FOUND", message: "غير موجود", fieldErrors: [] },
    })
    renderWorkerEditPage()

    changeWorkerPlacementAndName()
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("حدث خطأ أثناء الحفظ وقد لا تكون بعض التغييرات محفوظة. أعد تحميل الصفحة للتحقق من الحالة الحالية.")).toBeTruthy()
    })
    expect((screen.getByLabelText("المدير المباشر") as HTMLSelectElement).value).toBe("mgr-1")
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("restores the managed warehouse scope when the managed-warehouses step fails", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    mockSyncManagedWarehouses.mockRejectedValue(new Error("تعذر مزامنة المستودعات"))
    mockEmployeesGet.mockResolvedValue({
      success: true,
      item: { ...serverProfile, id: "emp-wh", firstName: "كمال", roleId: "role-warehouse-manager" },
      message: "ok",
    })
    renderWarehouseManagerEditPage()

    fireEvent.click(screen.getAllByRole("checkbox")[1]!)
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("لم تُحفظ كل التغييرات. عُدِّلت الحقول لتعكس آخر حالة محفوظة — راجعها ثم أعد الحفظ.")).toBeTruthy()
    })

    expect(mockSyncManagedWarehouses).toHaveBeenCalledWith({
      currentIds: ["wh-1"],
      employeeId: "emp-wh",
      nextIds: ["wh-1", "wh-2"],
    })
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
    expect(checkboxes[0]!.checked).toBe(true)
    expect(checkboxes[1]!.checked).toBe(false)
    expect(mockNavigateToWorkspaceRoute).not.toHaveBeenCalled()
  })

  it("ignores a second submit while a save is in flight (no interleaved partial saves)", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderWorkerEditPage()

    clickSaveAll()
    clickSaveAll()

    await waitFor(() => {
      expect(mockNavigateToWorkspaceRoute).toHaveBeenCalledWith(mockNavigate, "/employees/emp-worker")
    })
    expect(mockUpdateEmployee).toHaveBeenCalledTimes(1)
  })

  it("silently drops the placement for a non-active worker (issue #20 contract) and navigates", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    renderWorkerNoPlacementEditPage()

    fireEvent.change(screen.getByLabelText("مكان العمل"), { target: { value: "PROJECT" } })
    fireEvent.change(screen.getByLabelText("المدير المباشر"), { target: { value: "mgr-1" } })
    fireEvent.change(screen.getByLabelText("المشروع الحالي"), { target: { value: "proj-1" } })
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "INACTIVE" } })
    clickSaveAll()

    await waitFor(() => {
      expect(mockNavigateToWorkspaceRoute).toHaveBeenCalledWith(mockNavigate, "/employees/emp-np")
    })
    expect(mockUpdateEmployee).toHaveBeenCalledTimes(1)
    expect(mockUpdateEmployeeWorkplace).not.toHaveBeenCalled()
    // No failure banner: the placement drop is expected, not an error.
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("clears the previous save-error banner when a new submit fails validation", async () => {
    mockUpdateEmployee.mockResolvedValue({ success: true, message: "تم الحفظ" })
    mockUpdateEmployeeWorkplace.mockRejectedValue(new Error("تعذر ربط مكان العمل"))
    mockEmployeesGet.mockResolvedValue({ success: true, item: serverProfile, message: "ok" })
    renderWorkerEditPage()

    changeWorkerPlacementAndName()
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("لم تُحفظ كل التغييرات. عُدِّلت الحقول لتعكس آخر حالة محفوظة — راجعها ثم أعد الحفظ.")).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText("الاسم الأول"), { target: { value: "" } })
    clickSaveAll()

    await waitFor(() => {
      expect(screen.getByText("الاسم الأول مطلوب.")).toBeTruthy()
    })
    expect(screen.queryByRole("alert")).toBeNull()
    expect(mockUpdateEmployee).toHaveBeenCalledTimes(1)
  })
})
