// @vitest-environment jsdom

/**
 * Shared test utility module for workspace tests.
 *
 * Hides all mock wiring, test data factories, and render helpers behind
 * a small interface (~5 functions). Imports from this file trigger the
 * hoisted vi.mock() calls that intercept workspace hooks.
 */

import { type Mock, vi } from "vitest"

// Flaky fix: suppress i18next's promotional console.log at module
// evaluation time, which races with vitest RPC teardown on loaded CI
// runners causing EnvironmentTeardownError.
// The spy is restored after module evaluation via restoreConsoleLog().
const { restoreConsoleLog } = vi.hoisted(() => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {})
  return { restoreConsoleLog: () => spy.mockRestore() }
})

import "@/i18n"

import { render, type RenderResult } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

import { AppPreferencesProvider } from "@/features/preferences/preferences"
import { HomeView, type HomeViewPage } from "../home-view"

// ─── Hoisted: navigateMock + AppMutationError must exist before vi.mock factories ───
const { navigateMock, AppMutationError } = vi.hoisted(() => {
  class AppMutationError extends Error {
    fieldErrors: Array<string> = []
  }
  return { navigateMock: vi.fn(), AppMutationError }
})

// ─── Mutable state ───────────────────────────────────────────────
// Module-level mutable variables that vi.mock() factories close over.
// Tests mutate these before calling renderWorkspace() to control
// what the mocked hooks return.  Exported as mockState so that
// importing tests can reassign properties (live ES-module binding).

export const mockState: {
  sessionUser: { id: string; name: string; phone: string } | null
  sessionPending: boolean
  sessionError: Error | null
  setupStatus: { hasUsers: boolean; requiresSetupKey?: boolean } | undefined
  setupPending: boolean
  setupError: Error | null
  workspaceData: Record<string, unknown> | undefined
  workspacePending: boolean
  workspaceError: Error | null
  systemLogData: { items: Array<Record<string, unknown>> }
} = {
  sessionUser: null,
  sessionPending: false,
  sessionError: null,
  setupStatus: { hasUsers: true },
  setupPending: false,
  setupError: null,
  workspaceData: undefined,
  workspacePending: false,
  workspaceError: null,
  systemLogData: {
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
  },
}

// ─── Mock functions ──────────────────────────────────────────────
// Exported via mockFns so tests can set return values / rejections.

export const mockFns = {
  signInMutate: vi.fn(),
  bootstrapMutate: vi.fn(),
  signOutMutate: vi.fn(),
  createEmployeesBatchMutate: vi.fn(),
  updateEmployeeMutate: vi.fn(),
  leaveEmployeeMutate: vi.fn(),
  deleteEmployeeMutate: vi.fn(),
  createProjectMutate: vi.fn(),
  updateProjectMutate: vi.fn(),
  createWarehouseMutate: vi.fn(),
  updateWarehouseMutate: vi.fn(),
  updateEmployeeWorkplaceMutate: vi.fn(),
  syncManagedProjectsMutate: vi.fn(),
  syncManagedWarehousesMutate: vi.fn(),
  createSalaryPaymentMutate: vi.fn(),
  addMutate: vi.fn(),
  removeMutate: vi.fn(),
  resetMutate: vi.fn(),
  updateAccountMutateAsync: vi.fn(),
  workspaceRefetch: vi.fn(),
}

// ─── vi.mock() — 4 module mocks ─────────────────────────────────
// These are hoisted to the top by vitest's transform.  The factory
// closures capture the mutable state and mock functions so that every
// call reads the latest values set by tests.

// Mock react-router: Replace Link with a simple <a>, and useNavigate
// with the test-provided navigateMock.
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<
    typeof import("@tanstack/react-router")
  >("@tanstack/react-router")
  return {
    ...actual,
    Link: ({ children, ...props }: { children: ReactNode }) => (
      <a {...props}>{children}</a>
    ),
    useNavigate: () => navigateMock,
  }
})

vi.mock("../mock-dashboard", () => ({
  useAuthSetupStatusQuery: () => ({
    data: mockState.setupStatus,
    error: mockState.setupError,
    isPending: mockState.setupPending,
    refetch: vi.fn(),
  }),
  useDemoSessionQuery: () => ({
    data: mockState.sessionUser,
    error: mockState.sessionError,
    isPending: mockState.sessionPending,
    refetch: vi.fn(),
  }),
  useBootstrapFirstUserMutation: () => ({ isPending: false, mutateAsync: mockFns.bootstrapMutate }),
  useCompositeWorkspaceQuery: () => ({
    data: mockState.workspaceData,
    isError: Boolean(mockState.workspaceError),
    isPending: mockState.workspacePending,
    refetch: mockFns.workspaceRefetch,
  }),
  useSystemLogQuery: () => ({ data: mockState.systemLogData, error: null, isPending: false }),
  useDemoSignInMutation: () => ({ isPending: false, mutateAsync: mockFns.signInMutate }),
  useDemoSignOutMutation: () => ({ isPending: false, mutateAsync: mockFns.signOutMutate }),
  useCreateEmployeesBatchMutation: () => ({ isPending: false, mutateAsync: mockFns.createEmployeesBatchMutate }),
  useCreateExternalCounterpartyMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateDebtAccountMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateDebtEntryMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useSettleDebtAccountMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useRecordDebtPaymentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVoidDebtEntryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.updateEmployeeMutate }),
  useLeaveEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.leaveEmployeeMutate }),
  useDeleteEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.deleteEmployeeMutate }),
  useCreateProjectMutation: () => ({ isPending: false, mutateAsync: mockFns.createProjectMutate }),
  useUpdateProjectMutation: () => ({ isPending: false, mutateAsync: mockFns.updateProjectMutate }),
  useCreateWarehouseMutation: () => ({ isPending: false, mutateAsync: mockFns.createWarehouseMutate }),
  useUpdateWarehouseMutation: () => ({ isPending: false, mutateAsync: mockFns.updateWarehouseMutate }),
  useUpdateEmployeeWorkplaceMutation: () => ({ isPending: false, mutateAsync: mockFns.updateEmployeeWorkplaceMutate }),
  useSyncManagedProjectsMutation: () => ({ isPending: false, mutateAsync: mockFns.syncManagedProjectsMutate }),
  useSyncManagedWarehousesMutation: () => ({ isPending: false, mutateAsync: mockFns.syncManagedWarehousesMutate }),
  useCreateSalaryPaymentMutation: () => ({
    isPending: false,
    mutate: mockFns.createSalaryPaymentMutate,
    mutateAsync: mockFns.createSalaryPaymentMutate,
  }),
  useAddWorkspaceRecordMutation: () => ({ isPending: false, mutate: mockFns.addMutate }),
  useRemoveWorkspaceRecordMutation: () => ({ isPending: false, mutateAsync: mockFns.removeMutate }),
  useResetWorkspaceMutation: () => ({ isPending: false, mutateAsync: mockFns.resetMutate }),
  useUpdateAccountSettingsMutation: () => ({ isPending: false, mutateAsync: mockFns.updateAccountMutateAsync }),
  AppMutationError,
}))

vi.mock("../workspace-mutations", () => ({
  useCreateWarehouseMutation: () => ({ isPending: false, mutateAsync: mockFns.createWarehouseMutate }),
  useUpdateWarehouseMutation: () => ({ isPending: false, mutateAsync: mockFns.updateWarehouseMutate }),
  useCreateProjectMutation: () => ({ isPending: false, mutateAsync: mockFns.createProjectMutate }),
  useUpdateProjectMutation: () => ({ isPending: false, mutateAsync: mockFns.updateProjectMutate }),
  useCreateEmployeesBatchMutation: () => ({ isPending: false, mutateAsync: mockFns.createEmployeesBatchMutate }),
  useCreateExternalCounterpartyMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.updateEmployeeMutate }),
  useLeaveEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.leaveEmployeeMutate }),
  useDeleteEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.deleteEmployeeMutate }),
  useUpdateEmployeeWorkplaceMutation: () => ({ isPending: false, mutateAsync: mockFns.updateEmployeeWorkplaceMutate }),
  useSyncManagedProjectsMutation: () => ({ isPending: false, mutateAsync: mockFns.syncManagedProjectsMutate }),
  useSyncManagedWarehousesMutation: () => ({ isPending: false, mutateAsync: mockFns.syncManagedWarehousesMutate }),
  useResetWorkspaceMutation: () => ({ isPending: false, mutateAsync: mockFns.resetMutate }),
  useUpdateAccountSettingsMutation: () => ({ isPending: false, mutateAsync: mockFns.updateAccountMutateAsync }),
  useCreateSalaryPaymentMutation: () => ({
    isPending: false,
    mutate: mockFns.createSalaryPaymentMutate,
    mutateAsync: mockFns.createSalaryPaymentMutate,
  }),
  useCreateDebtAccountMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateDebtEntryMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useSettleDebtAccountMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useRecordDebtPaymentMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useVoidDebtEntryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useConsolidateDebtEntriesMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAuthSetupStatusQuery: () => ({
    data: mockState.setupStatus,
    error: mockState.setupError,
    isPending: mockState.setupPending,
    refetch: vi.fn(),
  }),
  useDemoSessionQuery: () => ({
    data: mockState.sessionUser,
    error: mockState.sessionError,
    isPending: mockState.sessionPending,
    refetch: vi.fn(),
  }),
  useDemoSignInMutation: () => ({ isPending: false, mutateAsync: mockFns.signInMutate }),
  useDemoSignOutMutation: () => ({ isPending: false, mutateAsync: mockFns.signOutMutate }),
  useBootstrapFirstUserMutation: () => ({ isPending: false, mutateAsync: mockFns.bootstrapMutate }),
  useCompositeWorkspaceQuery: () => ({
    data: mockState.workspaceData,
    isError: Boolean(mockState.workspaceError),
    isPending: mockState.workspacePending,
    refetch: mockFns.workspaceRefetch,
  }),
  useSystemLogQuery: () => ({ data: mockState.systemLogData, error: null, isPending: false }),
  AppMutationError,
}))

vi.mock("../workspace-queries", () => ({
  // Hooks used by home-view-signed-in-shell (enabled only when search is open)
  useEmployeesQuery: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useProjectsQuery: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useWarehousesQuery: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useDebtAccountsQuery: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useExternalCounterpartiesQuery: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useEmployeesPagedQuery: () => {
    const employees =
      mockState.workspaceData && "employees" in mockState.workspaceData
        ? (mockState.workspaceData.employees as Array<Record<string, unknown>>)
        : []
    return {
      data: {
        items: employees,
        nextCursor: null,
        hasMore: false,
        total: employees.length,
      },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
}))

// ─── Helper: default workspace data ──────────────────────────────
// Matches the WorkspaceSnapshot shape used throughout the test suite.

export function makeWorkspaceData(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
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

  if (overrides) {
    Object.assign(data, overrides)
  }

  return data
}

// Initialize default workspace data
mockState.workspaceData = makeWorkspaceData()

// ─── Public API ─────────────────────────────────────────────────

/**
 * Result type returned by `mockAllMutations()`.
 * Each property is a Vitest Mock function that tests can control.
 */
export interface WorkspaceMocks {
  navigateMock: Mock
  signInMutate: Mock
  bootstrapMutate: Mock
  signOutMutate: Mock
  createEmployeesBatchMutate: Mock
  updateEmployeeMutate: Mock
  leaveEmployeeMutate: Mock
  deleteEmployeeMutate: Mock
  createProjectMutate: Mock
  updateProjectMutate: Mock
  createWarehouseMutate: Mock
  updateWarehouseMutate: Mock
  updateEmployeeWorkplaceMutate: Mock
  syncManagedProjectsMutate: Mock
  syncManagedWarehousesMutate: Mock
  createSalaryPaymentMutate: Mock
  addMutate: Mock
  removeMutate: Mock
  resetMutate: Mock
  updateAccountMutateAsync: Mock
  workspaceRefetch: Mock
}

/**
 * Returns typed references to all mock functions.
 * Call once at the top of your test file after importing the module
 * (the vi.mock() side effects run on import).
 */
export function mockAllMutations(): WorkspaceMocks {
  return {
    navigateMock,
    signInMutate: mockFns.signInMutate,
    bootstrapMutate: mockFns.bootstrapMutate,
    signOutMutate: mockFns.signOutMutate,
    createEmployeesBatchMutate: mockFns.createEmployeesBatchMutate,
    updateEmployeeMutate: mockFns.updateEmployeeMutate,
    leaveEmployeeMutate: mockFns.leaveEmployeeMutate,
    deleteEmployeeMutate: mockFns.deleteEmployeeMutate,
    createProjectMutate: mockFns.createProjectMutate,
    updateProjectMutate: mockFns.updateProjectMutate,
    createWarehouseMutate: mockFns.createWarehouseMutate,
    updateWarehouseMutate: mockFns.updateWarehouseMutate,
    updateEmployeeWorkplaceMutate: mockFns.updateEmployeeWorkplaceMutate,
    syncManagedProjectsMutate: mockFns.syncManagedProjectsMutate,
    syncManagedWarehousesMutate: mockFns.syncManagedWarehousesMutate,
    createSalaryPaymentMutate: mockFns.createSalaryPaymentMutate,
    addMutate: mockFns.addMutate,
    removeMutate: mockFns.removeMutate,
    resetMutate: mockFns.resetMutate,
    updateAccountMutateAsync: mockFns.updateAccountMutateAsync,
    workspaceRefetch: mockFns.workspaceRefetch,
  }
}

/**
 * Resets all mock functions and state to their default values.
 * Call in a `beforeEach` block.
 */
export function resetAllMutations(mocks: WorkspaceMocks): void {
  mockState.sessionUser = null
  mockState.sessionPending = false
  mockState.sessionError = null
  mockState.setupStatus = { hasUsers: true }
  mockState.setupPending = false
  mockState.setupError = null
  mockState.workspaceData = makeWorkspaceData()
  mockState.workspacePending = false
  mockState.workspaceError = null
  mockState.systemLogData = {
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

  for (const key of Object.keys(mocks) as Array<keyof WorkspaceMocks>) {
    mocks[key].mockReset()
  }
}

// Restore console.log after module load so legitimate test logging works.
restoreConsoleLog()

/**
 * Set the session state to a signed-in demo user.
 * Every signed-in test starts with this, then optionally overrides further.
 */
export function setSignedInSession(): void {
  mockState.sessionUser = {
    id: "demo-session-user",
    name: "مدير التشغيل",
    phone: "0612345678",
  }
}

/**
 * Render the HomeView workspace shell with all required providers.
 *
 * @param page - The current workspace page to display.
 * @param options - Optional parameters passed to HomeView.
 */
export function renderWorkspace(
  page: HomeViewPage = "dashboard",
  options?: {
    detailTab?: string
    employeeId?: string
    projectId?: string
    warehouseId?: string
  },
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AppPreferencesProvider>
        <HomeView
          detailTab={options?.detailTab}
          employeeId={options?.employeeId}
          page={page}
          projectId={options?.projectId}
          warehouseId={options?.warehouseId}
        />
      </AppPreferencesProvider>
    </QueryClientProvider>,
  )
}
