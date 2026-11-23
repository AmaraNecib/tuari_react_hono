import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { useLocationTransferHistoryQuery, useTransferHistoryQuery } from "./transfer-history-hooks"

const mocks = vi.hoisted(() => ({ read: vi.fn(), owner: "owner" }))
vi.mock("@orpc/client", () => ({ createORPCClient: () => ({ financial: { inventory: { transferHistory: mocks.read } } }) }))
vi.mock("@/lib/orpc-client", () => ({ rpcLink: {} }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: mocks.owner } } }) }))
afterEach(() => { cleanup(); mocks.read.mockReset() })
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
const page = (offset: number, limit: number, total: number) => ({ offset, limit, total, summary: { total, sales: total, internal: 0, totalAmountDzd: "184467440737095516.14" }, items: Array.from({ length: Math.min(limit, total - offset) }, (_, i) => ({ id: String(offset + i) })) })

it("requests one location page of ten, then only the explicit next page", async () => {
  mocks.read.mockImplementation(async ({ offset, limit }) => page(offset, limit, 12))
  const { result } = renderHook(() => useLocationTransferHistoryQuery("same", "PROJECT"), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data?.items).toHaveLength(10))
  expect(mocks.read).toHaveBeenCalledTimes(1)
  expect(mocks.read.mock.calls[0]![0]).toEqual({ projectId: "same", offset: 0, limit: 10 })
  expect(result.current.data?.summary.totalAmountDzd).toBe("184467440737095516.14")
  await act(async () => { await result.current.fetchNextPage() })
  await waitFor(() => expect(result.current.data?.items).toHaveLength(12))
  expect(mocks.read).toHaveBeenCalledTimes(2)
  expect(mocks.read.mock.calls[1]![0].offset).toBe(10)
  expect(result.current.hasNextPage).toBe(false)
})

it("resets paging on filter changes and aborts the obsolete request", async () => {
  let oldSignal: AbortSignal | undefined
  mocks.read.mockImplementation(({ search, offset, limit }, { signal }) => {
    if (search === "old") { oldSignal = signal; return new Promise(() => {}) }
    return Promise.resolve(page(offset, limit, search === "new" ? 1 : 70))
  })
  const { result, rerender } = renderHook(({ search }) => useTransferHistoryQuery({ search }), { initialProps: { search: "first" }, wrapper: wrapper() })
  await waitFor(() => expect(result.current.data?.items).toHaveLength(50))
  expect(mocks.read).toHaveBeenCalledTimes(1)
  await act(async () => { await result.current.fetchNextPage() })
  await waitFor(() => expect(result.current.data?.items).toHaveLength(70))
  rerender({ search: "old" })
  await waitFor(() => expect(oldSignal).toBeDefined())
  expect(result.current.data).toBeUndefined()
  rerender({ search: "new" })
  await waitFor(() => expect(result.current.data?.items).toHaveLength(1))
  expect(oldSignal!.aborted).toBe(true)
  expect(mocks.read.mock.calls.at(-1)![0]).toEqual({ search: "new", offset: 0, limit: 50 })
})
