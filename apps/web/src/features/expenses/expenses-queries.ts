/**
 * Expenses feature queries (issue #411).
 *
 * Feature-scoped data access for the expenses screen. Reads and invalidates
 * the `expenses` workspace-domain key, so an expense mutation refreshes the
 * list without refetching the whole workspace snapshot.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateExpenseInput,
  Expense,
  ExpenseListFilters,
  ExpenseListOutput,
  UpdateExpenseInput,
  VoidExpenseInput,
} from "@tuari/contracts"

import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import {
  getCachedSessionUserId,
  invalidateWorkspaceDomains,
  workspaceQueryKeys,
} from "@/features/app-shell/workspace-keys"
import { i18n } from "@/i18n"
import { rpcClient } from "@/lib/orpc-client"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

function reportError(error: unknown) {
  showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
}

export function useExpensesListQuery(
  filters: ExpenseListFilters,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useWorkspaceScopedQuery({
    key: (userId) => [...workspaceQueryKeys.expenses(userId), filters] as const,
    enabled,
    queryFn: async (): Promise<ExpenseListOutput> => rpcClient.expensesList({ filters }),
  })
}

export function useCreateExpenseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "expenses", "create"],
    mutationFn: async (input: CreateExpenseInput): Promise<Expense> =>
      rpcClient.expensesCreate(input),
    onSuccess: async () => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), {
        expenses: true,
      })
      showSuccessToast(i18n.t("expenses.toasts.created"))
    },
    onError: reportError,
  })
}

export function useUpdateExpenseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "expenses", "update"],
    mutationFn: async (input: UpdateExpenseInput): Promise<Expense> =>
      rpcClient.expensesUpdate(input),
    onSuccess: async () => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), {
        expenses: true,
      })
      showSuccessToast(i18n.t("expenses.toasts.updated"))
    },
    onError: reportError,
  })
}

export function useVoidExpenseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "expenses", "void"],
    mutationFn: async (input: VoidExpenseInput): Promise<Expense> =>
      rpcClient.expensesVoid(input),
    onSuccess: async () => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), {
        expenses: true,
      })
      showSuccessToast(i18n.t("expenses.toasts.voided"))
    },
    onError: reportError,
  })
}
