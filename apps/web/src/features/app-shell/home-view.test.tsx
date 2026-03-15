// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppPreferencesProvider } from "@/features/preferences/preferences"
import { HomeView } from "./home-view"

let sessionData: { user: { id: string; name: string; phone: string } | null } = {
  user: null,
}

let setupStatusData = { hasUsers: true }

const workspaceData = {
  roles: [
    {
      id: "role-worker",
      key: "worker",
      name: "عامل",
      description: "الدور التنفيذي الميداني ضمن فرق المشاريع.",
      isSystem: true,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      id: "role-project-manager",
      key: "project_manager",
      name: "مدير مشروع",
      description: "يشرف على فرق العمل ويقود المشاريع النشطة.",
      isSystem: true,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  employees: [
    {
      id: "employee-manager-1",
      firstName: "أحمد",
      lastName: "بلخير",
      phone: "0555200100",
      roleId: "role-project-manager",
      status: "ACTIVE",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      id: "employee-worker-1",
      firstName: "علي",
      lastName: "بن حميد",
      phone: "0555200120",
      roleId: "role-worker",
      status: "ACTIVE",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  projects: [
    {
      id: "project-1",
      name: "مبنى الإدارة الجديد",
      location: "الجزائر العاصمة",
      managerId: "employee-manager-1",
      status: "ACTIVE",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  warehouses: [
    {
      id: "warehouse-1",
      name: "المستودع الرئيسي",
      address: "الجزائر",
      managerId: null,
      status: "ACTIVE",
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  managerAssignments: [
    {
      id: "manager-assignment-1",
      workerId: "employee-worker-1",
      managerId: "employee-manager-1",
      status: "ACTIVE",
      startDate: "2026-03-13T10:00:00.000Z",
      endDate: null,
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  projectAssignments: [
    {
      id: "project-assignment-1",
      employeeId: "employee-worker-1",
      projectId: "project-1",
      status: "ACTIVE",
      startDate: "2026-03-13T10:00:00.000Z",
      endDate: null,
      notes: null,
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
}

const signInMutate = vi.fn()
const bootstrapMutate = vi.fn()
const signOutMutate = vi.fn()
const addMutate = vi.fn()
const removeMutate = vi.fn()
const resetMutate = vi.fn()

vi.mock("./mock-dashboard", () => ({
  useAuthSetupStatusQuery: () => ({ data: setupStatusData, isLoading: false }),
  useDemoSessionQuery: () => ({ data: sessionData.user }),
  useBootstrapFirstUserMutation: () => ({ isPending: false, mutateAsync: bootstrapMutate }),
  useDemoWorkspaceQuery: () => ({ data: workspaceData }),
  useDemoSignInMutation: () => ({ isPending: false, mutateAsync: signInMutate }),
  useDemoSignOutMutation: () => ({ isPending: false, mutateAsync: signOutMutate }),
  useAddWorkspaceRecordMutation: () => ({ isPending: false, mutate: addMutate }),
  useRemoveWorkspaceRecordMutation: () => ({ isPending: false, mutateAsync: removeMutate }),
  useResetWorkspaceMutation: () => ({ isPending: false, mutateAsync: resetMutate }),
}))

function renderHomeView() {
  return render(
    <AppPreferencesProvider>
      <HomeView />
    </AppPreferencesProvider>,
  )
}

describe("HomeView phase 1 shell", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    sessionData = { user: null }
    setupStatusData = { hasUsers: true }
    signInMutate.mockReset()
    bootstrapMutate.mockReset()
    signOutMutate.mockReset()
    addMutate.mockReset()
    removeMutate.mockReset()
    resetMutate.mockReset()
    document.documentElement.className = ""
    document.documentElement.lang = "ar"
    document.documentElement.dir = "rtl"
    document.documentElement.dataset.theme = "light"
    document.documentElement.dataset.locale = "ar"
  })

  it("boots on the Arabic RTL sign-in screen", () => {
    renderHomeView()

    expect(document.documentElement.lang).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")
    expect(screen.getByLabelText("رقم الهاتف")).toBeTruthy()
    expect(screen.getByRole("button", { name: "دخول إلى مساحة العمل" })).toBeTruthy()
    expect(screen.queryByText("اللغة")).toBeNull()
  })

  it("shows first-user bootstrap when there are no auth users yet", async () => {
    setupStatusData = { hasUsers: false }
    bootstrapMutate.mockResolvedValue({ success: true })
    signInMutate.mockResolvedValue(undefined)

    renderHomeView()

    expect(screen.getByRole("heading", { name: "إنشاء المستخدم الأول" })).toBeTruthy()

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), {
      target: { value: "أحمد بن صالح" },
    })
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0612345678" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب الأول" }))

    await waitFor(() => {
      expect(bootstrapMutate).toHaveBeenCalledWith({
        name: "أحمد بن صالح",
        phone: "0612345678",
        password: "password123",
      })
      expect(signInMutate).toHaveBeenCalledWith({
        phone: "0612345678",
        password: "password123",
        rememberMe: true,
      })
    })
  })

  it("submits the phone and password through the sign-in mutation", async () => {
    signInMutate.mockResolvedValue(undefined)
    renderHomeView()

    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0612345678" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "دخول إلى مساحة العمل" }))

    expect(signInMutate).toHaveBeenCalledWith({
      phone: "0612345678",
      password: "password123",
      rememberMe: true,
    })
  })

  it("rejects phone numbers outside the Algerian mobile format", () => {
    renderHomeView()

    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0212345678" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "دخول إلى مساحة العمل" }))

    expect(signInMutate).not.toHaveBeenCalled()
    expect(screen.getByText("رقم الهاتف يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام.")).toBeTruthy()
  })

  it("shows workers under a manager with one active project inside the shell", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView()

    expect(screen.getByText("مساحة العمل")).toBeTruthy()
    expect(screen.getAllByText("الهيكل المؤسسي").length).toBeGreaterThan(0)
    expect(screen.getAllByText("العاملون").length).toBeGreaterThan(0)
    expect(screen.getByText("علي بن حميد")).toBeTruthy()
    expect(screen.getAllByText("المدير: أحمد بلخير").length).toBeGreaterThan(0)
    expect(screen.getByText("مبنى الإدارة الجديد")).toBeTruthy()
  })

  it("keeps the sidebar toggle inside the sidebar rail and uses confirmation dialogs", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView()

    const sidebar = document.querySelector("aside[data-sidebar-collapsed]")
    expect(sidebar?.getAttribute("data-sidebar-collapsed")).toBe("false")

    fireEvent.click(screen.getByRole("button", { name: "تصغير الشريط الجانبي" }))
    expect(sidebar?.getAttribute("data-sidebar-collapsed")).toBe("true")

    const themeButtons = screen.getAllByRole("button", { name: "تبديل المظهر" })
    fireEvent.click(themeButtons[0]!)
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    expect(screen.queryByText("اللغة")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "تسجيل الخروج" }))
    expect(screen.getByText("تأكيد تسجيل الخروج")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "تأكيد" }))
    expect(signOutMutate).toHaveBeenCalledTimes(1)
  })
})
