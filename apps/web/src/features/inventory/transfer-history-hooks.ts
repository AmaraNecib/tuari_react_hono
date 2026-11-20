import { createORPCClient } from "@orpc/client"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import type { ExactInventoryClient } from "@tuari/contracts"

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

export type TransferHistoryItem = {
  id: string
  date: string
  type: "PURCHASE" | "INTERNAL" | "SALE" | "GIFT" | "RETURN"
  from: { type: "WAREHOUSE" | "PROJECT"; id: string; name: string } | null
  to: { type: "WAREHOUSE" | "PROJECT"; id: string; name: string } | null
  counterparty: { id: string; name: string } | null
  items: Array<{ id: string; name: string; quantity: number; type: "CONSUMABLE" | "ASSET"; priceSource: unknown }>
  totalAmountDzd: string | null
  paidAmountDzd: string | null
  remainingDebtDzd: string | null
  currency: "DZD" | null
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID" | "N/A"
  status: "COMPLETED" | "PENDING" | "CANCELLED"
  note: string | null
}

async function fetchAllHistory(input: Parameters<ExactInventoryClient["transferHistory"]>[0]) {
  const rows = []
  let offset = 0
  let total = 0
  do {
    const page = await exactHistoryClient.financial.inventory.transferHistory({ ...input, limit: 100, offset })
    rows.push(...page.items)
    total = page.total
    offset += page.items.length
  } while (offset < total)
  return { items: rows, total, offset: 0, limit: 100 }
}

export function useTransferHistoryQuery(filters: TransferHistoryFilters = {}) {
  return useWorkspaceScopedQuery({
    key: owner => transferHistoryKeys.filtered(owner, filters),
    queryFn: () => fetchAllHistory(filters),
  })
}

export function useLocationTransferHistoryQuery(
  locationId: string | undefined,
  locationType: "WAREHOUSE" | "PROJECT" | undefined,
) {
  return useWorkspaceScopedQuery({
    key: owner => transferHistoryKeys.location(owner, locationId ?? "", locationType ?? "WAREHOUSE"),
    enabled: Boolean(locationId && locationType),
    queryFn: () => fetchAllHistory(locationType === "WAREHOUSE" ? { warehouseId: locationId } : { projectId: locationId }),
  })
}
