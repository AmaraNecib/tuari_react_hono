import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type {
  DebtAccount,
  Employee,
  EmployeeManagerAssignment,
  EmployeeProjectAssignment,
  EmployeeSalaryPayment,
  EmployeeStateHistory,
  EmployeeWarehouseAssignment,
  ExternalCounterparty,
  InventoryInvoiceGroup,
  InventoryItemDefinition,
  Project,
  ProjectManagerOwnershipHistory,
  RoleWithPermissions,
  SystemLogEntry,
  Warehouse,
  WarehouseManagerOwnershipHistory,
  WorkspaceSnapshot,
} from "@tuari/contracts"

import { useSessionQuery } from "@/features/session/use-session-query"
import { rpcClient } from "@/lib/orpc-client"
import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

export type DemoWorkspace = WorkspaceSnapshot

export const workspaceQueryPrefix = ["phase1", "workspace"] as const
export const workspaceDomainQueryPrefix = ["phase1", "workspace-domain"] as const

export const demoWorkspaceQueryKey = (userId: string | null = "anonymous") =>
  ["phase1", "workspace", userId] as const

export const workspaceDomainQueryKeys = {
  employees: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "employees", userId] as const,
  projects: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "projects", userId] as const,
  warehouses: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "warehouses", userId] as const,
  debtsSummary: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "debts-summary", userId] as const,
  debtsDetail: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "debts-detail", userId] as const,
  inventory: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "inventory", userId] as const,
  systemLog: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "system-log", userId] as const,
  roles: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "roles", userId] as const,
  managerAssignments: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "manager-assignments", userId] as const,
  projectAssignments: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "project-assignments", userId] as const,
  warehouseAssignments: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "warehouse-assignments", userId] as const,
  salaryPayments: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "salary-payments", userId] as const,
  externalCounterparties: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "external-counterparties", userId] as const,
  debtAccounts: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "debt-accounts", userId] as const,
  inventoryItems: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "inventory-items", userId] as const,
  inventoryInvoices: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "inventory-invoices", userId] as const,
  employeeStateHistory: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "employee-state-history", userId] as const,
  projectManagerOwnership: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "project-manager-ownership", userId] as const,
  warehouseManagerOwnership: (userId: string | null = "anonymous") => ["phase1", "workspace-domain", "warehouse-manager-ownership", userId] as const,
} as const

export function useRolesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.roles(userId),
    // Use the rbacRolesList endpoint (Issue #10) which returns the full
    // role + permissions shape the management UI needs. Falls back to
    // the legacy `rolesList` (no permissions) if the new endpoint is
    // unavailable on a stale client/server mismatch — the UI degrades
    // gracefully to a permission-less view.
    queryFn: async (): Promise<{ items: RoleWithPermissions[] }> => {
      try {
        const response = await rpcClient.rbacRolesList();
        return { items: response.items as RoleWithPermissions[] };
      } catch {
        const fallback = await rpcClient.rolesList();
        return {
          items: fallback.items.map((role) => ({
            ...role,
            permissions: [] as RoleWithPermissions["permissions"],
          })),
        };
      }
    },
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useEmployeesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.employees(userId),
    queryFn: async (): Promise<{ items: Employee[] }> => rpcClient.employeesList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

/**
 * Cursor-paginated employees query.
 *
 * Returns the first page when no cursor is given, then walks forward by
 * passing the previous response's `nextCursor` back as the `cursor` arg.
 * The `hasMore` flag is a convenience — equivalent to `nextCursor !== null`.
 */
export function useEmployeesPagedQuery({
  cursor,
  limit = 50,
  status,
  roleId,
  enabled = true,
}: {
  cursor?: string
  limit?: number
  status?: Employee["status"]
  roleId?: string
  enabled?: boolean
} = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: [...workspaceDomainQueryKeys.employees(userId), "paged", { cursor, limit, status, roleId }],
    queryFn: async () => rpcClient.employeesListPaged({
      cursor,
      limit,
      status,
      roleId,
    }),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
    placeholderData: keepPreviousData,
  })
}

export function useProjectsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.projects(userId),
    queryFn: async (): Promise<{ items: Project[] }> => rpcClient.projectsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useWarehousesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.warehouses(userId),
    queryFn: async (): Promise<{ items: Warehouse[] }> => rpcClient.warehousesList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useDebtAccountsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.debtAccounts(userId),
    queryFn: async (): Promise<{ items: DebtAccount[] }> => rpcClient.debtAccountsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useExternalCounterpartiesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.externalCounterparties(userId),
    queryFn: async (): Promise<{ items: ExternalCounterparty[] }> => rpcClient.externalCounterpartiesList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useDebtsSummaryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.debtsSummary(userId),
    queryFn: async () => rpcClient.debtsSummary(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useManagerAssignmentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.managerAssignments(userId),
    queryFn: async (): Promise<{ items: EmployeeManagerAssignment[] }> => rpcClient.managerAssignmentsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useProjectAssignmentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.projectAssignments(userId),
    queryFn: async (): Promise<{ items: EmployeeProjectAssignment[] }> => rpcClient.projectAssignmentsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useWarehouseAssignmentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.warehouseAssignments(userId),
    queryFn: async (): Promise<{ items: EmployeeWarehouseAssignment[] }> => rpcClient.warehouseAssignmentsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useSalaryPaymentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.salaryPayments(userId),
    queryFn: async (): Promise<{ items: EmployeeSalaryPayment[] }> => rpcClient.salaryPaymentsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useInventoryItemDefinitionsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.inventoryItems(userId),
    queryFn: async (): Promise<{ items: InventoryItemDefinition[] }> => rpcClient.inventoryItemDefinitionsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useInventoryInvoiceGroupsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.inventoryInvoices(userId),
    queryFn: async (): Promise<{ items: InventoryInvoiceGroup[] }> => rpcClient.inventoryInvoiceGroupsList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useEmployeeStateHistoryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.employeeStateHistory(userId),
    queryFn: async (): Promise<{ items: EmployeeStateHistory[] }> => rpcClient.employeeStateHistoryList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useProjectManagerOwnershipHistoryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.projectManagerOwnership(userId),
    queryFn: async (): Promise<{ items: ProjectManagerOwnershipHistory[] }> => rpcClient.projectManagerOwnershipHistoryList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useWarehouseManagerOwnershipHistoryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: workspaceDomainQueryKeys.warehouseManagerOwnership(userId),
    queryFn: async (): Promise<{ items: WarehouseManagerOwnershipHistory[] }> => rpcClient.warehouseManagerOwnershipHistoryList(),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useSystemLogQuery({
  enabled = true,
  filters,
}: {
  enabled?: boolean
  filters?: {
    actionType?: SystemLogEntry["actionType"]
    actorQuery?: string
    actorUserId?: string
    entityType?: SystemLogEntry["entityType"]
    fromDate?: string
    toDate?: string
  }
} = {}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery({
    queryKey: [...workspaceDomainQueryKeys.systemLog(userId), filters],
    queryFn: async (): Promise<{ items: SystemLogEntry[] }> =>
      rpcClient.systemLogList(
        filters
          ? {
              actionType: filters.actionType,
              actorUserId: filters.actorUserId,
              entityType: filters.entityType,
              fromDate: filters.fromDate ? toAlgeriaDayBoundaryIso(filters.fromDate, "start") : undefined,
              toDate: filters.toDate ? toAlgeriaDayBoundaryIso(filters.toDate, "end") : undefined,
            }
          : undefined,
      ),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useCompositeWorkspaceQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const sessionQuery = useSessionQuery()
  const rolesQuery = useRolesQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const employeesQuery = useEmployeesQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const projectsQuery = useProjectsQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const warehousesQuery = useWarehousesQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const debtAccountsQuery = useDebtAccountsQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const externalCounterpartiesQuery = useExternalCounterpartiesQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const managerAssignmentsQuery = useManagerAssignmentsQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const projectAssignmentsQuery = useProjectAssignmentsQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const warehouseAssignmentsQuery = useWarehouseAssignmentsQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const salaryPaymentsQuery = useSalaryPaymentsQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const employeeStateHistoryQuery = useEmployeeStateHistoryQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const projectManagerOwnershipQuery = useProjectManagerOwnershipHistoryQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })
  const warehouseManagerOwnershipQuery = useWarehouseManagerOwnershipHistoryQuery({ enabled: Boolean(sessionQuery.data?.user) && enabled })

  const isPending =
    rolesQuery.isPending ||
    employeesQuery.isPending ||
    projectsQuery.isPending ||
    warehousesQuery.isPending ||
    debtAccountsQuery.isPending ||
    externalCounterpartiesQuery.isPending ||
    managerAssignmentsQuery.isPending ||
    projectAssignmentsQuery.isPending ||
    warehouseAssignmentsQuery.isPending ||
    salaryPaymentsQuery.isPending ||
    employeeStateHistoryQuery.isPending ||
    projectManagerOwnershipQuery.isPending ||
    warehouseManagerOwnershipQuery.isPending

  const isError =
    rolesQuery.isError ||
    employeesQuery.isError ||
    projectsQuery.isError ||
    warehousesQuery.isError ||
    debtAccountsQuery.isError ||
    externalCounterpartiesQuery.isError ||
    managerAssignmentsQuery.isError ||
    projectAssignmentsQuery.isError ||
    warehouseAssignmentsQuery.isError ||
    salaryPaymentsQuery.isError ||
    employeeStateHistoryQuery.isError ||
    projectManagerOwnershipQuery.isError ||
    warehouseManagerOwnershipQuery.isError

  const refetch = () => {
    void rolesQuery.refetch()
    void employeesQuery.refetch()
    void projectsQuery.refetch()
    void warehousesQuery.refetch()
    void debtAccountsQuery.refetch()
    void externalCounterpartiesQuery.refetch()
    void managerAssignmentsQuery.refetch()
    void projectAssignmentsQuery.refetch()
    void warehouseAssignmentsQuery.refetch()
    void salaryPaymentsQuery.refetch()
    void employeeStateHistoryQuery.refetch()
    void projectManagerOwnershipQuery.refetch()
    void warehouseManagerOwnershipQuery.refetch()
  }

  const data: WorkspaceSnapshot | null =
    rolesQuery.data &&
    employeesQuery.data &&
    projectsQuery.data &&
    warehousesQuery.data &&
    debtAccountsQuery.data &&
    externalCounterpartiesQuery.data &&
    managerAssignmentsQuery.data &&
    projectAssignmentsQuery.data &&
    warehouseAssignmentsQuery.data &&
    salaryPaymentsQuery.data &&
    employeeStateHistoryQuery.data &&
    projectManagerOwnershipQuery.data &&
    warehouseManagerOwnershipQuery.data
      ? {
          roles: rolesQuery.data.items,
          employees: employeesQuery.data.items,
          projects: projectsQuery.data.items,
          warehouses: warehousesQuery.data.items,
          debtAccounts: debtAccountsQuery.data.items,
          externalCounterparties: externalCounterpartiesQuery.data.items,
          managerAssignments: managerAssignmentsQuery.data.items,
          projectAssignments: projectAssignmentsQuery.data.items,
          warehouseAssignments: warehouseAssignmentsQuery.data.items,
          salaryPayments: salaryPaymentsQuery.data.items,
          employeeStateHistory: employeeStateHistoryQuery.data.items,
          projectManagerOwnershipHistory: projectManagerOwnershipQuery.data.items,
          warehouseManagerOwnershipHistory: warehouseManagerOwnershipQuery.data.items,
          debtEntries: [],
        }
      : null

  return {
    data,
    isPending,
    isError,
    refetch,
  }
}

export function useDemoWorkspaceQuery() {
  const sessionQuery = useSessionQuery()

  return useQuery({
    queryKey: demoWorkspaceQueryKey(sessionQuery.data?.user?.id ?? null),
    queryFn: () => rpcClient.workspaceSnapshot(),
    enabled: Boolean(sessionQuery.data?.user),
  })
}
