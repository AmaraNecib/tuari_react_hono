// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EmployeeEditPage } from "@/features/employees/employee-edit-page"
import { ProjectEditPage } from "@/features/projects/project-edit-page"
import { WarehouseEditPage } from "@/features/warehouses/warehouse-edit-page"

const mockNavigate = vi.fn()
const mockSaveEmployee = vi.fn().mockResolvedValue(undefined)
const mockUpdateEmployee = vi.fn().mockResolvedValue(undefined)
const mockUpdateEmployeeWorkplace = vi.fn().mockResolvedValue(undefined)
const mockSyncManagedProjects = vi.fn().mockResolvedValue(undefined)
const mockSyncManagedWarehouses = vi.fn().mockResolvedValue(undefined)
const mockUpdateProject = vi.fn().mockResolvedValue(undefined)
const mockUpdateWarehouse = vi.fn().mockResolvedValue(undefined)

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock("@/router/navigation", () => ({
  navigateToWorkspaceRoute: vi.fn(),
  workspaceRoutes: {
    employeeDetails: (id: string) => `/employees/${id}`,
    employees: () => "/employees",
    projectDetails: (id: string) => `/projects/${id}`,
    projects: () => "/projects",
    warehouseDetails: (id: string) => `/warehouses/${id}`,
    warehouses: () => "/warehouses",
  },
}))

vi.mock("@/features/app-shell/mock-dashboard", () => ({
  useSaveEmployeeMutation: () => ({ isPending: false, mutateAsync: mockSaveEmployee }),
  useCreateEmployeesBatchMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateEmployeeMutation: () => ({ isPending: false, mutateAsync: mockUpdateEmployee }),
  useUpdateEmployeeWorkplaceMutation: () => ({ isPending: false, mutateAsync: mockUpdateEmployeeWorkplace }),
  useSyncManagedProjectsMutation: () => ({ isPending: false, mutateAsync: mockSyncManagedProjects }),
  useSyncManagedWarehousesMutation: () => ({ isPending: false, mutateAsync: mockSyncManagedWarehouses }),
  useUpdateProjectMutation: () => ({ isPending: false, mutateAsync: mockUpdateProject }),
  useUpdateWarehouseMutation: () => ({ isPending: false, mutateAsync: mockUpdateWarehouse }),
}))

afterEach(() => {
  cleanup()
})

describe("edit pages resync when record props change", () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockSaveEmployee.mockClear()
    mockUpdateEmployee.mockClear()
    mockUpdateEmployeeWorkplace.mockClear()
    mockSyncManagedProjects.mockClear()
    mockSyncManagedWarehouses.mockClear()
    mockUpdateProject.mockClear()
    mockUpdateWarehouse.mockClear()
  })

  it("keeps employee dirty form state on rerender with same employee id", () => {
    const employee = {
      id: "emp-1",
      firstName: "أحمد",
      lastName: "صالح",
      name: "أحمد صالح",
      phone: "0555555555",
      roleId: "role-project-manager",
      roleKey: "project_manager",
      role: "مدير مشروع",
      status: "ACTIVE",
      salaryAmountDzd: 12000,
      salaryPeriod: "MONTHLY",
      notes: "ملاحظة أولى",
      currentManagerId: null,
      currentManagerName: null,
      currentProjectId: null,
      currentWarehouseId: null,
      currentWorkplace: null,
    } as const

    const { rerender } = render(
      <EmployeeEditPage
        currentManagedProjectIds={["proj-1"]}
        currentManagedWarehouseIds={[]}
        employee={employee as never}
        managedProjectOptions={[
          { id: "proj-1", label: "مشروع 1", secondary: "الجزائر" },
          { id: "proj-2", label: "مشروع 2", secondary: "وهران" },
        ]}
        managedWarehouseOptions={[]}
        managerOptions={[]}
        roles={[{ id: "role-project-manager", key: "project_manager", name: "مدير مشروع" } as never]}
      />,
    )

    fireEvent.change(screen.getByDisplayValue("أحمد"), { target: { value: "اسم معدل" } })
    const projectCheckboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
    expect(projectCheckboxes).toHaveLength(2)
    fireEvent.click(projectCheckboxes[1]!)

    rerender(
      <EmployeeEditPage
        currentManagedProjectIds={["proj-1"]}
        currentManagedWarehouseIds={[]}
        employee={{ ...employee, notes: "ملاحظة أولى" } as never}
        managedProjectOptions={[
          { id: "proj-1", label: "مشروع 1", secondary: "الجزائر" },
          { id: "proj-2", label: "مشروع 2", secondary: "وهران" },
        ]}
        managedWarehouseOptions={[]}
        managerOptions={[]}
        roles={[{ id: "role-project-manager", key: "project_manager", name: "مدير مشروع" } as never]}
      />,
    )

    expect(screen.getByDisplayValue("اسم معدل")).toBeTruthy()
    const rerenderedProjectCheckboxes = screen.getAllByRole("checkbox") as HTMLInputElement[]
    expect(rerenderedProjectCheckboxes).toHaveLength(2)
    expect(rerenderedProjectCheckboxes[0]!.checked).toBe(true)
    expect(rerenderedProjectCheckboxes[1]!.checked).toBe(true)
  })

  it("resets employee edit form state for a new employee", () => {
    const firstEmployee = {
      id: "emp-1",
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
      notes: "ملاحظة أولى",
      currentManagerId: "mgr-1",
      currentManagerName: "مدير 1",
      currentProjectId: "proj-1",
      currentWarehouseId: null,
      currentWorkplace: "مشروع 1",
    } as const
    const secondEmployee = {
      ...firstEmployee,
      id: "emp-2",
      firstName: "سمير",
      lastName: "بوعلام",
      name: "سمير بوعلام",
      phone: "0666666666",
      notes: "ملاحظة ثانية",
      currentManagerId: "mgr-2",
      currentProjectId: "proj-2",
    }

    const { rerender } = render(
      <EmployeeEditPage
        currentManagedProjectIds={[]}
        currentManagedWarehouseIds={[]}
        employee={firstEmployee as never}
        managedProjectOptions={[]}
        managedWarehouseOptions={[]}
        managerOptions={[
          { id: "mgr-1", label: "مدير 1", projectOptions: [{ id: "proj-1", label: "مشروع 1" }] },
          { id: "mgr-2", label: "مدير 2", projectOptions: [{ id: "proj-2", label: "مشروع 2" }] },
        ]}
        roles={[{ id: "role-worker", key: "worker", name: "عامل" } as never]}
      />,
    )

    fireEvent.change(screen.getByDisplayValue("أحمد"), { target: { value: "تم تعديل الاسم" } })
    fireEvent.change(screen.getByDisplayValue("ملاحظة أولى"), { target: { value: "تم تعديل الملاحظات" } })

    rerender(
      <EmployeeEditPage
        currentManagedProjectIds={[]}
        currentManagedWarehouseIds={[]}
        employee={secondEmployee as never}
        managedProjectOptions={[]}
        managedWarehouseOptions={[]}
        managerOptions={[
          { id: "mgr-1", label: "مدير 1", projectOptions: [{ id: "proj-1", label: "مشروع 1" }] },
          { id: "mgr-2", label: "مدير 2", projectOptions: [{ id: "proj-2", label: "مشروع 2" }] },
        ]}
        roles={[{ id: "role-worker", key: "worker", name: "عامل" } as never]}
      />,
    )

    expect(screen.getByDisplayValue("سمير")).toBeTruthy()
    expect(screen.getByDisplayValue("بوعلام")).toBeTruthy()
    expect(screen.getByDisplayValue("0666666666")).toBeTruthy()
    expect(screen.getByDisplayValue("ملاحظة ثانية")).toBeTruthy()
  })

  it("keeps project dirty form state on rerender with same project id", () => {
    const project = {
      id: "project-1",
      name: "مشروع أول",
      location: "الجزائر",
      managerId: "mgr-1",
      managerName: "مدير 1",
      activeWorkers: 4,
      status: "ACTIVE",
      notes: "ملاحظات أولى",
    } as const

    const { rerender } = render(
      <ProjectEditPage managerOptions={[{ id: "mgr-1", label: "مدير 1" }]} project={project} projectManagerRoleId="role-pm" />,
    )

    fireEvent.change(screen.getByDisplayValue("مشروع أول"), { target: { value: "اسم معدل" } })

    rerender(
      <ProjectEditPage
        managerOptions={[{ id: "mgr-1", label: "مدير 1" }]}
        project={{ ...project, notes: "ملاحظات أولى" }}
        projectManagerRoleId="role-pm"
      />,
    )

    expect(screen.getByDisplayValue("اسم معدل")).toBeTruthy()
  })

  it("resets project edit form state for a new project", () => {
    const { rerender } = render(
      <ProjectEditPage
        managerOptions={[{ id: "mgr-1", label: "مدير 1" }]}
        project={{
          id: "project-1",
          name: "مشروع أول",
          location: "الجزائر",
          managerId: "mgr-1",
          managerName: "مدير 1",
          activeWorkers: 4,
          status: "ACTIVE",
          notes: "ملاحظات أولى",
        }}
        projectManagerRoleId="role-pm"
      />,
    )

    fireEvent.change(screen.getByDisplayValue("مشروع أول"), { target: { value: "اسم معدل" } })

    rerender(
      <ProjectEditPage
        managerOptions={[{ id: "mgr-2", label: "مدير 2" }]}
        project={{
          id: "project-2",
          name: "مشروع ثان",
          location: "وهران",
          managerId: "mgr-2",
          managerName: "مدير 2",
          activeWorkers: 7,
          status: "STOPPED",
          notes: "ملاحظات ثانية",
        }}
        projectManagerRoleId="role-pm"
      />,
    )

    expect(screen.getByDisplayValue("مشروع ثان")).toBeTruthy()
    expect(screen.getByDisplayValue("وهران")).toBeTruthy()
    expect(screen.getByDisplayValue("ملاحظات ثانية")).toBeTruthy()
  })

  it("keeps warehouse dirty form state on rerender with same warehouse id", () => {
    const warehouse = {
      id: "warehouse-1",
      name: "مستودع أول",
      address: "الرويبة",
      managerId: "mgr-1",
      managerName: "مدير 1",
      status: "ACTIVE",
      notes: "ملاحظات أولى",
    } as const

    const { rerender } = render(
      <WarehouseEditPage managerOptions={[{ id: "mgr-1", label: "مدير 1" }]} warehouse={warehouse} />,
    )

    fireEvent.change(screen.getByDisplayValue("مستودع أول"), { target: { value: "اسم معدل" } })

    rerender(
      <WarehouseEditPage
        managerOptions={[{ id: "mgr-1", label: "مدير 1" }]}
        warehouse={{ ...warehouse, notes: "ملاحظات أولى" }}
      />,
    )

    expect(screen.getByDisplayValue("اسم معدل")).toBeTruthy()
  })

  it("resets warehouse edit form state for a new warehouse", () => {
    const { rerender } = render(
      <WarehouseEditPage
        managerOptions={[{ id: "mgr-1", label: "مدير 1" }]}
        warehouse={{
          id: "warehouse-1",
          name: "مستودع أول",
          address: "الرويبة",
          managerId: "mgr-1",
          managerName: "مدير 1",
          status: "ACTIVE",
          notes: "ملاحظات أولى",
        }}
      />,
    )

    fireEvent.change(screen.getByDisplayValue("مستودع أول"), { target: { value: "اسم معدل" } })

    rerender(
      <WarehouseEditPage
        managerOptions={[{ id: "mgr-2", label: "مدير 2" }]}
        warehouse={{
          id: "warehouse-2",
          name: "مستودع ثان",
          address: "سطاوالي",
          managerId: "mgr-2",
          managerName: "مدير 2",
          status: "INACTIVE",
          notes: "ملاحظات ثانية",
        }}
      />,
    )

    expect(screen.getByDisplayValue("مستودع ثان")).toBeTruthy()
    expect(screen.getByDisplayValue("سطاوالي")).toBeTruthy()
    expect(screen.getByDisplayValue("ملاحظات ثانية")).toBeTruthy()
  })

  it("sends the occupation field on save and rejects >120 chars", async () => {
    const employee = {
      id: "emp-occupation",
      firstName: "علي",
      lastName: "بن حميد",
      name: "علي بن حميد",
      phone: "0555555555",
      roleId: "role-worker",
      roleKey: "worker",
      role: "عامل",
      status: "ACTIVE",
      salaryAmountDzd: 4500,
      salaryPeriod: "DAILY",
      notes: null,
      occupation: null,
      currentManagerId: "mgr-1",
      currentManagerName: "مدير 1",
      currentProjectId: "proj-1",
      currentWarehouseId: null,
      currentWorkplace: "مشروع 1",
    } as const

    const { rerender } = render(
      <EmployeeEditPage
        currentManagedProjectIds={[]}
        currentManagedWarehouseIds={[]}
        employee={employee as never}
        managedProjectOptions={[]}
        managedWarehouseOptions={[]}
        managerOptions={[{ id: "mgr-1", label: "مدير 1", projectOptions: [{ id: "proj-1", label: "مشروع 1" }] }]}
        roles={[{ id: "role-worker", key: "worker", name: "عامل" } as never]}
      />,
    )

    fireEvent.change(screen.getByLabelText("المهنة / الدور الوظيفي"), {
      target: { value: "عامل بناء" },
    })
    fireEvent.click(screen.getByRole("button", { name: "حفظ كل التغييرات" }))

    await waitFor(() => {
      expect(mockSaveEmployee).toHaveBeenCalledWith(
        expect.objectContaining({ id: "emp-occupation", occupation: "عامل بناء" }),
      )
    })

    mockSaveEmployee.mockClear()

    rerender(
      <EmployeeEditPage
        currentManagedProjectIds={[]}
        currentManagedWarehouseIds={[]}
        employee={{ ...employee, occupation: null } as never}
        managedProjectOptions={[]}
        managedWarehouseOptions={[]}
        managerOptions={[{ id: "mgr-1", label: "مدير 1", projectOptions: [{ id: "proj-1", label: "مشروع 1" }] }]}
        roles={[{ id: "role-worker", key: "worker", name: "عامل" } as never]}
      />,
    )

    fireEvent.change(screen.getByLabelText("المهنة / الدور الوظيفي"), {
      target: { value: "م".repeat(121) },
    })
    fireEvent.click(screen.getByRole("button", { name: "حفظ كل التغييرات" }))

    expect(screen.getByText("المهنة يجب ألا تتجاوز 120 حرفًا.")).toBeTruthy()
    expect(mockSaveEmployee).not.toHaveBeenCalled()
  })
})
