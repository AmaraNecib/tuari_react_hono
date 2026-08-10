/**
 * Transfer history page with filters for viewing all inventory movements.
 * Shows internal transfers, sales, gifts, and returns.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { PageHeader, PageSurfaceContent, Surface, SurfaceHeader, StatBand } from "@/features/shared/page-primitives"
import { useTransferHistoryQuery, type TransferHistoryFilters, type TransferHistoryItem } from "./transfer-history-hooks"

/** formatDate - helper function. */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** formatCurrency - helper function. */
function formatCurrency(amount: number): string {
  return amount.toLocaleString("ar-DZ")
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

/** getPaymentStatusLabel - helper function. */
function getPaymentStatusLabel(status: TransferHistoryItem["paymentStatus"]): string {
  const labels: Record<string, string> = {
    PAID: "مدفوع",
    PARTIAL: "جزئي",
    UNPAID: "غير مدفوع",
    "N/A": "—",
  }
  return labels[status ?? "N/A"] ?? "—"
}

/** getPaymentStatusColor - helper function. */
function getPaymentStatusColor(status: TransferHistoryItem["paymentStatus"]): string {
  const colors: Record<string, string> = {
    PAID: "text-good",
    PARTIAL: "text-warn",
    UNPAID: "text-bad",
    "N/A": "text-ink-4",
  }
  return colors[status ?? "N/A"] ?? "text-ink-4"
}

/**
 * @description Component
 */
export function TransferHistoryPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<TransferHistoryFilters>({})
  const transfersQuery = useTransferHistoryQuery(filters)

  const transfers = transfersQuery.data?.items ?? []
  const isLoading = transfersQuery.isLoading

  const updateFilter = (key: keyof TransferHistoryFilters, value: string | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))
  }

  // Calculate summary stats
  const totalTransfers = transfers.length
  const totalSales = transfers.filter((t) => t.type === "SALE").length
  const totalInternal = transfers.filter((t) => t.type === "INTERNAL").length
  const totalValue = transfers.reduce((sum, t) => sum + (t.totalAmount ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader
            title={t("inventory.transferHistory.title")}
            description={t("inventory.transferHistory.description")}
          />
        </PageSurfaceContent>
      </Surface>

      {/* Summary Stats */}
      <Surface variant="panel">
        <StatBand
          stats={[
            {
              label: t("inventory.transferHistory.totalTransfers"),
              value: totalTransfers,
            },
            {
              label: t("inventory.transferHistory.totalSales"),
              value: totalSales,
            },
            {
              label: t("inventory.transferHistory.totalInternal"),
              value: totalInternal,
            },
            {
              label: t("inventory.transferHistory.totalValue"),
              value: `${formatCurrency(totalValue)} دج`,
            },
          ]}
        />
      </Surface>

      {/* Filters */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader
            title={t("inventory.transferHistory.filters")}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transferHistory.dateFrom")}</span>
              <Input
                type="date"
                value={filters.dateFrom ?? ""}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transferHistory.dateTo")}</span>
              <Input
                type="date"
                value={filters.dateTo ?? ""}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transferHistory.locationType")}</span>
              <NativeSelect
                value={filters.locationType ?? "ALL"}
                onChange={(e) => updateFilter("locationType", e.target.value === "ALL" ? undefined : e.target.value)}
              >
                <option value="ALL">{t("inventory.transferHistory.allLocations")}</option>
                <option value="WAREHOUSE">{t("inventory.transfer.warehouse")}</option>
                <option value="PROJECT">{t("inventory.transfer.project")}</option>
              </NativeSelect>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transferHistory.transferType")}</span>
              <NativeSelect
                value={filters.transferType ?? "ALL"}
                onChange={(e) => updateFilter("transferType", e.target.value === "ALL" ? undefined : e.target.value)}
              >
                <option value="ALL">{t("inventory.transferHistory.allTypes")}</option>
                <option value="INTERNAL">{t("inventory.transferHistory.internal")}</option>
                <option value="SALE">{t("inventory.transfer.typeSale")}</option>
                <option value="GIFT">{t("inventory.transfer.typeGift")}</option>
                <option value="RETURN">{t("inventory.transfer.typeReturn")}</option>
              </NativeSelect>
            </label>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="flex-1 space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transferHistory.search")}</span>
              <Input
                type="text"
                placeholder={t("inventory.transferHistory.searchPlaceholder")}
                value={filters.search ?? ""}
                onChange={(e) => updateFilter("search", e.target.value)}
              />
            </label>
            <div className="flex items-center gap-2 pt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({})}
              >
                {t("inventory.transferHistory.clearFilters")}
              </Button>
              <span className="text-sm text-ink-4">
                {totalTransfers} نتيجة
              </span>
            </div>
          </div>
        </PageSurfaceContent>
      </Surface>

      {/* Transfer List */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader
            title={t("inventory.transferHistory.list")}
            description={t("inventory.transferHistory.listDescription")}
          />

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("common.loading", "جارٍ التحميل...")}
            </div>
          ) : transfers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("inventory.transferHistory.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map((transfer) => (
                <TransferHistoryItem key={transfer.id} transfer={transfer} />
              ))}
            </div>
          )}
        </PageSurfaceContent>
      </Surface>
    </div>
  )
}

/** TransferHistoryItem - helper function. */
function TransferHistoryItem({ transfer }: { transfer: TransferHistoryItem }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-line/70 p-4 text-sm space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-4">#{transfer.id.slice(-8)}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getTransferTypeColor(transfer.type)}`}>
            {getTransferTypeLabel(transfer.type)}
          </span>
        </div>
        <span className="text-xs text-ink-4">{formatDate(transfer.date)}</span>
      </div>

      {/* Route */}
      <div className="flex items-center gap-2 text-sm">
        {transfer.from ? (
          <a
            href={transfer.from.type === "WAREHOUSE" ? `/warehouses/${transfer.from.id}` : `/projects/${transfer.from.id}`}
            className="text-primary hover:underline"
          >
            {transfer.from.type === "WAREHOUSE" ? "مستودع" : "مشروع"}: {transfer.from.name}
          </a>
        ) : (
          <span className="text-ink-4">—</span>
        )}
        <span className="text-ink-4">→</span>
        {transfer.to ? (
          <a
            href={transfer.to.type === "WAREHOUSE" ? `/warehouses/${transfer.to.id}` : `/projects/${transfer.to.id}`}
            className="text-primary hover:underline"
          >
            {transfer.to.type === "WAREHOUSE" ? "مستودع" : "مشروع"}: {transfer.to.name}
          </a>
        ) : transfer.counterparty ? (
          <span className="text-ink-3">{transfer.counterparty.name}</span>
        ) : (
          <span className="text-ink-4">—</span>
        )}
      </div>

      {/* Items */}
      {transfer.items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {transfer.items.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-md bg-bg-2 px-2 py-1 text-xs"
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-ink-4">×{item.quantity}</span>
            </span>
          ))}
        </div>
      )}

      {/* Payment Info (for sales) */}
      {transfer.type === "SALE" && transfer.totalAmount !== undefined && (
        <div className="flex items-center justify-between border-t border-line/50 pt-3">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-xs text-ink-4">{t("inventory.transferHistory.total")}</span>
              <span className="ms-2 font-medium tabular-nums">{formatCurrency(transfer.totalAmount)} دج</span>
            </div>
            {transfer.paidAmount !== undefined && transfer.paidAmount > 0 && (
              <div>
                <span className="text-xs text-ink-4">{t("inventory.transferHistory.paid")}</span>
                <span className="ms-2 font-medium tabular-nums text-good">{formatCurrency(transfer.paidAmount)} دج</span>
              </div>
            )}
            {transfer.remainingDebt !== undefined && transfer.remainingDebt > 0 && (
              <div>
                <span className="text-xs text-ink-4">{t("inventory.transferHistory.debt")}</span>
                <span className="ms-2 font-medium tabular-nums text-warn">{formatCurrency(transfer.remainingDebt)} دج</span>
              </div>
            )}
          </div>
          <span className={`text-xs font-medium ${getPaymentStatusColor(transfer.paymentStatus)}`}>
            {getPaymentStatusLabel(transfer.paymentStatus)}
          </span>
        </div>
      )}

      {/* Note */}
      {transfer.note && (
        <p className="text-xs text-ink-4 border-t border-line/50 pt-2">{transfer.note}</p>
      )}
    </div>
  )
}
