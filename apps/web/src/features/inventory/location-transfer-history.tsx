/**
 * Location-level transfer history component.
 * Embeddable in warehouse/project detail pages to show transfers for that location.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { SurfaceHeader } from "@/features/shared/page-primitives"
import { useLocationTransferHistoryQuery, type TransferHistoryItem } from "./transfer-history-hooks"

/** formatDate - helper function. */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** getTransferTypeLabel - helper function. */
function getTransferTypeLabel(type: TransferHistoryItem["type"]): string {
  const labels: Record<string, string> = {
    INTERNAL: "تحويل داخلي",
    SALE: "بيع",
    GIFT: "هدية",
    RETURN: "مرتجع",
  }
  return labels[type] ?? type
}

/** getTransferTypeColor - helper function. */
function getTransferTypeColor(type: TransferHistoryItem["type"]): string {
  const colors: Record<string, string> = {
    INTERNAL: "bg-ink/10 text-ink",
    SALE: "bg-good/10 text-good",
    GIFT: "bg-primary/10 text-primary",
    RETURN: "bg-warn/10 text-warn",
  }
  return colors[type] ?? "bg-ink/10 text-ink"
}

/** getMovementDirection - helper function. */
function getMovementDirection(
  transfer: TransferHistoryItem,
  locationId: string,
  locationType: "WAREHOUSE" | "PROJECT"
): "INCOMING" | "OUTGOING" | "BETWEEN" {
  const isFrom =
    transfer.from?.id === locationId && transfer.from?.type === locationType
  const isTo =
    transfer.to?.id === locationId && transfer.to?.type === locationType

  if (isFrom && isTo) return "BETWEEN"
  if (isFrom) return "OUTGOING"
  if (isTo) return "INCOMING"
  return "BETWEEN"
}

/** getMovementLabel - helper function. */
function getMovementLabel(direction: "INCOMING" | "OUTGOING" | "BETWEEN"): string {
  const labels: Record<string, string> = {
    INCOMING: "وارد",
    OUTGOING: "صادر",
    BETWEEN: "—",
  }
  return labels[direction] ?? "—"
}

/** getMovementColor - helper function. */
function getMovementColor(direction: "INCOMING" | "OUTGOING" | "BETWEEN"): string {
  const colors: Record<string, string> = {
    INCOMING: "text-good",
    OUTGOING: "text-warn",
    BETWEEN: "text-ink-3",
  }
  return colors[direction] ?? "text-ink-3"
}

type LocationTransferHistoryProps = {
  locationId: string
  locationType: "WAREHOUSE" | "PROJECT"
}

/**
 * @description Component
 */
export function LocationTransferHistory({ locationId, locationType }: LocationTransferHistoryProps) {
  const { t } = useTranslation()
  const [limit, setLimit] = useState(10)
  const transfersQuery = useLocationTransferHistoryQuery(locationId, locationType)

  const transfers = transfersQuery.data?.items ?? []
  const isLoading = transfersQuery.isLoading

  // Limit displayed transfers
  const displayedTransfers = transfers.slice(0, limit)
  const hasMore = transfers.length > limit

  return (
    <div className="space-y-4">
      <SurfaceHeader
        title={t("inventory.transferHistory.locationTitle", "سجل التحويلات")}
        description={t("inventory.transferHistory.locationDescription", "آخر التحويلات لهذا الموقع")}
      />

      {isLoading ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {t("common.loading", "جارٍ التحميل...")}
        </div>
      ) : transfers.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {t("inventory.transferHistory.noTransfers", "لا توجد تحويلات لهذا الموقع")}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {displayedTransfers.map((transfer) => (
              <LocationTransferItem
                key={transfer.id}
                transfer={transfer}
                locationId={locationId}
                locationType={locationType}
              />
            ))}
          </div>

          {hasMore && (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLimit((prev) => prev + 10)}
              >
                {t("inventory.transferHistory.showMore", "عرض المزيد")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** LocationTransferItem - helper function. */
function LocationTransferItem({
  transfer,
  locationId,
  locationType,
}: {
  transfer: TransferHistoryItem
  locationId: string
  locationType: "WAREHOUSE" | "PROJECT"
}) {
  const direction = getMovementDirection(transfer, locationId, locationType)

  // Determine the other location
  const isFrom =
    transfer.from?.id === locationId && transfer.from?.type === locationType
  const otherLocation = isFrom ? transfer.to : transfer.from
  const counterparty = transfer.counterparty

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line/50 px-3 py-2 text-sm">
      {/* Direction indicator */}
      <span className={`text-xs font-medium ${getMovementColor(direction)}`}>
        {getMovementLabel(direction)}
      </span>

      {/* Date */}
      <span className="text-xs text-ink-4 min-w-[80px]">{formatDate(transfer.date)}</span>

      {/* Type badge */}
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getTransferTypeColor(transfer.type)}`}>
        {getTransferTypeLabel(transfer.type)}
      </span>

      {/* Items summary */}
      <div className="flex-1 min-w-0">
        <div className="truncate">
          {transfer.items.map((item) => item.name).join("، ")}
        </div>
      </div>

      {/* Other location or counterparty */}
      <div className="text-xs text-ink-4 text-start">
        {otherLocation ? (
          <span>
            {otherLocation.type === "WAREHOUSE" ? "مستودع" : "مشروع"}: {otherLocation.id}
          </span>
        ) : counterparty ? (
          <span>{counterparty.name}</span>
        ) : null}
      </div>

      {/* Amount (for sales) */}
      {transfer.totalAmount !== undefined && (
        <span className="text-xs font-medium tabular-nums min-w-[80px] text-start">
          {transfer.totalAmount.toLocaleString("ar-DZ")} دج
        </span>
      )}
    </div>
  )
}
