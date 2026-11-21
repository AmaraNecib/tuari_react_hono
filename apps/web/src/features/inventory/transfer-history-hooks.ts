import { createORPCClient } from "@orpc/client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useSessionQuery } from "@/features/session/use-session-query"
import type { ExactInventoryClient, ExactInventoryHistoryRow } from "@tuari/contracts"

import { rpcLink } from "@/lib/orpc-client"

const exactHistoryClient = createORPCClient<{ financial: { inventory: ExactInventoryClient } }>(rpcLink)

const transferHistoryKeys = {
  filtered: (owner: string | null, filters: TransferHistoryFilters) => ["inventory", "transfer-history", owner, filters] as const,
  location: (owner: string | null, locationId: string, locationType: "WAREHOUSE" | "PROJECT") =>
    ["inventory", "transfer-history", owner, locationType, locationId] as const,
}

export type TransferHistoryFilters = {
  dateFrom?: string
  dateTo?: string
  locationType?: "WAREHOUSE" | "PROJECT" | "ALL"
  transferType?: "PURCHASE" | "INTERNAL" | "SALE" | "GIFT" | "RETURN" | "ALL"
  search?: string
}

export type TransferHistoryItem = ExactInventoryHistoryRow

function useHistoryPages(input: Parameters<ExactInventoryClient["transferHistory"]>[0], key: (owner: string | null) => readonly unknown[], limit: number, enabled = true) {
  const session = useSessionQuery()
  const query = useInfiniteQuery({
    queryKey: key(session.data?.user?.id ?? null),
    enabled: Boolean(session.data?.user) && enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => exactHistoryClient.financial.inventory.transferHistory({ ...input, limit, offset: pageParam }, { signal }),
    getNextPageParam: page => page.offset + page.items.length < page.total && page.items.length > 0 ? page.offset + page.items.length : undefined,
  })
  const first = query.data?.pages[0]
  return { ...query, data: first ? { ...first, items: query.data!.pages.flatMap(page => page.items) } : undefined }
}

export function useTransferHistoryQuery(filters: TransferHistoryFilters = {}) {
  return useHistoryPages(filters, owner => transferHistoryKeys.filtered(owner, filters), 50)
}

export function useLocationTransferHistoryQuery(locationId: string | undefined, locationType: "WAREHOUSE" | "PROJECT" | undefined) {
  return useHistoryPages(locationType === "WAREHOUSE" ? { warehouseId: locationId } : { projectId: locationId },
    owner => transferHistoryKeys.location(owner, locationId ?? "", locationType ?? "WAREHOUSE"), 10, Boolean(locationId && locationType))
}