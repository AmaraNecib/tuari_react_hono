// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { sessionQueryKey, workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { exactCommercePrefix, useExactCommerceMutation } from "./exact-commerce-queries"
const queries: QueryClient[] = []
afterEach(() => { cleanup(); queries.splice(0).forEach(query => query.clear()) })
type Command = { kind: "pay"; input: { requestId: string; amount: string } }
const command: Command = { kind: "pay", input: { requestId: "placeholder", amount: "90071992547409.93" } }
function fixture() {
 const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
 queries.push(query)
 function owner(id: string) { query.setQueryData(sessionQueryKey, { user: { id, name: "Synthetic operator", phone: "0612345678", version: "0.0.0" } }) }
 owner("operator")
 const client = {}
 const dispatch = vi.fn<(_: Command) => Promise<string>>().mockResolvedValue("saved")
 const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={query}>{children}</QueryClientProvider>
 function mount(transport = client) { return renderHook(() => useExactCommerceMutation(transport, dispatch), { wrapper }) }
 return { query, owner, client, dispatch, mount }
}
it("retains an uncertain identity across remounts but allocates a new identity after confirmed success", async () => {
 const { mount, dispatch } = fixture()
 dispatch.mockRejectedValueOnce(new Error("Response lost after commit"))
 let hook = mount()
 await act(async () => { await expect(hook.result.current.mutateAsync(command)).rejects.toThrow("Response lost") })
 hook.unmount()
 hook = mount()
 await act(async () => { await hook.result.current.mutateAsync(command) })
 expect(dispatch.mock.calls[1]?.[0]).toEqual(dispatch.mock.calls[0]?.[0])
 await act(async () => { await hook.result.current.mutateAsync(command) })
 expect(dispatch.mock.calls[2]?.[0].input.requestId).not.toBe(dispatch.mock.calls[1]?.[0].input.requestId)
 expect(dispatch.mock.calls[2]?.[0].input.amount).toBe("90071992547409.93")
})
it("partitions uncertain identities by owner, injected client and intent", async () => {
 const { mount, dispatch, owner } = fixture()
 dispatch.mockRejectedValue(new Error("Transport uncertain"))
 const first = mount()
 async function fail(hook: ReturnType<typeof mount>, input = command) { await act(async () => { await expect(hook.result.current.mutateAsync(input)).rejects.toThrow("Transport uncertain") }) }
 await fail(first)
 owner("other")
 await fail(first)
 owner("operator")
 const second = mount({})
 await fail(second)
 await fail(first, { ...command, input: { ...command.input, amount: "0.10" } })
 expect(new Set(dispatch.mock.calls.map(call => call[0].input.requestId)).size).toBe(4)
 await fail(first)
 expect(dispatch.mock.calls[4]?.[0]).toEqual(dispatch.mock.calls[0]?.[0])
})
it("does not dispatch a write without an authenticated workspace", async () => {
 const { mount, dispatch, query } = fixture()
 query.removeQueries({ queryKey: sessionQueryKey })
 const hook = mount()
 await act(async () => { await expect(hook.result.current.mutateAsync(command)).rejects.toThrow("authenticated workspace") })
 expect(dispatch).not.toHaveBeenCalled()
})
it("invalidates only the command owner's exact cache even when the current session changes before its response", async () => {
 const { mount, dispatch, owner, query, client } = fixture()
 const ownKey = [...exactCommercePrefix(client), "operator", "invoices"]
 const otherKey = [...exactCommercePrefix(client), "other", "invoices"]
 const numericKey = workspaceQueryKeys.workspaceSnapshot("operator")
 query.setQueryData(ownKey, "own")
 query.setQueryData(otherKey, "other")
 query.setQueryData(numericKey, "numeric")
 let finish: (value: string) => void = () => { throw new Error("Dispatch did not start") }
 dispatch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
 const hook = mount()
 await act(async () => {
  const pending = hook.result.current.mutateAsync(command)
  await Promise.resolve(); await Promise.resolve()
  owner("other")
  finish("saved")
  await pending
 })
 expect(query.getQueryState(ownKey)?.isInvalidated).toBe(true)
 expect(query.getQueryState(otherKey)?.isInvalidated).toBe(false)
 expect(query.getQueryState(numericKey)?.isInvalidated).toBe(false)
})
