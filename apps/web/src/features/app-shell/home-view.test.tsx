// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { AppPreferencesProvider } from "@/features/preferences/preferences"

import { HomeView, type HomeViewPage } from "./home-view"

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}))

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router")

  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
    useNavigate: () => navigateMock,
  }
})

let sessionData: { user: { id: string; name: string; phone: string } | null } = {
  user: null,
}

let sessionQueryPending = false
let sessionQueryError: Error | null = null
let setupStatusData: { hasUsers: boolean; requiresSetupKey?: boolean } | undefined = { hasUsers: true }
let setupStatusPending = false
let setupStatusError: Error | null = null
let workspaceQueryPending = false
let workspaceQueryError: Error | null = null

let workspaceData: typeof initialWorkspaceData | undefined

const initialWorkspaceData = {
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
    {
      id: "role-warehouse-manager",
      key: "warehouse_manager",
      name: "مدير مخزن",
      description: "يدير المستودعات النشطة.",
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
      salaryAmountDzd: 95000,
      salaryPeriod: "MONTHLY",
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
      salaryAmountDzd: 4500,
      salaryPeriod: "DAILY",
      notes: "عامل ميداني",
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
    },
  ],
  externalCounterparties: [],
  debtAccounts: [],
  debtEntries: [],
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
  warehouseAssignments: [],
  employeeStateHistory: [],
  projectManagerOwnershipHistory: [],
  warehouseManagerOwnershipHistory: [],
  salaryPayments: [
    {
      id: "salary-payment-1",
      employeeId: "employee-worker-1",
      paymentDate: "2026-03-18T08:00:00.000Z",
      expectedAmountDzd: 4500,
      actualAmountDzd: 5000,
      periodType: "DAILY",
      note: "دفعة مع زيادة",
      createdAt: "2026-03-18T08:00:00.000Z",
      updatedAt: "2026-03-18T08:00:00.000Z",
    },
  ],
}

const systemLogData = {
  items: [
    {
      id: "log-1",
      transactionId: "550e8400-e29b-41d4-a716-446655440000",
      actorUserId: "user-1",
      actorLabel: "Taylor (0612345678)",
      actionType: "WORKPLACE_ASSIGNED",
      entityType: "PROJECT_ASSIGNMENT",
      entityId: "project-assignment-1",
      entityLabel: "مبنى الإدارة الجديد",
      summary: "تم إسناد علي بن حميد إلى المشروع مبنى الإدارة الجديد",
      detail: "تم ربط العامل علي بن حميد بالمدير أحمد بلخير",
      createdAt: "2026-03-17T10:00:00.000Z",
    },
  ],
}

const signInMutate = vi.fn()
const bootstrapMutate = vi.fn()
const signOutMutate = vi.fn()
const createEmployeesBatchMutate = vi.fn()
const updateEmployeeMutate = vi.fn()
const leaveEmployeeMutate = vi.fn()
const deleteEmployeeMutate = vi.fn()
const createProjectMutate = vi.fn()
const updateProjectMutate = vi.fn()
const createWarehouseMutate = vi.fn()
const updateWarehouseMutate = vi.fn()
const updateEmployeeWorkplaceMutate = vi.fn()
const syncManagedProjectsMutate = vi.fn()
const syncManagedWarehousesMutate = vi.fn()
const createSalaryPaymentMutate = vi.fn()
const addMutate = vi.fn()
const removeMutate = vi.fn()
const resetMutate = vi.fn()
const updateAccountMutateAsync = vi.fn()
const workspaceRefetch = vi.fn()

vi.mock("./mock-dashboard", () => ({
  useAuthSetupStatusQuery: () => ({
    data: setupStatusData,
    error: setupStatusError,
    isPending: setupStatusPending,
    refetch: vi.fn(),
  }),
  useDemoSessionQuery: () => ({
    data: sessionData.user,
    error: sessionQueryError,
    isPending: sessionQueryPending,
    refetch: vi.fn(),
  }),
  useBootstrapFirstUserMutation: () => ({ isPending: false, mutateAsync: bootstrapMutate }),
  useCompositeWorkspaceQuery: () => ({ data: workspaceData, isError: Boolean(workspaceQueryError), isPending: workspaceQueryPending, refetch: workspaceRefetch }),
  useSystemLogQuery: () => ({ data: systemLogData, error: null, isPending: false }),
  useDemoSignInMutation: () => ({ isPending: false, mutateAsync: signInMutate }),
  useDemoSignOutMutation: () => ({ isPending: false, mutateAsync: signOutMutate }),
  useCreateEmployeesBatchMutation: () => ({ isPending: false, mutateAsync: createEmployeesBatchMutate }),
  useCreateExternalCounterpartyMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateDebtAccountMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateDebtEntryMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useSettleDebtAccountMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateEmployeeMutation: () => ({ isPending: false, mutateAsync: updateEmployeeMutate }),
  useLeaveEmployeeMutation: () => ({ isPending: false, mutateAsync: leaveEmployeeMutate }),
  useDeleteEmployeeMutation: () => ({ isPending: false, mutateAsync: deleteEmployeeMutate }),
  useCreateProjectMutation: () => ({ isPending: false, mutateAsync: createProjectMutate }),
  useUpdateProjectMutation: () => ({ isPending: false, mutateAsync: updateProjectMutate }),
  useCreateWarehouseMutation: () => ({ isPending: false, mutateAsync: createWarehouseMutate }),
  useUpdateWarehouseMutation: () => ({ isPending: false, mutateAsync: updateWarehouseMutate }),
  useUpdateEmployeeWorkplaceMutation: () => ({ isPending: false, mutateAsync: updateEmployeeWorkplaceMutate }),
  useSyncManagedProjectsMutation: () => ({ isPending: false, mutateAsync: syncManagedProjectsMutate }),
  useSyncManagedWarehousesMutation: () => ({ isPending: false, mutateAsync: syncManagedWarehousesMutate }),
  useCreateSalaryPaymentMutation: () => ({ isPending: false, mutate: createSalaryPaymentMutate }),
  useAddWorkspaceRecordMutation: () => ({ isPending: false, mutate: addMutate }),
  useRemoveWorkspaceRecordMutation: () => ({ isPending: false, mutateAsync: removeMutate }),
  useResetWorkspaceMutation: () => ({ isPending: false, mutateAsync: resetMutate }),
  useUpdateAccountSettingsMutation: () => ({ isPending: false, mutateAsync: updateAccountMutateAsync }),
  AppMutationError: class AppMutationError extends Error {
    fieldErrors = []
  },
}))

vi.mock("./workspace-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace-queries")>()
  return {
    ...actual,
    useEmployeesPagedQuery: () => ({
      data: workspaceData
        ? { items: workspaceData.employees, nextCursor: null, hasMore: false, total: workspaceData.employees.length }
        : undefined,
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }),
  }
})

function renderHomeView(
  page: HomeViewPage = "dashboard",
  options?: { detailTab?: string; employeeId?: string; projectId?: string; warehouseId?: string },
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppPreferencesProvider>
        <HomeView detailTab={options?.detailTab} employeeId={options?.employeeId} page={page} projectId={options?.projectId} warehouseId={options?.warehouseId} />
      </AppPreferencesProvider>
    </QueryClientProvider>,
  )
}

describe("HomeView workspace shell", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    sessionData = { user: null }
    setupStatusData = { hasUsers: true }
    sessionQueryPending = false
    sessionQueryError = null
    setupStatusPending = false
    setupStatusError = null
    workspaceData = initialWorkspaceData
    workspaceQueryPending = false
    workspaceQueryError = null
    signInMutate.mockReset()
    bootstrapMutate.mockReset()
    signOutMutate.mockReset()
    createEmployeesBatchMutate.mockReset()
    updateEmployeeMutate.mockReset()
    leaveEmployeeMutate.mockReset()
    deleteEmployeeMutate.mockReset()
    createProjectMutate.mockReset()
    updateProjectMutate.mockReset()
    createWarehouseMutate.mockReset()
    updateWarehouseMutate.mockReset()
    updateEmployeeWorkplaceMutate.mockReset()
    syncManagedProjectsMutate.mockReset()
    syncManagedWarehousesMutate.mockReset()
    createSalaryPaymentMutate.mockReset()
    addMutate.mockReset()
    removeMutate.mockReset()
    resetMutate.mockReset()
    updateAccountMutateAsync.mockReset()
    workspaceRefetch.mockReset()
    navigateMock.mockReset()
    window.localStorage.clear()
    document.documentElement.className = ""
    document.documentElement.lang = "ar"
    document.documentElement.dir = "rtl"
  })

  it("boots on the Arabic RTL sign-in screen", () => {
    renderHomeView()

    expect(document.documentElement.lang).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")
    expect(screen.getByLabelText("رقم الهاتف")).toBeTruthy()
    expect(screen.getByRole("button", { name: "دخول إلى مساحة العمل" })).toBeTruthy()
  })

  it("shows first-user bootstrap when there are no auth users yet", async () => {
    setupStatusData = { hasUsers: false }
    bootstrapMutate.mockResolvedValue({ success: true })
    signInMutate.mockResolvedValue(undefined)

    renderHomeView()

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
    })
  })

  it("keeps the auth shell loading until setup status is known", () => {
    setupStatusData = undefined
    setupStatusPending = true

    renderHomeView()

    expect(screen.getByText("جارٍ تحميل بيانات الدخول...")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "دخول إلى مساحة العمل" })).toBeNull()
  })

  it("shows a retry state when auth startup fails", () => {
    setupStatusData = undefined
    setupStatusError = new Error("Timed out while starting the local API.")

    renderHomeView()

    expect(screen.getByRole("heading", { name: "تعذر تحميل شاشة الدخول" })).toBeTruthy()
    expect(screen.getByText("تعذر الوصول إلى الخدمة المحلية. تحقق من اكتمال ملفات التطبيق ثم أعد المحاولة.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy()
  })

  it("shows the sign-in error message inside the form", async () => {
    signInMutate.mockRejectedValue(new Error("رقم الهاتف أو كلمة المرور غير صحيحة."))

    renderHomeView()

    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0612345678" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "دخول إلى مساحة العمل" }))

    await waitFor(() => {
      expect(screen.getByText("رقم الهاتف أو كلمة المرور غير صحيحة.")).toBeTruthy()
    })
  })

  it("shows the bootstrap-specific fallback when first-user setup fails without a server message", async () => {
    setupStatusData = { hasUsers: false }
    bootstrapMutate.mockRejectedValue({})

    renderHomeView()

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
      expect(screen.getByText("تعذر إكمال إعداد المستخدم الأول الآن. أعد المحاولة بعد التحقق من بيانات التهيئة.")).toBeTruthy()
    })
  })

  it("shows a retry state when workspace data settles without payload", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }
    workspaceData = undefined

    renderHomeView("dashboard")

    expect(screen.getByText("تعذر تحميل بيانات مساحة العمل الآن.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))

    expect(workspaceRefetch).toHaveBeenCalledTimes(1)
  })

  it("shows dashboard as a separate page", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("dashboard")

    expect(screen.getByRole("heading", { name: "لوحة التحكم" })).toBeTruthy()
    expect(screen.getByText("العمال النشطون")).toBeTruthy()
    expect(screen.queryByText("أنت هنا الآن")).toBeNull()
  })

  it("shows employees on their own page with clear action buttons", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("employees")

    expect(screen.getByRole("heading", { name: "العاملون" })).toBeTruthy()
    expect(screen.getByText("علي بن حميد")).toBeTruthy()
    expect(screen.queryByText(/^المدير:/)).toBeNull()
    expect(screen.getAllByRole("button", { name: "عرض" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "تعديل" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "إنهاء" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "حذف" }).length).toBeGreaterThan(0)
  })

  it("opens a dedicated employee create page with batch submission", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }
    createEmployeesBatchMutate.mockResolvedValue({ createdCount: 2 })

    renderHomeView("employees-create")

    expect(screen.getByRole("heading", { name: "صفحة إضافة العاملين" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "إضافة عامل آخر" }))
    fireEvent.change(screen.getAllByLabelText("الاسم الأول")[0]!, {
      target: { value: "سمير" },
    })
    fireEvent.change(screen.getAllByLabelText("اللقب")[0]!, {
      target: { value: "بوقرة" },
    })
    fireEvent.change(screen.getAllByLabelText("رقم الهاتف")[0]!, {
      target: { value: "0555123456" },
    })
    fireEvent.change(screen.getAllByLabelText("الدور")[0]!, {
      target: { value: "role-project-manager" },
    })
    fireEvent.change(screen.getAllByPlaceholderText("10000")[0]!, {
      target: { value: "95000" },
    })
    fireEvent.change(screen.getAllByLabelText("دورية الأجر")[0]!, {
      target: { value: "MONTHLY" },
    })

    fireEvent.change(screen.getAllByLabelText("الاسم الأول")[1]!, {
      target: { value: "نجيب" },
    })
    fireEvent.change(screen.getAllByLabelText("اللقب")[1]!, {
      target: { value: "قاسمي" },
    })
    fireEvent.change(screen.getAllByLabelText("رقم الهاتف")[1]!, {
      target: { value: "0666123456" },
    })
    fireEvent.change(screen.getAllByLabelText("الدور")[1]!, {
      target: { value: "role-worker" },
    })
    fireEvent.change(screen.getAllByLabelText("المدير المباشر")[1]!, {
      target: { value: "employee-manager-1" },
    })
    fireEvent.change(screen.getAllByPlaceholderText("10000")[1]!, {
      target: { value: "4500" },
    })
    fireEvent.change(screen.getAllByLabelText("دورية الأجر")[1]!, {
      target: { value: "DAILY" },
    })
    fireEvent.change(screen.getAllByLabelText("المشروع الحالي")[0]!, {
      target: { value: "project-1" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ جميع العمال" }))

    await waitFor(() => {
      expect(createEmployeesBatchMutate).toHaveBeenCalledWith({
        employees: [
          expect.objectContaining({
            firstName: "سمير",
            lastName: "بوقرة",
            phone: "0555123456",
            roleId: "role-project-manager",
            salaryAmountDzd: 95000,
            salaryPeriod: "MONTHLY",
          }),
          expect.objectContaining({
            firstName: "نجيب",
            lastName: "قاسمي",
            phone: "0666123456",
            roleId: "role-worker",
            salaryAmountDzd: 4500,
            salaryPeriod: "DAILY",
            managerId: "employee-manager-1",
            projectId: "project-1",
          }),
        ],
      })
    })
  })

  it("blocks employee batch submission when salary period is selected without an amount", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("employees-create")

    fireEvent.change(screen.getByLabelText("الاسم الأول"), {
      target: { value: "سمير" },
    })
    fireEvent.change(screen.getByLabelText("اللقب"), {
      target: { value: "بوقرة" },
    })
    fireEvent.change(screen.getByLabelText("رقم الهاتف"), {
      target: { value: "0555123456" },
    })
    fireEvent.change(screen.getByLabelText("دورية الأجر"), {
      target: { value: "MONTHLY" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ العامل" }))

    await waitFor(() => {
      expect(screen.getByText("أدخل قيمة الأجر عند اختيار دورية الأجر.")).toBeTruthy()
    })
    expect(createEmployeesBatchMutate).not.toHaveBeenCalled()
  })

  it("renders employee details as a dedicated page with tabs", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("employee-details", { employeeId: "employee-worker-1" })

    expect(await screen.findByText("المعلومات الشخصية")).toBeTruthy()
    expect(screen.getByText("سجل العمل")).toBeTruthy()
    expect(screen.getByRole("tab", { name: "المالية" })).toBeTruthy()
  })

  it("routes back to employees when a requested employee record is missing", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("employee-details", { employeeId: "employee-missing" })

    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/employees",
    })
  })

  it("shows missing project and warehouse record fallbacks with return actions", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    const { unmount } = renderHomeView("project-details", { projectId: "project-missing" })

    expect(screen.getByText("تعذر العثور على هذا السجل أو لم يعد متاحًا ضمن البيانات الحالية.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" })

    navigateMock.mockReset()
    unmount()

    renderHomeView("warehouse-details", { warehouseId: "warehouse-missing" })

    expect(screen.getByText("تعذر العثور على هذا السجل أو لم يعد متاحًا ضمن البيانات الحالية.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "العودة" }))

    expect(navigateMock).toHaveBeenCalledWith({ to: "/warehouses" })
  })

  it("shows no-notes fallback in the employee finance table when a salary payment note is missing", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }
    workspaceData = {
      ...initialWorkspaceData,
      salaryPayments: [
        {
          id: "salary-payment-2",
          employeeId: "employee-worker-1",
          paymentDate: "2026-03-19T08:00:00.000Z",
          expectedAmountDzd: 4500,
          actualAmountDzd: 4500,
          periodType: "DAILY",
          note: null as string | null,
          createdAt: "2026-03-19T08:00:00.000Z",
          updatedAt: "2026-03-19T08:00:00.000Z",
        },
      ],
    } as unknown as typeof initialWorkspaceData

    renderHomeView("employee-details", { detailTab: "finance", employeeId: "employee-worker-1" })

    expect(await screen.findByText("لا توجد ملاحظات.")).toBeTruthy()
  })

  it("submits salary payment form without client-controlled expected amount fields", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("employee-details", { detailTab: "finance", employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "5000" },
    })
    fireEvent.change(screen.getByLabelText("ملاحظات"), {
      target: { value: "دفعة مع زيادة" },
    })
    fireEvent.click(screen.getByRole("button", { name: "حفظ دفعة الراتب" }))

    expect(createSalaryPaymentMutate).toHaveBeenCalledWith({
      employeeId: "employee-worker-1",
      actualAmountDzd: 5000,
      paymentDate: expect.any(String),
      note: "دفعة مع زيادة",
    })
  })

  it("keeps salary payment save disabled when the paid amount is empty", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("employee-details", { detailTab: "finance", employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "إضافة دفعة راتب" }))
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "" },
    })

    expect(screen.getByRole("button", { name: "حفظ دفعة الراتب" }).hasAttribute("disabled")).toBe(true)
  })

  it("renders project details as a dedicated page", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("project-details", { projectId: "project-1" })

    expect(await screen.findByRole("heading", { name: "مبنى الإدارة الجديد" })).toBeTruthy()
    expect(screen.getByText("العمال المرتبطون")).toBeTruthy()
  })

  it("opens a dedicated project create page and navigates to the new record", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }
    createProjectMutate.mockResolvedValue({ item: { id: "project-2" } })

    renderHomeView("project-create")

    expect(await screen.findByRole("heading", { name: "إضافة مشروع" })).toBeTruthy()

    fireEvent.change(screen.getByLabelText("اسم المشروع"), {
      target: { value: "مشروع التوسعة" },
    })
    fireEvent.change(screen.getByLabelText("الموقع"), {
      target: { value: "وهران" },
    })
    fireEvent.change(screen.getByLabelText("المدير المسؤول"), {
      target: { value: "employee-manager-1" },
    })
    fireEvent.change(screen.getByLabelText("ملاحظات"), {
      target: { value: "مرحلة أولى" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ المشروع" }))

    await waitFor(() => {
      expect(createProjectMutate).toHaveBeenCalledWith({
        name: "مشروع التوسعة",
        location: "وهران",
        managerId: "employee-manager-1",
        status: "ACTIVE",
        notes: "مرحلة أولى",
      })
    })
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId",
      params: { projectId: "project-2" },
    })
  })

  it("navigates project add actions to the dedicated create route", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("projects")

    fireEvent.click(screen.getByRole("button", { name: "إضافة مشروع" }))

    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects/create" })
  })

  it("opens a dedicated warehouse create page and navigates to the new record", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }
    createWarehouseMutate.mockResolvedValue({ item: { id: "warehouse-2" } })

    renderHomeView("warehouse-create")

    expect(await screen.findByRole("heading", { name: "إضافة مستودع" })).toBeTruthy()

    fireEvent.change(screen.getByLabelText("اسم المستودع"), {
      target: { value: "مستودع الجنوب" },
    })
    fireEvent.change(screen.getByLabelText("العنوان"), {
      target: { value: "الأغواط" },
    })
    fireEvent.change(screen.getByLabelText("ملاحظات"), {
      target: { value: "قيد التجهيز" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ المستودع" }))

    await waitFor(() => {
      expect(createWarehouseMutate).toHaveBeenCalledWith({
        name: "مستودع الجنوب",
        address: "الأغواط",
        managerId: null,
        status: "ACTIVE",
        notes: "قيد التجهيز",
      })
    })
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/warehouses/$warehouseId",
      params: { warehouseId: "warehouse-2" },
    })
  })

  it("navigates warehouse add actions to the dedicated create route", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("warehouses")

    fireEvent.click(screen.getByRole("button", { name: "إضافة مستودع" }))

    expect(navigateMock).toHaveBeenCalledWith({ to: "/warehouses/create" })
  })

  it("renders the transactions page with grouped log rows", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("transactions")

    expect(screen.getByRole("heading", { name: "سجل المعاملات" })).toBeTruthy()
    expect(screen.getByText("تم إسناد علي بن حميد إلى المشروع مبنى الإدارة الجديد")).toBeTruthy()
  })

  it("renders the salaries page with recent payments and worker shortcuts", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("salaries")

    expect(screen.getByRole("heading", { name: "الرواتب" })).toBeTruthy()
    expect(screen.getAllByText("آخر دفعات الرواتب").length).toBeGreaterThan(0)
    expect(screen.getAllByText("علي بن حميد").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "إضافة دفعة" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "تعديل الأجر" }).length).toBeGreaterThan(0)
  })

  it("navigates from salaries page to the worker edit page", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("salaries")

    // The "إضافة دفعة" (Add Payment) button opens an in-page dialog
    // and does not navigate. The "تعديل الأجر" (Edit Salary) button
    // is the one that navigates to the employee edit page.
    fireEvent.click(screen.getAllByRole("button", { name: "تعديل الأجر" })[0]!)

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/employees/$employeeId/edit",
      params: { employeeId: "employee-worker-1" },
    })
  })

  it("renders account controls on the settings page", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("settings")

    expect(screen.getByText("معلومات الحساب")).toBeTruthy()
    expect(screen.getByText("يلزم إدخال كلمة المرور الحالية عند تغيير رقم الهاتف لأنه يستخدم لتسجيل الدخول.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "حفظ بيانات الحساب" })).toBeTruthy()
  })

  it("submits account settings through the semantic form flow", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }
    updateAccountMutateAsync.mockResolvedValue({ success: true })

    renderHomeView("settings")

    fireEvent.change(screen.getByDisplayValue("مدير التشغيل"), {
      target: { value: "مدير التشغيل الأول" },
    })

    fireEvent.submit(screen.getByRole("button", { name: "حفظ بيانات الحساب" }).closest("form")!)

    await waitFor(() => {
      expect(updateAccountMutateAsync).toHaveBeenCalledWith({
        currentPassword: undefined,
        name: "مدير التشغيل الأول",
        newPassword: undefined,
        phone: undefined,
      })
    })
  })

  it("shows the externals destination in the workspace sidebar", () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("dashboard")
    fireEvent.click(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]!)

    expect(screen.getByText("الجهات الخارجية")).toBeTruthy()
    expect(screen.getByText("الرواتب")).toBeTruthy()
  })

  it("shows worker manager and project controls on the employee edit page", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("employee-edit", { employeeId: "employee-worker-1" })

    expect(await screen.findByText("المدير المباشر")).toBeTruthy()
    expect(screen.getByText("المشروع الحالي")).toBeTruthy()
  })

  it("persists the sidebar collapsed state across route remounts", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    })

    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    const firstRender = renderHomeView("dashboard")

    fireEvent.click(screen.getByRole("button", { name: "تصغير الشريط الجانبي" }))

    expect(window.localStorage.getItem("tuari.workspace.sidebar.collapsed")).toBe("true")

    firstRender.unmount()
    renderHomeView("employees")

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
  })

  it("restores an expanded sidebar from storage instead of collapsing on desktop widths", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    })
    window.localStorage.setItem("tuari.workspace.sidebar.collapsed", "false")

    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("dashboard")

    expect(screen.getByRole("button", { name: "تصغير الشريط الجانبي" })).toBeTruthy()
  })

  it("auto-collapses below 1200px without auto-expanding again", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
      writable: true,
    })

    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }

    renderHomeView("dashboard")

    expect(screen.getByRole("button", { name: "تصغير الشريط الجانبي" })).toBeTruthy()

    window.innerWidth = 1100
    fireEvent(window, new Event("resize"))

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
    expect(window.localStorage.getItem("tuari.workspace.sidebar.collapsed")).toBe("true")

    window.innerWidth = 1400
    fireEvent(window, new Event("resize"))

    expect(screen.getAllByRole("button", { name: "توسيع الشريط الجانبي" })[0]).toBeTruthy()
  })

  it("does not resubmit workplace links when worker placement stays unchanged", async () => {
    sessionData = {
      user: {
        id: "demo-session-user",
        name: "مدير التشغيل",
        phone: "0612345678",
      },
    }
    updateEmployeeMutate.mockResolvedValue({ success: true })
    updateEmployeeWorkplaceMutate.mockResolvedValue({ success: true })

    renderHomeView("employee-edit", { employeeId: "employee-worker-1" })

    fireEvent.click(await screen.findByRole("button", { name: "حفظ كل التغييرات" }))

    await waitFor(() => {
      expect(updateEmployeeMutate).toHaveBeenCalled()
    })

    expect(updateEmployeeWorkplaceMutate).not.toHaveBeenCalled()
  })
})
