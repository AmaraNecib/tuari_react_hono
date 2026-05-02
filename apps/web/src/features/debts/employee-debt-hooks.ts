import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AppError,
  DebtAccount,
  DebtEntry,
  EmployeeDebtEntryCreateInput,
  EmployeeDebtAccountGetInput,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import { rpcClient } from "@/lib/orpc-client"
import { buildErrorMessage } from "@/lib/rpc-error-handling"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

const employeeDebtKeys = {
  account: (employeeId: string) => ["employee-debt", "account", employeeId] as const,
}

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

export function useEmployeeDebtAccountQuery(employeeId: string | undefined) {
  return useQuery({
    queryKey: employeeDebtKeys.account(employeeId ?? "missing"),
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<DebtAccount | null> => {
      const result = await rpcClient.employeeDebtAccountGet({ employeeId: employeeId! })
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
      await queryClient.invalidateQueries({ queryKey: employeeDebtKeys.account(variables.employeeId) })
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تسجيل حساب الدين."))
    },
  })
}
