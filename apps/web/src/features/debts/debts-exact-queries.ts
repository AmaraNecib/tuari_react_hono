import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ExactDebtsClient, CreateExactDebtAccount, PostExactDebtEntry, PayExactDebtEntry, CorrectExactDebtEntry, VoidExactDebtEntry, SettleExactDebtAccount } from "@tuari/contracts"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { getCachedSessionUserId } from "@/features/app-shell/workspace-keys"

export type ExactDebtCommand =
  | { kind: "create"; input: CreateExactDebtAccount }
  | { kind: "post"; input: PostExactDebtEntry }
  | { kind: "pay"; input: PayExactDebtEntry }
  | { kind: "correct"; input: CorrectExactDebtEntry }
  | { kind: "void"; input: VoidExactDebtEntry }
  | { kind: "settle"; input: SettleExactDebtAccount }
const scopes = new WeakMap<ExactDebtsClient, number>()
let next = 0
function prefix(client: ExactDebtsClient) {
  let scope = scopes.get(client)
  if (scope === undefined) { scope = ++next; scopes.set(client, scope) }
  return ["phase1", "workspace", "debts-exact", scope] as const
}
export function useExactDebtSummary(client: ExactDebtsClient) {
  return useWorkspaceScopedQuery({ key: userId => [...prefix(client), userId, "summary"], queryFn: () => client.summary() })
}
export function useExactDebtDetail(client: ExactDebtsClient, id: string | null) {
  return useWorkspaceScopedQuery({ key: userId => [...prefix(client), userId, "detail", id], enabled: id !== null,
    queryFn: () => { if (id === null) throw new Error("Select an exact debt account"); return client.detail({ id }) },
  })
}
export function useExactDebtCommand(client: ExactDebtsClient) {
  const queries = useQueryClient()
  return useMutation({
    mutationKey: [...prefix(client), "command"], retry: false,
    mutationFn: async (command: ExactDebtCommand) => {
      const owner = getCachedSessionUserId(queries)
      const result = await (() => {
        switch (command.kind) {
          case "create": return client.create(command.input)
          case "post": return client.post(command.input)
          case "pay": return client.pay(command.input)
          case "correct": return client.correct(command.input)
          case "void": return client.void(command.input)
          case "settle": return client.settle(command.input)
        }
      })()
      return { result, owner }
    },
    onSuccess: async ({ owner }) => { await queries.invalidateQueries({ queryKey: [...prefix(client), owner] }) },
  })
}
