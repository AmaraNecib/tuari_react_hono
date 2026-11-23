import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateExactExpenseInput, ExactExpense, ExactExpensesClient, ExpenseListFilters,
  UpdateExactExpenseInput, VoidExpenseInput,
} from "@tuari/contracts"
import { getCachedSessionUserId } from "@/features/app-shell/workspace-keys"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { i18n } from "@/i18n"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

// A separate client and cache namespace cannot satisfy a numeric expense read.
const clientScopes = new WeakMap<ExactExpensesClient, number>()
let nextScope = 0
function prefix(client: ExactExpensesClient) {
  let scope = clientScopes.get(client)
  if (scope === undefined) { scope = ++nextScope; clientScopes.set(client, scope) }
  return ["phase1", "workspace", "expenses-exact", scope] as const
}

export function useExactExpensesListQuery(client: ExactExpensesClient, filters: ExpenseListFilters) {
  return useWorkspaceScopedQuery({
    key: userId => [...prefix(client), userId, "list", filters] as const,
    queryFn: () => client.expensesList({ filters }),
  })
}

export function useExactExpenseQuery(client: ExactExpensesClient, id: string | null) {
  return useWorkspaceScopedQuery({
    key: userId => [...prefix(client), userId, "detail", id] as const,
    enabled: id !== null,
    queryFn: () => {
      if (id === null) throw new Error("Select an expense before reading its history")
      return client.expensesGet({ id })
    },
  })
}

function useExactExpenseMutation<Input>(client: ExactExpensesClient, action: "created" | "updated" | "voided", mutationFn: (input: Input) => Promise<ExactExpense>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: [...prefix(client), action],
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...prefix(client), getCachedSessionUserId(queryClient)] })
      showSuccessToast(i18n.t(`expenses.toasts.${action}`))
    },
    onError: error => showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError")),
  })
}

export function useCreateExactExpenseMutation(client: ExactExpensesClient) {
  return useExactExpenseMutation(client, "created", (input: CreateExactExpenseInput) => client.expensesCreate(input))
}
export function useUpdateExactExpenseMutation(client: ExactExpensesClient) {
  return useExactExpenseMutation(client, "updated", (input: UpdateExactExpenseInput) => client.expensesUpdate(input))
}
export function useVoidExactExpenseMutation(client: ExactExpensesClient) {
  return useExactExpenseMutation(client, "voided", (input: VoidExpenseInput) => client.expensesVoid(input))
}
