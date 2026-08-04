import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
}))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: {
      inventoryItemDefinitionsList: mocks.list,
      inventoryItemDefinitionsCreate: mocks.create,
    },
  }
})

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: mocks.session,
}))

import {
  useCreateInventoryItemDefinitionMutation,
  useInventoryItemDefinitionsQuery,
} from "./inventory-hooks"
import { orpc } from "@/lib/orpc-client"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const CREATED_ITEM = { id: "item-1", name: "صنف-1", itemType: "CONSUMABLE", unit: "قطعة", key: "consumable_1" }

/**
 * Integration test across the query-key seam (issue #236): the item
 * definitions list query (workspace-scoped key) must refetch after the
 * create mutation's typed invalidation, so the created item appears without
 * a manual refresh. Guards the invalidation-consistency invariant that cache
 * key churn is allowed to rely on.
 */
describe("inventory item definitions — list freshness after create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockReturnValue({ data: undefined })
    mocks.list.mockResolvedValue({ items: [] })
    mocks.create.mockResolvedValue({
      success: true,
      message: "تم إنشاء التعريف بنجاح.",
      item: CREATED_ITEM,
    })
  })

  it("shows the created item in the list after the create mutation resolves", async () => {
    const queryClient = makeQueryClient()

    // Populate the session cache exactly like the app's session query does,
    // so the mutation's `getCachedSessionUserId` resolves the same user id
    // the list query scoped its key with. NOTE: the mounted key is
    // `queryOptions().queryKey`, NOT `orpc.session.key()` — the two differ
    // (`key()` omits the `type: "query"` field) and `key()` never matches
    // the cache.
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, {
      user: { id: "user-1", name: "مدير التشغيل", phone: "0612345678", version: "0.0.0" },
    })
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })

    const { result: listResult } = renderHook(() => useInventoryItemDefinitionsQuery(), {
      wrapper: wrapper(queryClient),
    })
    const { result: mutationResult } = renderHook(() => useCreateInventoryItemDefinitionMutation(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(listResult.current.data?.items).toEqual([]))

    // Simulate the server-side insert: the next list fetch includes the item.
    mocks.list.mockResolvedValue({ items: [CREATED_ITEM] })

    await act(async () => {
      await mutationResult.current.mutateAsync({
        name: "صنف-1",
        itemType: "CONSUMABLE",
        unit: "قطعة",
        description: null,
      })
    })

    await waitFor(() => expect(listResult.current.data?.items).toEqual([CREATED_ITEM]))
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })
})
