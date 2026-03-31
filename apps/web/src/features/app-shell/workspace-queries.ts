import { useQuery } from "@tanstack/react-query"
import type { SystemLogEntry, WorkspaceSnapshot } from "@tuari/contracts"

import { useSessionQuery } from "@/features/session/use-session-query"
import { rpcClient } from "@/lib/orpc-client"
import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

export type DemoWorkspace = WorkspaceSnapshot

export const workspaceQueryPrefix = ["phase1", "workspace"] as const
export const demoWorkspaceQueryKey = (userId: string | null = "anonymous") =>
  ["phase1", "workspace", userId] as const

export function useSystemLogQuery({
  enabled = true,
  filters,
}: {
  enabled?: boolean
  filters?: {
    actionType?: SystemLogEntry["actionType"]
    actorUserId?: string
    entityType?: SystemLogEntry["entityType"]
    fromDate?: string
    toDate?: string
  }
} = {}) {
  const sessionQuery = useSessionQuery()

  return useQuery({
    queryKey: ["phase1", "workspace", "system-log", sessionQuery.data?.user?.id ?? null, filters],
    queryFn: async (): Promise<{ items: SystemLogEntry[] }> =>
      rpcClient.systemLogList(
        filters
          ? {
              ...filters,
              fromDate: filters.fromDate ? toAlgeriaDayBoundaryIso(filters.fromDate, "start") : undefined,
              toDate: filters.toDate ? toAlgeriaDayBoundaryIso(filters.toDate, "end") : undefined,
            }
          : undefined,
      ),
    enabled: Boolean(sessionQuery.data?.user) && enabled,
  })
}

export function useDemoWorkspaceQuery() {
  const sessionQuery = useSessionQuery()

  return useQuery({
    queryKey: demoWorkspaceQueryKey(sessionQuery.data?.user?.id ?? null),
    queryFn: () => rpcClient.workspaceSnapshot(),
    enabled: Boolean(sessionQuery.data?.user),
  })
}
