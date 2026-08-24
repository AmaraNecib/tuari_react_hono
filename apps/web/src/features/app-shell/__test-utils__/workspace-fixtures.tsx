// @vitest-environment jsdom

/**
 * Shared test utility module for workspace tests.
 *
 * Hides all mock wiring, test data factories, and render helpers behind
 * a small public API (5 helpers + `mockState`/`mockFns` mutable exports).
 * Imports from this file trigger the hoisted vi.mock() calls that
 * intercept workspace hooks.
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
import type { InventoryInvoiceGroupDetail, WorkspaceSnapshot } from "@tuari/contracts"

// ─── Hoisted: navigateMock + AppMutationError must exist before vi.mock factories ───
const { navigateMock, AppMutationError } = vi.hoisted(() => {
  class AppMutationError extends Error {
    fieldErrors: Array<string> = []
  }
  return { navigateMock: vi.fn(), AppMutationError }
})

// ─── Default system log data ───────────────────────────────────────
const defaultSystemLogData: { items: Array<Record<string, unknown>> } = {
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

// ─── Mutable state ───────────────────────────────────────────────
// Module-level mutable variables that vi.mock() factories close over.
// renderWorkspace() applies options onto these before each render.
// Module-private — consumers pass state through renderWorkspace options.

const mockState: {
  sessionUser: { id: string; name: string; phone: string } | null
  sessionPending: boolean
  sessionError: Error | null
  setupStatus: { hasUsers: boolean; requiresSetupKey?: boolean } | undefined
  setupPending: boolean
  setupError: Error | null
  workspaceData: WorkspaceSnapshot | undefined
  workspacePending: boolean
  workspaceError: Error | null
  debtsSummaryError: boolean
  debtsSummaryPending: boolean
  systemLogData: { items: Array<Record<string, unknown>> }
  invoiceGroupDetail: InventoryInvoiceGroupDetail | undefined
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
  debtsSummaryError: false,
  debtsSummaryPending: false,
  systemLogData: defaultSystemLogData,
  invoiceGroupDetail: undefined,
}

// ─── Search query gating state (issue #280) ────────────────────
// Records the `enabled` flag the shell passes to each of the seven
// search-corpus queries. Tests assert the corpus is only fetched while
// the search dialog is open (lazy fetching + lazy Fuse index).

const searchState: {
  employees: boolean | undefined
  projects: boolean | undefined
  warehouses: boolean | undefined
  debts: boolean | undefined
  externals: boolean | undefined
  inventory: boolean | undefined
  invoices: boolean | undefined
} = {
  employees: undefined,
  projects: undefined,
  warehouses: undefined,
  debts: undefined,
  externals: undefined,
  inventory: undefined,
  invoices: undefined,
}

/**
 * Latest `enabled` flags passed to the search-corpus query hooks.
 * `undefined` means the hook has not been called yet.
 */
export function getSearchQueryState() {
  return { ...searchState }
}

// ─── Invoice group query state (issue #30) ───────────────────
// Records the invoiceId the invoice-details page requested from the
// singular inventory invoice-group hook. This is the exact wiring seam
// the routing bug broke: the route param must reach the mounted query.

const invoiceGroupQueryState: {
  invoiceId: string | undefined
  enabled: boolean
} = {
  invoiceId: undefined,
  enabled: false,
}

/** Latest invoiceId requested from useInventoryInvoiceGroupQuery. */
export function getInvoiceGroupQueryState() {
  return { ...invoiceGroupQueryState }
}

/**
 * Detail payload for the created-invoice details view (issue #30).
 * Mirrors what the API returns from inventoryInvoiceGroupsGet.
 */
export function makeInvoiceGroupDetail(): InventoryInvoiceGroupDetail {
  const createdAt = "2026-03-20T10:00:00.000Z"
  return {
    group: {
      id: "invoice-1",
      invoiceNumber: "FAC-2026-001",
      supplierName: "مورد الاختبار",
      invoiceDate: createdAt,
      warehouseId: "warehouse-1",
      projectId: null,
      externalCounterpartyId: null,
      grossTotalDzd: 1500,
      paidAmountDzd: 500,
      remainingDebtDzd: 1000,
      debtAccountId: null,
      note: null,
      createdAt,
      updatedAt: createdAt,
    },
    entries: [
      {
        id: "entry-1",
        invoiceGroupId: "invoice-1",
        itemDefinitionId: "item-def-1",
        warehouseId: "warehouse-1",
        projectId: null,
        itemType: "CONSUMABLE",
        itemName: "أسمنت",
        unit: "كيس",
        quantity: 10,
        unitPriceDzd: 150,
        totalPriceDzd: 1500,
        note: null,
        createdAt,
        updatedAt: createdAt,
        assets: [],
      },
      {
        id: "entry-2",
        invoiceGroupId: "invoice-1",
        itemDefinitionId: "item-def-2",
        warehouseId: null,
        projectId: "project-1",
        itemType: "ASSET",
        itemName: "حاسوب محمول",
        unit: null,
        quantity: 1,
        unitPriceDzd: 80000,
        totalPriceDzd: 80000,
        note: null,
        createdAt,
        updatedAt: createdAt,
        assets: [
          {
            id: "asset-1",
            inventoryEntryId: "entry-2",
            assetName: "حاسوب محمول",
            assetTag: "AST-001",
            serialNumber: null,
            condition: "USED",
            purchaseDate: createdAt,
            purchasePriceDzd: 80000,
            currentWarehouseId: null,
            currentProjectId: "project-1",
            currentLocationLabel: "مشروع المقر الجديد",
            note: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      },
    ],
    attachments: [
      {
        id: "attachment-1",
        invoiceGroupId: "invoice-1",
        originalName: "فاتورة-المورد.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
        storageKey: "storage/attachment-1",
        relativePath: "/api/inventory/attachments/attachment-1",
        downloadUrl: "http://127.0.0.1:4318/api/inventory/attachments/attachment-1",
        sha256: null,
        createdAt,
      },
    ],
    movements: [
      {
        id: "movement-1",
        movementType: "PURCHASE",
        itemType: "CONSUMABLE",
        inventoryEntryId: "entry-1",
        assetUnitId: null,
        quantity: 10,
        fromWarehouseId: null,
        fromProjectId: null,
        toWarehouseId: "warehouse-1",
        toProjectId: null,
        note: null,
        occurredAt: createdAt,
        createdAt,
      },
    ],
    consumableBalances: [
      {
        id: "balance-1",
        inventoryEntryId: "entry-1",
        itemDefinitionId: "item-def-1",
        itemName: "أسمنت",
        warehouseId: "warehouse-1",
        projectId: null,
        quantity: 10,
        locationLabel: "المستودع الرئيسي",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  }
}

// ─── Mock functions ──────────────────────────────────────────────
// Module-internal mock functions. Tests control them via the typed
// mocks object returned by mockAllMutations().

const mockFns = {
  signInMutate: vi.fn(),
  bootstrapMutate: vi.fn(),
  signOutMutate: vi.fn(),
  createEmployeesBatchMutate: vi.fn(),
  saveEmployeeMutate: vi.fn(),
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
  useSaveEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.saveEmployeeMutate }),
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
  useSaveEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.saveEmployeeMutate }),
  useUpdateEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.updateEmployeeMutate }),
  useLeaveEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.leaveEmployeeMutate }),
  useDeleteEmployeeMutation: () => ({ isPending: false, mutateAsync: mockFns.deleteEmployeeMutate }),
  useUpdateEmployeeWorkplaceMutation: () => ({ isPending: false, mutateAsync: mockFns.updateEmployeeWorkplaceMutate }),
  useSyncManagedProjectsMutation: () => ({ isPending: false, mutateAsync: mockFns.syncManagedProjectsMutate }),
  useSyncManagedWarehousesMutation: () => ({ isPending: false, mutateAsync: mockFns.syncManagedWarehousesMutate }),
  useResetWorkspaceMutation: () => ({ isPending: false, mutateAsync: mockFns.resetMutate }),
  useRemoveWorkspaceRecordMutation: () => ({ isPending: false, mutateAsync: mockFns.removeMutate }),
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
  useEmployeesQuery: ({ enabled = true }: { enabled?: boolean } = {}) => {
    searchState.employees = enabled
    const employees =
      mockState.workspaceData && "employees" in mockState.workspaceData
        ? (mockState.workspaceData.employees as Array<Record<string, unknown>>)
        : []
    return { data: { items: employees }, isPending: false, isError: false, refetch: vi.fn() }
  },
  useProjectsQuery: ({ enabled = true }: { enabled?: boolean } = {}) => {
    searchState.projects = enabled
    const projects =
      mockState.workspaceData && "projects" in mockState.workspaceData
        ? (mockState.workspaceData.projects as Array<Record<string, unknown>>)
        : []
    return { data: { items: projects }, isPending: false, isError: false, refetch: vi.fn() }
  },
  useWarehousesQuery: ({ enabled = true }: { enabled?: boolean } = {}) => {
    searchState.warehouses = enabled
    const warehouses =
      mockState.workspaceData && "warehouses" in mockState.workspaceData
        ? (mockState.workspaceData.warehouses as Array<Record<string, unknown>>)
        : []
    return { data: { items: warehouses }, isPending: false, isError: false, refetch: vi.fn() }
  },
  useDebtAccountsQuery: ({ enabled = true }: { enabled?: boolean } = {}) => {
    searchState.debts = enabled
    const debtAccounts =
      mockState.workspaceData && "debtAccounts" in mockState.workspaceData
        ? (mockState.workspaceData.debtAccounts as Array<Record<string, unknown>>)
        : []
    return { data: { items: debtAccounts }, isPending: false, isError: false, refetch: vi.fn() }
  },
  useExternalCounterpartiesQuery: ({ enabled = true }: { enabled?: boolean } = {}) => {
    searchState.externals = enabled
    const externals =
      mockState.workspaceData && "externalCounterparties" in mockState.workspaceData
        ? (mockState.workspaceData.externalCounterparties as Array<Record<string, unknown>>)
        : []
    return { data: { items: externals }, isPending: false, isError: false, refetch: vi.fn() }
  },
  useCompositeWorkspaceQuery: () => ({
    data: mockState.workspaceData,
    isError: Boolean(mockState.workspaceError),
    isPending: mockState.workspacePending,
    refetch: mockFns.workspaceRefetch,
  }),
  useSystemLogQuery: () => ({ data: mockState.systemLogData, error: null, isPending: false }),
  useEmployeesPagedQuery: ({ search }: { search?: string } = {}) => {
    const employees =
      mockState.workspaceData && "employees" in mockState.workspaceData
        ? (mockState.workspaceData.employees as Array<Record<string, unknown>>)
        : []
    const roles =
      mockState.workspaceData && "roles" in mockState.workspaceData
        ? (mockState.workspaceData.roles as Array<Record<string, unknown>>)
        : []
    const roleNameById = new Map(
      roles.map((role) => [String(role.id), String(role.name ?? "")]),
    )
    // Mirror the server-side search (issue #183): case-insensitive substring
    // on first name / last name / phone / role label, over the whole dataset.
    const needle = search?.trim().toLowerCase()
    const items = needle
      ? employees.filter((e) => {
          const firstName = String(e.firstName ?? "")
          const lastName = String(e.lastName ?? "")
          const phone = String(e.phone ?? "")
          const roleName = roleNameById.get(String(e.roleId ?? "")) ?? ""
          return `${firstName} ${lastName} ${phone} ${roleName}`
            .toLowerCase()
            .includes(needle)
        })
      : employees
    return {
      data: {
        items,
        nextCursor: null,
        hasMore: false,
        total: items.length,
      },
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
}))

// Detail pages include inventory panels that own their own queries. Keep the
// workspace fixture fully offline so lazy-loaded project/warehouse pages do
// not race a real RPC request during CI.
vi.mock("@/features/inventory/inventory-hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/inventory/inventory-hooks")>()),
  useInventoryItemDefinitionsQuery: ({ enabled = true }: { enabled?: boolean } = {}) => {
    searchState.inventory = enabled
    return { data: { items: [] }, isPending: false, isError: false }
  },
  useInventoryInvoiceGroupsQuery: ({ enabled = true }: { enabled?: boolean } = {}) => {
    searchState.invoices = enabled
    return { data: { items: [] }, isPending: false, isError: false }
  },
  useInventoryInvoiceGroupQuery: (invoiceId: string | undefined) => {
    invoiceGroupQueryState.invoiceId = invoiceId
    invoiceGroupQueryState.enabled = Boolean(invoiceId)
    return {
      data: invoiceId ? mockState.invoiceGroupDetail : undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }
  },
  useInventoryLocationContentsQuery: () => ({
    data: { balances: [], assets: [] },
    isPending: false,
    isError: false,
  }),
  useInventoryAssetQuery: () => ({ data: undefined, isPending: false, isError: false }),
  useInventoryWarehousesQuery: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useInventoryProjectsQuery: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useInventoryExternalCounterpartiesQuery: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useOutboundTransfersQuery: () => ({ data: { items: [] }, isPending: false, isError: false }),
}))

vi.mock("@/features/inventory/transfer-history-hooks", () => ({
  useTransferHistoryQuery: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useLocationTransferHistoryQuery: () => ({
    data: { items: [] },
    isPending: false,
    isError: false,
  }),
}))

// Debts pages own their data via feature-scoped queries. Keep the workspace
// fixture fully offline so debts routes never race a real RPC request.
vi.mock("@/features/debts/debts-queries", () => ({
  useDebtsSummaryQuery: () => ({
    data: { parties: [], debtAccounts: [] },
    isPending: mockState.debtsSummaryPending,
    isError: mockState.debtsSummaryError,
  }),
  useDebtPartyDetailQuery: () => ({
    data: undefined,
    isPending: mockState.debtsSummaryPending,
    isError: mockState.debtsSummaryError,
  }),
  buildDebtsHubRows: () => ({
    rows: [],
    totals: { openCount: 0, owedByUsDzd: 0, owedToUsDzd: 0 },
  }),
  buildExternalCounterpartyRows: () => [],
}))

// ─── Helper: default workspace data ──────────────────────────────
// Matches the WorkspaceSnapshot shape used throughout the test suite.

export function makeWorkspaceData(
  overrides?: Partial<WorkspaceSnapshot>,
): WorkspaceSnapshot {
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
        occupation: null,
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
        occupation: "عامل بناء",
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

  return data as WorkspaceSnapshot
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
  saveEmployeeMutate: Mock
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
    saveEmployeeMutate: mockFns.saveEmployeeMutate,
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
  mockState.debtsSummaryError = false
  mockState.debtsSummaryPending = false
  mockState.systemLogData = { ...defaultSystemLogData, items: [...defaultSystemLogData.items] }
  mockState.invoiceGroupDetail = undefined

  searchState.employees = undefined
  searchState.projects = undefined
  searchState.warehouses = undefined
  searchState.debts = undefined
  searchState.externals = undefined
  searchState.inventory = undefined
  searchState.invoices = undefined
  invoiceGroupQueryState.invoiceId = undefined
  invoiceGroupQueryState.enabled = false

  for (const key of Object.keys(mocks) as Array<keyof WorkspaceMocks>) {
    mocks[key].mockReset()
  }
}

// Restore console.log after module load so legitimate test logging works.
restoreConsoleLog()

/**
 * A pre-built demo user object for signed-in session state.
 */
export const demoUser = {
  id: "demo-session-user" as const,
  name: "مدير التشغيل" as const,
  phone: "0612345678" as const,
}

/**
 * Render the HomeView workspace shell with all required providers.
 *
 * Every aspect of the workspace shell's behaviour is controlled through
 * the options parameter — session state, setup status, workspace data,
 * error conditions, and page routing.  Sensible defaults are applied
 * for anything not specified, and all mock state is reset before each
 * render so callers never need to worry about cross-test pollution.
 *
 * @param page - The current workspace page to display.
 * @param options - Workspace state overrides, error conditions, and page routing.
 */
export function renderWorkspace(
  page: HomeViewPage = "dashboard",
  options?: {
    /** Signed-in user, or null/undefined for unauthenticated state. */
    sessionUser?: { id: string; name: string; phone: string } | null
    /** Setup status for first-user bootstrap flow. */
    setupStatus?: { hasUsers: boolean; requiresSetupKey?: boolean } | undefined
    /** True while setup-status query is in flight. */
    setupPending?: boolean
    /** Error to simulate a setup-status query failure. */
    setupError?: Error | null
    /** True to simulate the feature-scoped debts summary query failing. */
    debtsSummaryError?: boolean
    /** True to simulate the feature-scoped debts summary query loading. */
    debtsSummaryPending?: boolean
    /** Full workspace data override. */
    workspaceData?: WorkspaceSnapshot | undefined
    /** Detail tab within a detail page (e.g. "finance"). */
    detailTab?: string
    /** Currently viewed employee id. */
    employeeId?: string
    /** Currently viewed invoice id. */
    invoiceId?: string
    /** Currently viewed project id. */
    projectId?: string
    /** Currently viewed warehouse id. */
    warehouseId?: string
    /** Detail payload returned by the inventory invoice group query. */
    invoiceGroupDetail?: InventoryInvoiceGroupDetail | undefined
  },
): RenderResult {
  // Apply all state options before rendering.
  // We use an explicit "in" check so that passing `undefined` for a field
  // is distinguishable from omitting it entirely.
  const opts = options ?? {}
  mockState.sessionUser = "sessionUser" in opts ? opts.sessionUser ?? null : null
  mockState.setupStatus = "setupStatus" in opts ? opts.setupStatus : { hasUsers: true }
  mockState.setupPending = "setupPending" in opts ? opts.setupPending! : false
  mockState.setupError = "setupError" in opts ? opts.setupError ?? null : null
  mockState.workspaceData = "workspaceData" in opts ? opts.workspaceData : makeWorkspaceData()
  mockState.debtsSummaryError = "debtsSummaryError" in opts ? opts.debtsSummaryError! : false
  mockState.debtsSummaryPending = "debtsSummaryPending" in opts ? opts.debtsSummaryPending! : false
  mockState.invoiceGroupDetail = "invoiceGroupDetail" in opts ? opts.invoiceGroupDetail : undefined
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
          invoiceId={options?.invoiceId}
          page={page}
          projectId={options?.projectId}
          warehouseId={options?.warehouseId}
        />
      </AppPreferencesProvider>
    </QueryClientProvider>,
  )
}
