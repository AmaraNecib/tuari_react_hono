import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { AppError, EmployeeEarning, EmployeeEarningApprovalInput } from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/workspace-mutations"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import {
  getCachedSessionUserId,
  invalidateWorkspaceDomains,
  workspaceQueryKeys,
} from "@/features/app-shell/workspace-keys"
import { rpcClient } from "@/lib/orpc-client"

export const employeeEarningsQueryKeys = {
  root: (userId: string) => ["phase1", "workspace-domain", "employee-earnings", userId] as const,
  list: (userId: string, employeeId?: string) => [
    ...employeeEarningsQueryKeys.root(userId),
    "list",
    employeeId ?? "all",
  ] as const,
}

function requireEarning(result: {
  success: boolean
  item?: EmployeeEarning
  error?: Pick<AppError, "message" | "code" | "fieldErrors">
}) {
  if (!result.success || !result.item) {
    throw new AppMutationError({
      message: result.error?.message ?? "تعذر اعتماد الأجر.",
      code: result.error?.code,
      fieldErrors: result.error?.fieldErrors,
    })
  }

  return result.item
}

export function useEmployeeEarningsQuery(employeeId?: string) {
  return useWorkspaceScopedQuery({
    key: (userId) => employeeEarningsQueryKeys.list(userId ?? "anonymous", employeeId),
    queryFn: () => rpcClient.employeeEarningsList(employeeId ? { employeeId } : undefined),
  })
}

export function useApproveEmployeeEarningMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["employee-earnings", "approve"],
    mutationFn: async (input: EmployeeEarningApprovalInput) =>
      requireEarning(await rpcClient.employeeEarningsApprove(input)),
    onMutate: () => ({ userId: getCachedSessionUserId(queryClient) }),
    onSuccess: async (_earning, input, context) => {
      const userId = context.userId
      if (userId === null) {
        return
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeEarningsQueryKeys.root(userId) }),
        invalidateWorkspaceDomains(queryClient, userId, { employees: true }),
        ...[...new Set(input.segments.map((segment) => segment.projectId))].map((projectId) =>
          queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.projectCost(userId, projectId) }),
        ),
      ])
    },
  })
}
