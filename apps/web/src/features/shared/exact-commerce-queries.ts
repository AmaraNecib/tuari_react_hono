import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getCachedSessionUserId } from "@/features/app-shell/workspace-keys"

const scopes = new WeakMap<object, number>()
const requests = new WeakMap<object, Map<string, string>>()
let nextScope = 0
export function exactCommercePrefix(client: object) {
  let scope = scopes.get(client)
  if (scope === undefined) { scope = ++nextScope; scopes.set(client, scope) }
  return ["phase1", "workspace", "exact-commerce", scope] as const
}

/** Retain uncertain request identities across remounts, partitioned by authenticated owner and client. */
export function useExactCommerceMutation<Command extends { kind: string; input: { requestId: string } }, Result>(client: object, dispatch: (command: Command) => Promise<Result>) {
  const queries = useQueryClient()
  return useMutation({
    mutationKey: [...exactCommercePrefix(client), "command"], retry: false,
    mutationFn: async (command: Command) => {
      const owner = getCachedSessionUserId(queries)
      if (!owner) throw new Error("An authenticated workspace is required")
      let pending = requests.get(client)
      if (!pending) { pending = new Map(); requests.set(client, pending) }
      const signature = JSON.stringify({ owner, kind: command.kind, input: { ...command.input, requestId: undefined } })
      let requestId = pending.get(signature)
      if (!requestId) { requestId = crypto.randomUUID(); pending.set(signature, requestId) }
      const result = await dispatch({ ...command, input: { ...command.input, requestId } })
      pending.delete(signature)
      return { result, owner }
    },
    onSuccess: async ({ owner }) => { await queries.invalidateQueries({ queryKey: [...exactCommercePrefix(client), owner] }) },
  })
}
