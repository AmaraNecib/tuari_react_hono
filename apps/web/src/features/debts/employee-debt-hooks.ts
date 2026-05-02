import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  DebtAccount,
  DebtEntry,
  EmployeeDebtEntryCreateInput,
  EmployeeDebtAccountGetInput,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import { rpcClient } from "@/lib/orpc-client"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

const employeeDebtKeys = {
  account: (employeeId: string) => ["employee-debt", "account", employeeId] as const,
}

function extractRpcIssueMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0 && error.message !== "Input validation failed") {
    return error.message
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>
    const directData = obj["data"]

    if (typeof directData === "object" && directData !== null) {
      const data = directData as Record<string, unknown>
      const issues = data["issues"]
      if (Array.isArray(issues) && issues.length > 0) {
        const firstIssue = issues[0]
        if (typeof firstIssue === "object" && firstIssue !== null) {
          const issue = firstIssue as Record<string, unknown>
          const message = issue["message"]
          if (typeof message === "string" && message.trim().length > 0) {
            return message
          }
        }
      }
    }
  }

  return null
}

function getEmployeeDebtErrorMessage(error: unknown, fallbackMessage: string) {
  return extractRpcIssueMessage(error) ?? (error instanceof Error && error.message.trim().length > 0 ? error.message : fallbackMessage)
}

function requireEntitySuccess<T>(result: { success: boolean; message?: string; item?: T; error?: { message: string; code?: string; fieldErrors?: Array<{ field: string; message: string }> } }) {
  if (!result.success || !result.item) {
    throw new AppMutationError({
      message: result.error?.message ?? "تعذر تنفيذ العملية.",
      code: result.error?.code as any,
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
      showErrorToast(getEmployeeDebtErrorMessage(error, "تعذر تسجيل حساب الدين."))
    },
  })
}
