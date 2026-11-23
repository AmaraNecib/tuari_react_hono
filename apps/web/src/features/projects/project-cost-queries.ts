/**
 * Project cost feature query (issue #414).
 *
 * Feature-scoped read of the single `projectCostGet` RPC. The cost tab mounts
 * only while it is open, and the query is always refetched on mount, so a
 * charge/expense/salary recorded elsewhere is reflected the next time the tab
 * is opened without dragging the whole workspace snapshot.
 */
import type { ProjectCost } from "@tuari/contracts"

import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { AppMutationError } from "@/features/app-shell/workspace-mutations"
import { rpcClient } from "@/lib/orpc-client"

export function useProjectCostQuery(projectId: string | undefined) {
  return useWorkspaceScopedQuery({
    key: (userId) => workspaceQueryKeys.projectCost(userId, projectId ?? "missing"),
    enabled: Boolean(projectId),
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<ProjectCost> => {
      const result = await rpcClient.projectCostGet({ projectId: projectId! })
      if (!result.success) {
        throw new AppMutationError(result.error)
      }

      return result.item
    },
  })
}
