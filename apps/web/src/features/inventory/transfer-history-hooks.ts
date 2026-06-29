/**
 * Transfer history hooks for fetching and managing transfer logs.
 */
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { rpcClient } from "@/lib/orpc-client"

const transferHistoryKeys = {
  all: ["inventory", "transfer-history"] as const,
  filtered: (filters: TransferHistoryFilters) => ["inventory", "transfer-history", filters] as const,
  location: (locationId: string, locationType: "WAREHOUSE" | "PROJECT") =>
    ["inventory", "transfer-history", locationType, locationId] as const,
}

export type TransferHistoryFilters = {
  dateFrom?: string
  dateTo?: string
  locationType?: "WAREHOUSE" | "PROJECT" | "ALL"
  transferType?: "INTERNAL" | "SALE" | "GIFT" | "RETURN" | "ALL"
  search?: string
}

export type TransferHistoryItem = {
  id: string
  date: string
  type: "INTERNAL" | "SALE" | "GIFT" | "RETURN"
  from: {
    type: "WAREHOUSE" | "PROJECT"
    id: string
    name: string
  } | null
  to: {
    type: "WAREHOUSE" | "PROJECT"
    id: string
    name: string
  } | null
  counterparty?: {
    id: string
    name: string
  } | null
  items: Array<{
    id: string
    name: string
    quantity: number
    type: "CONSUMABLE" | "ASSET"
  }>
  totalAmount?: number
  paidAmount?: number
  remainingDebt?: number
  paymentStatus?: "PAID" | "PARTIAL" | "UNPAID" | "N/A"
  status: "COMPLETED" | "PENDING" | "CANCELLED"
  note?: string
}

/**
 * Fetches transfer history with optional filters.
 */
export function useTransferHistoryQuery(filters: TransferHistoryFilters = {}) {
  const { t } = useTranslation()
  return useQuery({
    queryKey: transferHistoryKeys.filtered(filters),
    queryFn: async (): Promise<{ items: TransferHistoryItem[] }> => {
      const result = await rpcClient.inventoryTransferHistoryList(filters)
      // Map InventoryMovement to TransferHistoryItem
      const items: TransferHistoryItem[] = (result.items ?? []).map((movement: any) => ({
        id: movement.id,
        date: movement.occurredAt,
        type: movement.movementType === "OUTBOUND_SALE" ? "SALE" : "INTERNAL",
        from: movement.fromWarehouseId ? { type: "WAREHOUSE" as const, id: movement.fromWarehouseId, name: movement.fromWarehouseId } : 
               movement.fromProjectId ? { type: "PROJECT" as const, id: movement.fromProjectId, name: movement.fromProjectId } : null,
        to: movement.toWarehouseId ? { type: "WAREHOUSE" as const, id: movement.toWarehouseId, name: movement.toWarehouseId } : 
            movement.toProjectId ? { type: "PROJECT" as const, id: movement.toProjectId, name: movement.toProjectId } : null,
        counterparty: null,
        items: [{
          id: movement.inventoryEntryId ?? movement.assetUnitId ?? movement.id,
          name: movement.itemType === "CONSUMABLE" ? t("inventory.type.consumable", "مادة استهلاكية") : t("inventory.type.asset", "أصل"),
          quantity: movement.quantity,
          type: movement.itemType,
        }],
        totalAmount: undefined,
        paidAmount: undefined,
        remainingDebt: undefined,
        paymentStatus: "N/A" as const,
        status: "COMPLETED" as const,
        note: movement.note,
      }))
      return { items }
    },
  })
}

/**
 * Fetches transfer history for a specific location.
 */
export function useLocationTransferHistoryQuery(
  locationId: string | undefined,
  locationType: "WAREHOUSE" | "PROJECT" | undefined
) {
  const { t } = useTranslation()
  return useQuery({
    queryKey: transferHistoryKeys.location(locationId ?? "", locationType ?? "WAREHOUSE"),
    enabled: Boolean(locationId && locationType),
    queryFn: async (): Promise<{ items: TransferHistoryItem[] }> => {
      const input = locationType === "WAREHOUSE"
        ? { warehouseId: locationId }
        : { projectId: locationId }
      const result = await rpcClient.inventoryTransferHistoryList(input)
      // Map InventoryMovement to TransferHistoryItem
      const items: TransferHistoryItem[] = (result.items ?? []).map((movement: any) => ({
        id: movement.id,
        date: movement.occurredAt,
        type: movement.movementType === "OUTBOUND_SALE" ? "SALE" : "INTERNAL",
        from: movement.fromWarehouseId ? { type: "WAREHOUSE" as const, id: movement.fromWarehouseId, name: movement.fromWarehouseId } : 
               movement.fromProjectId ? { type: "PROJECT" as const, id: movement.fromProjectId, name: movement.fromProjectId } : null,
        to: movement.toWarehouseId ? { type: "WAREHOUSE" as const, id: movement.toWarehouseId, name: movement.toWarehouseId } : 
            movement.toProjectId ? { type: "PROJECT" as const, id: movement.toProjectId, name: movement.toProjectId } : null,
        counterparty: null,
        items: [{
          id: movement.inventoryEntryId ?? movement.assetUnitId ?? movement.id,
          name: movement.itemType === "CONSUMABLE" ? t("inventory.type.consumable", "مادة استهلاكية") : t("inventory.type.asset", "أصل"),
          quantity: movement.quantity,
          type: movement.itemType,
        }],
        totalAmount: undefined,
        paidAmount: undefined,
        remainingDebt: undefined,
        paymentStatus: "N/A" as const,
        status: "COMPLETED" as const,
        note: movement.note,
      }))
      return { items }
    },
  })
}
