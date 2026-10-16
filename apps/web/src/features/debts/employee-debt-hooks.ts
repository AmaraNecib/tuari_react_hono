/**
 * Employee debt hooks for mutating employee debt data.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  AppError,
  EmployeeDebtEntryCreateInput,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import {
  getCachedSessionUserId,
  invalidateWorkspaceDomains,
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

export function useCreateEmployeeDebtEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["employee-debt", "entry", "create"],
    mutationFn: async (input: EmployeeDebtEntryCreateInput) => requireEntitySuccess(await rpcClient.employeeDebtEntryCreate(input)),
    onSuccess: async ({ item, message }) => {
      // The entry changes the worker's ledger and the debts summary/detail
      // views; invalidate the same workspace domains the other debt mutations
      // do. (The single-account read this used to target was deleted with the
      // dead EmployeeDebtPanel.)
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), {
        debtsSummary: true,
        debtsDetail: true,
        employees: true,
      })
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تسجيل حساب الدين."))
    },
  })
}
