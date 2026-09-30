/**
 * Employee debt hooks for querying and mutating employee debt data.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  AppError,
  DebtAccount,
  EmployeeDebtEntryCreateInput,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import {
  getCachedSessionUserId,
  invalidateUserScopedQuery,
  workspaceQueryKeys,
} from "@/features/app-shell/workspace-keys"
import { rpcClient } from "@/lib/orpc-client"
import { buildErrorMessage } from "@/lib/rpc-error-handling"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

function requireEntitySuccess<T>(result: { success: boolean; message?: string; item?: T; error?: { message: string; code?: AppError["code"]; fieldErrors?: Array<{ field: string; message: string }> } }) {
  if (!result.success || !result.item) {
    throw new AppMutationError({
      message: result.error?.message ?? "تعذر تنفيذ العملية.",
      code: result.error?.code,
      fieldErrors: result.error?.fieldErrors,
    })
  }

  return { item: result.item, message: result.message ?? "تم الحفظ بنجاح." }
}

/**
 * The direction-scoped worker debt account. A worker holds one ledger per
 * direction (D3), so the caller must say which ledger it means; this query
 * caches the two ledgers under separate keys.
 */
export function useEmployeeDebtAccountQuery(
  employeeId: string | undefined,
  direction: DebtAccount["direction"],
) {
  return useWorkspaceScopedQuery({
    key: (userId) =>
      [...workspaceQueryKeys.employeeDebtAccount(userId, employeeId ?? "missing"), direction] as const,
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<DebtAccount | null> => {
      const result = await rpcClient.employeeDebtAccountGet({ employeeId: employeeId!, direction })
      return requireEntitySuccess(result).item
    },
  })
}

export function useCreateEmployeeDebtEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["employee-debt", "entry", "create"],
    mutationFn: async (input: EmployeeDebtEntryCreateInput) => requireEntitySuccess(await rpcClient.employeeDebtEntryCreate(input)),
    onSuccess: async ({ item, message }, variables) => {
      await invalidateUserScopedQuery(queryClient, getCachedSessionUserId(queryClient), (uid) => workspaceQueryKeys.employeeDebtAccount(uid, variables.employeeId))
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تسجيل حساب الدين."))
    },
  })
}
