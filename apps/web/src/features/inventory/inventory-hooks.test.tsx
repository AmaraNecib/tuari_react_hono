import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  createInvoiceGroup: vi.fn(),
  listProjectCharges: vi.fn(),
  chargeDefault: vi.fn(),
}))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: {
      inventoryItemDefinitionsList: mocks.list,
      inventoryItemDefinitionsCreate: mocks.create,
      inventoryInvoiceGroupsCreate: mocks.createInvoiceGroup,
      inventoryAssetChargesListByProject: mocks.listProjectCharges,
      inventoryAssetChargeDefault: mocks.chargeDefault,
    },
  }
})

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: mocks.session,
}))

import {
  useAssetChargeDefaultQuery,
  useCreateInventoryInvoiceGroupMutation,
  useCreateInventoryItemDefinitionMutation,
  useInventoryItemDefinitionsQuery,
  useProjectChargesQuery,
} from "./inventory-hooks"
import { orpc } from "@/lib/orpc-client"

function makeQueryClient() {
  // Mirror the app's production stale window (30s) so a test that relies on
  // revalidation cannot pass merely because the test client defaults to
  // `staleTime: 0`.
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
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

  it("still refreshes the list when the mutation runs before the session cache resolves", async () => {
    const queryClient = makeQueryClient()
    // No session in the cache: `getCachedSessionUserId` resolves null and the
    // null-safe invalidation falls back to prefix-wide, so the mounted list
    // (scoped to "user-1" via the session hook) must still refetch.
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })

    const { result: listResult } = renderHook(() => useInventoryItemDefinitionsQuery(), {
      wrapper: wrapper(queryClient),
    })
    const { result: mutationResult } = renderHook(() => useCreateInventoryItemDefinitionMutation(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(listResult.current.data?.items).toEqual([]))
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
  })
})

/**
 * Invoice creation books a placement charge for ASSETs placed directly on a
 * project, so the project's charges cache must refetch (#422 round 4).
 */
describe("inventory project charges — freshness after invoice create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.createInvoiceGroup.mockResolvedValue({
      success: true,
      message: "تم إنشاء الفاتورة.",
      item: { group: { id: "group-1" } },
    })
  })

  it("refetches the affected project's charges after an invoice places assets on it", async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, {
      user: { id: "user-1", name: "مدير التشغيل", phone: "0612345678", version: "0.0.0" },
    })
    mocks.listProjectCharges.mockResolvedValue({
      success: true,
      message: "ok",
      item: { projectId: "project-a", totalDzd: 0, charges: [] },
    })

    const { result: chargesResult } = renderHook(() => useProjectChargesQuery("project-a"), {
      wrapper: wrapper(queryClient),
    })
    const { result: mutationResult } = renderHook(() => useCreateInventoryInvoiceGroupMutation(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(chargesResult.current.data?.totalDzd).toBe(0))

    // The server books the charge during the create; the next read sees it.
    mocks.listProjectCharges.mockResolvedValue({
      success: true,
      message: "ok",
      item: { projectId: "project-a", totalDzd: 100_000, charges: [] },
    })

    await act(async () => {
      await mutationResult.current.mutateAsync({
        projectId: "project-a",
        entries: [
          {
            kind: "ASSET",
            itemDefinitionId: "def-1",
            projectId: "project-a",
            assets: [{ assetName: "مثقاب", purchasePriceDzd: 100_000 }],
          },
        ],
      })
    })

    await waitFor(() => expect(chargesResult.current.data?.totalDzd).toBe(100_000))
    expect(mocks.listProjectCharges).toHaveBeenCalledTimes(2)
  })
})

/**
 * The transfer dialog prefills the charge amount from the unit's resolved
 * default. Reopening it must revalidate that default: another tab can correct
 * the last charge while this tab's cached copy is still inside the stale
 * window, and a stale prefill books the wrong amount (#422 round 5).
 */
describe("asset charge default — revalidates when the dialog reopens", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
  })

  it("refetches on re-enable even while the cached value is still fresh", async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, {
      user: { id: "user-1", name: "مدير التشغيل", phone: "0612345678", version: "0.0.0" },
    })
    mocks.chargeDefault.mockResolvedValue({
      success: true,
      message: "ok",
      item: { assetUnitId: "asset-1", amountDzd: 100_000, purchasePriceDzd: 100_000, source: "PURCHASE_PRICE" },
    })

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAssetChargeDefaultQuery(enabled ? "asset-1" : undefined),
      { wrapper: wrapper(queryClient), initialProps: { enabled: true } },
    )

    await waitFor(() => expect(result.current.data?.amountDzd).toBe(100_000))
    expect(mocks.chargeDefault).toHaveBeenCalledTimes(1)

    // Another tab corrects the unit's last charge.
    mocks.chargeDefault.mockResolvedValue({
      success: true,
      message: "ok",
      item: { assetUnitId: "asset-1", amountDzd: 70_000, purchasePriceDzd: 100_000, source: "LAST_CHARGE" },
    })

    // Close the dialog, then reopen inside the 30s stale window.
    rerender({ enabled: false })
    rerender({ enabled: true })

    await waitFor(() => expect(result.current.data?.amountDzd).toBe(70_000))
    expect(mocks.chargeDefault).toHaveBeenCalledTimes(2)
  })
})
