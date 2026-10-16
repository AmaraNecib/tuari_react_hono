import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider, type UseMutationResult } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { outboundPickUsage } from "@tuari/contracts"

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  options: vi.fn(),
  create: vi.fn(),
  createInvoiceGroup: vi.fn(),
  listProjectCharges: vi.fn(),
  chargeDefault: vi.fn(),
  transferConsumable: vi.fn(),
  transferAsset: vi.fn(),
  createOutboundTransfer: vi.fn(),
}))

vi.mock("@/lib/orpc-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: {
      inventoryItemDefinitionsList: mocks.list,
      inventoryItemDefinitionOptions: mocks.options,
      inventoryItemDefinitionsCreate: mocks.create,
      inventoryInvoiceGroupsCreate: mocks.createInvoiceGroup,
      inventoryAssetChargesListByProject: mocks.listProjectCharges,
      inventoryAssetChargeDefault: mocks.chargeDefault,
      inventoryConsumablesTransfer: mocks.transferConsumable,
      inventoryAssetsTransfer: mocks.transferAsset,
      inventoryOutboundTransfersCreate: mocks.createOutboundTransfer,
    },
  }
})

vi.mock("@/features/session/use-session-query", () => ({
  useSessionQuery: mocks.session,
}))

import {
  ITEM_DEFINITION_OPTIONS_PAGE_SIZE,
  useAssetChargeDefaultQuery,
  useCreateInventoryInvoiceGroupMutation,
  useCreateInventoryItemDefinitionMutation,
  useCreateOutboundTransferMutation,
  useInventoryItemDefinitionsQuery,
  useItemDefinitionOptionsQuery,
  useProjectChargesQuery,
  useTransferInventoryAssetMutation,
  useTransferInventoryConsumableMutation,
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

/**
 * The paged, usage-scoped picker read. The invoice page test mocks this hook
 * away, so this suite is the only coverage of the filter mapping, the debounce
 * and the cursor chain that the hook owns.
 */
describe("item-definition options — the usage-scoped paged picker read", () => {
  const CONSUMABLE_USAGE = { surface: "INVOICE_LINE", kind: "CONSUMABLE" } as const
  const OPTION_A = { id: "def-1", name: "إسمنت", itemType: "CONSUMABLE", unit: "قطعة" }
  const OPTION_B = { id: "def-2", name: "جير", itemType: "CONSUMABLE", unit: "قطعة" }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
  })

  it("pages the usage-scoped options by cursor and accumulates the pages", async () => {
    mocks.options.mockImplementation((input: { cursor?: string }) =>
      input.cursor
        ? Promise.resolve({ items: [OPTION_B], total: 2, nextCursor: null, hasMore: false })
        : Promise.resolve({ items: [OPTION_A], total: 2, nextCursor: "cursor-1", hasMore: true }),
    )
    const queryClient = makeQueryClient()
    const { result } = renderHook(() => useItemDefinitionOptionsQuery({ usage: CONSUMABLE_USAGE }), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current.options).toEqual([OPTION_A]))
    expect(mocks.options).toHaveBeenCalledWith({
      usage: CONSUMABLE_USAGE,
      search: undefined,
      cursor: undefined,
      limit: ITEM_DEFINITION_OPTIONS_PAGE_SIZE,
    })

    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.options).toEqual([OPTION_A, OPTION_B]))
    expect(mocks.options).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "cursor-1" }))
  })

  it("debounces the search and starts a fresh cursor chain when it changes", async () => {
    mocks.options.mockResolvedValue({ items: [OPTION_A], total: 3, nextCursor: "cursor-1", hasMore: true })
    const queryClient = makeQueryClient()
    const { result, rerender } = renderHook(
      ({ search }: { search: string }) => useItemDefinitionOptionsQuery({ usage: CONSUMABLE_USAGE, search }),
      { wrapper: wrapper(queryClient), initialProps: { search: "إسمنت" } },
    )

    await waitFor(() => expect(result.current.options).toEqual([OPTION_A]))
    // Load a second page so a cursor is held for the first search.
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(mocks.options).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "cursor-1" })))

    rerender({ search: "إسمن" })
    rerender({ search: "إسمنت أبيض" })

    // The changed search is a new query key: its first request must carry no
    // cursor, or it would resume the previous search's position and skip rows.
    await waitFor(() =>
      expect(mocks.options).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "إسمنت أبيض", cursor: undefined }),
      ),
    )
    // The intermediate keystroke was debounced away entirely.
    expect(mocks.options.mock.calls.some(([input]) => input.search === "إسمن")).toBe(false)
  })

  it("maps an asset usage to its own request instead of reusing the consumable read", async () => {
    mocks.options.mockResolvedValue({ items: [], total: 0, nextCursor: null, hasMore: false })
    const queryClient = makeQueryClient()
    const { rerender } = renderHook(
      ({ kind }: { kind: "CONSUMABLE" | "ASSET" }) =>
        useItemDefinitionOptionsQuery({ usage: { surface: "INVOICE_LINE", kind } }),
      { wrapper: wrapper(queryClient), initialProps: { kind: "CONSUMABLE" } },
    )

    await waitFor(() =>
      expect(mocks.options).toHaveBeenCalledWith(expect.objectContaining({ usage: { surface: "INVOICE_LINE", kind: "CONSUMABLE" } })),
    )
    rerender({ kind: "ASSET" })
    await waitFor(() =>
      expect(mocks.options).toHaveBeenLastCalledWith(
        expect.objectContaining({ usage: { surface: "INVOICE_LINE", kind: "ASSET" } }),
      ),
    )
  })

  it("keys two outbound sources separately instead of sharing the first source's page chain", async () => {
    mocks.options.mockResolvedValue({ items: [], total: 0, nextCursor: null, hasMore: false })
    const queryClient = makeQueryClient()
    const { rerender } = renderHook(
      ({ warehouseId }: { warehouseId: string }) =>
        useItemDefinitionOptionsQuery({ usage: outboundPickUsage({ locationType: "WAREHOUSE", warehouseId }) }),
      { wrapper: wrapper(queryClient), initialProps: { warehouseId: "wh-1" } },
    )

    await waitFor(() =>
      expect(mocks.options).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: { surface: "OUTBOUND_PICK", source: { locationType: "WAREHOUSE", warehouseId: "wh-1" } },
        }),
      ),
    )

    // A second source is a different rule and must not be served the first
    // source's cached page (the source is part of the query key).
    rerender({ warehouseId: "wh-2" })
    await waitFor(() =>
      expect(mocks.options).toHaveBeenLastCalledWith(
        expect.objectContaining({
          usage: { surface: "OUTBOUND_PICK", source: { locationType: "WAREHOUSE", warehouseId: "wh-2" } },
        }),
      ),
    )
  })

  it("does not fetch while disabled", async () => {
    const queryClient = makeQueryClient()
    renderHook(() => useItemDefinitionOptionsQuery({ usage: { surface: "STOCK_REFERENCE" }, enabled: false }), {
      wrapper: wrapper(queryClient),
    })
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(mocks.options).not.toHaveBeenCalled()
  })
})

/**
 * A stock change must invalidate the outbound picker's cached page. Its
 * `OUTBOUND_PICK` rule filters on `inStockAt`, so the read's answer is a
 * function of where stock sits; a receipt, a location transfer or an outbound
 * changes that answer while the 30s stale window is still open. Without the
 * invalidation the picker keeps serving its empty page, so the newly stocked
 * item cannot be picked (issue #467, the Greptile finding on #465).
 */
describe("outbound item options — no stale availability page after a stock change", () => {
  const WAREHOUSE_A = outboundPickUsage({ locationType: "WAREHOUSE", warehouseId: "wh-1" })
  const STOCKED_ITEM = { id: "def-1", name: "إسمنت", itemType: "CONSUMABLE", unit: "قطعة" }
  const EMPTY_PAGE = { items: [], total: 0, nextCursor: null, hasMore: false }
  const STOCKED_PAGE = { items: [STOCKED_ITEM], total: 1, nextCursor: null, hasMore: false }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockReturnValue({ data: { user: { id: "user-1" } } })
    mocks.options.mockResolvedValue(EMPTY_PAGE)
  })

  /**
   * Mounts the picker read and one stock-changing mutation over the same real
   * `QueryClient`, then drives the whole sequence: empty page → stock change →
   * item appears. `makeQueryClient`'s 30s `staleTime` is what makes this an
   * invalidation check rather than a lucky refetch. The session cache is seeded
   * at the key the mutation reads, so this pins the PRIMARY invalidation path
   * (not the null-userId prefix-wide fallback).
   */
  async function expectItemAppearsAfter<TData, TError, TVariables, TContext>(
    useStockChange: () => UseMutationResult<TData, TError, TVariables, TContext>,
    mutateInput: TVariables,
  ) {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(orpc.session.queryOptions().queryKey, {
      user: { id: "user-1", name: "مدير التشغيل", phone: "0612345678", version: "0.0.0" },
    })

    const { result: optionsResult } = renderHook(
      () => useItemDefinitionOptionsQuery({ usage: WAREHOUSE_A }),
      { wrapper: wrapper(queryClient) },
    )
    const { result: mutationResult } = renderHook(() => useStockChange(), {
      wrapper: wrapper(queryClient),
    })

    // The source is empty and its page is cached as such, still inside the 30s
    // stale window. Without an invalidation the mounted read would not re-run.
    await waitFor(() => expect(optionsResult.current.options).toEqual([]))
    expect(mocks.options).toHaveBeenCalledTimes(1)

    // Stock arrives at the source; the server's next answer includes the item.
    mocks.options.mockResolvedValue(STOCKED_PAGE)

    await act(async () => {
      await mutationResult.current.mutateAsync(mutateInput)
    })

    await waitFor(() => expect(optionsResult.current.options).toEqual([STOCKED_ITEM]))
    expect(mocks.options).toHaveBeenCalledTimes(2)
  }

  it("refreshes the picker after a consumable transfer into the source", async () => {
    mocks.transferConsumable.mockResolvedValue({ success: true, message: "تم التحويل.", item: {} })
    await expectItemAppearsAfter(
      () => useTransferInventoryConsumableMutation(),
      { inventoryEntryId: "entry-1", quantity: 5, toWarehouseId: "wh-1", toProjectId: null },
    )
  })

  it("refreshes the picker after an asset transfer between locations", async () => {
    mocks.transferAsset.mockResolvedValue({
      success: true,
      message: "تم التحويل.",
      item: { asset: { id: "asset-1", currentWarehouseId: "wh-1", currentProjectId: null }, invoiceGroup: { id: "group-1" } },
    })
    await expectItemAppearsAfter(
      () => useTransferInventoryAssetMutation(),
      { assetUnitId: "asset-1", toWarehouseId: "wh-1", toProjectId: null },
    )
  })

  it("refreshes the picker after an outbound transfer consumes stock", async () => {
    mocks.createOutboundTransfer.mockResolvedValue({ success: true, message: "تم الإنشاء.", item: { id: "ot-1" } })
    await expectItemAppearsAfter(
      () => useCreateOutboundTransferMutation(),
      {
        fromType: "WAREHOUSE",
        fromId: "wh-1",
        counterpartyId: "cp-1",
        transferType: "SALE",
        items: [{ itemId: "def-1", quantity: 1 }],
      },
    )
  })

  it("refreshes the picker after a purchase receipts stock at the source", async () => {
    mocks.createInvoiceGroup.mockResolvedValue({ success: true, message: "تم إنشاء الفاتورة.", item: { group: { id: "group-1" } } })
    await expectItemAppearsAfter(
      () => useCreateInventoryInvoiceGroupMutation(),
      {
        warehouseId: "wh-1",
        entries: [
          { kind: "CONSUMABLE", itemDefinitionId: "def-1", warehouseId: "wh-1", quantity: 5, unitPriceDzd: 100, totalPriceDzd: 500 },
        ],
      },
    )
  })
})
