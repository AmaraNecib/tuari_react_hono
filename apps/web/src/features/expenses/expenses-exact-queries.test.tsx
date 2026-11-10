// @vitest-environment jsdom
import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ExactExpensesClient } from "@tuari/contracts"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { sessionQueryKey, workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { useExactExpenseQuery, useExactExpensesListQuery, useUpdateExactExpenseMutation } from "./expenses-exact-queries"

const { session } = vi.hoisted(() => ({ session: { user: { id: "user-1" } as { id: string } | null } }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: session }) }))
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }))
const clients: QueryClient[] = []
function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(queryClient)
  queryClient.setQueryData(sessionQueryKey, { user: session.user ? { ...session.user, name: "Operator", phone: "0612345678", version: "0.0.0" } : null })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}
function fixture(value: string) {
  const expensesList = vi.fn(async () => ({ items: [], totals: { total: value } }))
  const expensesGet = vi.fn(async () => ({ id: "one", amount: value, revisions: [] }))
  const expensesUpdate = vi.fn(async () => ({ id: "one", amount: "0.20" }))
  return { expensesList, expensesGet, expensesUpdate, client: { expensesList, expensesGet, expensesUpdate } as unknown as ExactExpensesClient }
}
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); session.user = { id: "user-1" } })

describe("isolated exact expense queries", () => {
  it("does not reuse numeric expense cache or another exact client's results", async () => {
    const { queryClient, wrapper } = setup()
    const legacyKey = [...workspaceQueryKeys.expenses("user-1"), {}]
    queryClient.setQueryData(legacyKey, { totals: { total: 17 } })
    const first = fixture("90071992547409.93")
    const second = fixture("0.10")
    const { result } = renderHook(() => ({ first: useExactExpensesListQuery(first.client, {}), second: useExactExpensesListQuery(second.client, {}) }), { wrapper })
    await waitFor(() => expect(result.current.first.data?.totals.total).toBe("90071992547409.93"))
    await waitFor(() => expect(result.current.second.data?.totals.total).toBe("0.10"))
    expect(queryClient.getQueryData(legacyKey)).toEqual({ totals: { total: 17 } })
    expect(first.expensesList).toHaveBeenCalledTimes(1)
    expect(second.expensesList).toHaveBeenCalledTimes(1)
  })
  it("invalidates list and history of its own client, not the numeric or other client cache", async () => {
    const { queryClient, wrapper } = setup()
    const first = fixture("0.10")
    const second = fixture("0.30")
    const numericKey = workspaceQueryKeys.expenses("user-1")
    queryClient.setQueryData(numericKey, { untouched: true })
    const { result } = renderHook(() => ({ list: useExactExpensesListQuery(first.client, {}), detail: useExactExpenseQuery(first.client, "one"), other: useExactExpensesListQuery(second.client, {}), update: useUpdateExactExpenseMutation(first.client) }), { wrapper })
    await waitFor(() => expect(result.current.list.isSuccess && result.current.detail.isSuccess && result.current.other.isSuccess).toBe(true))
    await act(async () => { await result.current.update.mutateAsync({ id: "one", amount: "0.20" }) })
    expect(first.expensesUpdate).toHaveBeenCalledWith({ id: "one", amount: "0.20" })
    expect(first.expensesList).toHaveBeenCalledTimes(2)
    expect(first.expensesGet).toHaveBeenCalledTimes(2)
    expect(second.expensesList).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryState(numericKey)?.isInvalidated).toBe(false)
  })
  it("does not request exact data without a session or fetch unselected history", async () => {
    session.user = null
    const { wrapper } = setup()
    const { client, expensesList, expensesGet } = fixture("0.10")
    const { result, rerender } = renderHook(() => ({ list: useExactExpensesListQuery(client, {}), detail: useExactExpenseQuery(client, null) }), { wrapper })
    expect(result.current.list.fetchStatus).toBe("idle")
    expect(expensesList).not.toHaveBeenCalled()
    session.user = { id: "user-1" }
    rerender()
    await waitFor(() => expect(expensesList).toHaveBeenCalledTimes(1))
    expect(result.current.detail.fetchStatus).toBe("idle")
    expect(expensesGet).not.toHaveBeenCalled()
  })
})
