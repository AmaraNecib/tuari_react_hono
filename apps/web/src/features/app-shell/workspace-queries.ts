import { keepPreviousData, useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query"
import type {
  DebtAccount,
  Employee,
  EmployeeManagerAssignment,
  EmployeeProjectAssignment,
  EmployeeSalaryPayment,
  EmployeeStateHistory,
  EmployeeWarehouseAssignment,
  ExternalCounterparty,
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
import { workspaceQueryKeys } from "./workspace-keys"

export type DemoWorkspace = WorkspaceSnapshot

/**
 * The snapshot query key — the single RPC backing the shell composite.
 * Alias of `workspaceQueryKeys.workspaceSnapshot` so the key cannot drift
 * from the invalidation vocabulary (issue #276).
 */
export const demoWorkspaceQueryKey = workspaceQueryKeys.workspaceSnapshot

/**
 * The one session gate for the workspace data layer.
 *
 * Every session-gated hook in the app-shell queries module (and the
 * inventory / employee-debt / debts features) resolves its userId and applies
 * the silently-disabled-query semantics through this wrapper, so the gate
 * lives once: the session resolves → `enabled` is the caller's own flag;
 * before the session resolves → the query stays disabled and the key falls
 * back to the anonymous scope.
 */
export function useWorkspaceScopedQuery<
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "queryKey" | "enabled"> & {
    key: (userId: string | null) => TQueryKey
    enabled?: boolean
  },
) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null

  return useQuery<TQueryFnData, TError, TData, TQueryKey>({
    ...options,
    queryKey: options.key(userId),
    enabled: Boolean(sessionQuery.data?.user) && (options.enabled ?? true),
  })
}

export function isRolesEndpointUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === "NOT_FOUND" || code === "METHOD_NOT_SUPPORTED"
}

export function useRolesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.roles,
    enabled,
    // Use the rbacRolesList endpoint (Issue #10) which returns the full
    // role + permissions shape the management UI needs. Falls back to
    // the legacy `rolesList` (no permissions) if the new endpoint is
    // unavailable on a stale client/server mismatch. Other errors must
    // propagate so the UI does not silently render incomplete role data.
    queryFn: async (): Promise<{ items: RoleWithPermissions[] }> => {
      try {
        const response = await rpcClient.rbacRolesList();
        return { items: response.items as RoleWithPermissions[] };
      } catch (error) {
        if (!isRolesEndpointUnavailable(error)) {
          throw error
        }

        const fallback = await rpcClient.rolesList();
        return {
          items: fallback.items.map((role) => ({
            ...role,
            permissions: [] as RoleWithPermissions["permissions"],
          })),
        };
      }
    },
  })
}

export function useEmployeesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.employees,
    enabled,
    queryFn: async (): Promise<{ items: Employee[] }> => rpcClient.employeesList(),
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
  return useWorkspaceScopedQuery({
    key: (userId) => [...workspaceQueryKeys.employees(userId), "paged", { cursor, limit, status, roleId }],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => rpcClient.employeesListPaged({
      cursor,
      limit,
      status,
      roleId,
    }),
  })
}

export function useProjectsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.projects,
    enabled,
    queryFn: async (): Promise<{ items: Project[] }> => rpcClient.projectsList(),
  })
}

export function useWarehousesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.warehouses,
    enabled,
    queryFn: async (): Promise<{ items: Warehouse[] }> => rpcClient.warehousesList(),
  })
}

export function useDebtAccountsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.debtAccounts,
    enabled,
    queryFn: async (): Promise<{ items: DebtAccount[] }> => rpcClient.debtAccountsList(),
  })
}

export function useExternalCounterpartiesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.externalCounterparties,
    enabled,
    queryFn: async (): Promise<{ items: ExternalCounterparty[] }> => rpcClient.externalCounterpartiesList(),
  })
}

export function useManagerAssignmentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.managerAssignments,
    enabled,
    queryFn: async (): Promise<{ items: EmployeeManagerAssignment[] }> => rpcClient.managerAssignmentsList(),
  })
}

export function useProjectAssignmentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.projectAssignments,
    enabled,
    queryFn: async (): Promise<{ items: EmployeeProjectAssignment[] }> => rpcClient.projectAssignmentsList(),
  })
}

export function useWarehouseAssignmentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.warehouseAssignments,
    enabled,
    queryFn: async (): Promise<{ items: EmployeeWarehouseAssignment[] }> => rpcClient.warehouseAssignmentsList(),
  })
}

export function useSalaryPaymentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.salaryPayments,
    enabled,
    queryFn: async (): Promise<{ items: EmployeeSalaryPayment[] }> => rpcClient.salaryPaymentsList(),
  })
}

export function useEmployeeStateHistoryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.employeeStateHistory,
    enabled,
    queryFn: async (): Promise<{ items: EmployeeStateHistory[] }> => rpcClient.employeeStateHistoryList(),
  })
}

export function useProjectManagerOwnershipHistoryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.projectManagerOwnership,
    enabled,
    queryFn: async (): Promise<{ items: ProjectManagerOwnershipHistory[] }> => rpcClient.projectManagerOwnershipHistoryList(),
  })
}

export function useWarehouseManagerOwnershipHistoryQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.warehouseManagerOwnership,
    enabled,
    queryFn: async (): Promise<{ items: WarehouseManagerOwnershipHistory[] }> => rpcClient.warehouseManagerOwnershipHistoryList(),
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
  return useWorkspaceScopedQuery({
    key: (userId) => [...workspaceQueryKeys.systemLog(userId), filters],
    enabled,
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
  })
}

export function useCompositeWorkspaceQuery({ enabled = true }: { enabled?: boolean } = {}) {
  // One RPC for the whole shell instead of the former ~12 parallel list
  // queries (issue #276). The snapshot key lives in the workspace-keys
  // vocabulary, so mutations refresh it through `invalidateWorkspaceDomains`
  // whenever a snapshot-backed domain changes.
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.workspaceSnapshot,
    enabled,
    queryFn: () => rpcClient.workspaceSnapshot(),
  })
}

// Legacy demo alias — the demo snapshot query is the same single-RPC query
// the shell composite mounts (issue #276), so it stays one implementation.
export const useDemoWorkspaceQuery = useCompositeWorkspaceQuery

// Re-exported for consumers of the legacy `workspaceDomainQueryPrefix` /
// `workspaceQueryPrefix` import paths (mock-dashboard seam, mutation
// cleanup). The keys factories themselves live in workspace-keys.
export { workspaceDomainQueryPrefix, workspaceQueryPrefix } from "./workspace-keys"
