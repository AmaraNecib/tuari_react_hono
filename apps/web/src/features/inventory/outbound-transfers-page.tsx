/**
 * Outbound transfers listing page.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { AdvancedSearchBar, type QuickFilter } from "@/features/shared/advanced-search-bar"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { useOutboundTransfersQuery } from "./inventory-hooks"

/**
 * @description Component
 */
export function OutboundTransfersPage({ onCreate, onCreateV2 }: { onCreate: () => void; onCreateV2?: () => void }) {
  const { t } = useTranslation()
  const transfersQuery = useOutboundTransfersQuery()
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<Record<string, unknown>>({})

  const transferType = (filters.transferType as string | undefined) ?? null
  const isLoading = transfersQuery.isLoading
  const normalizedQuery = query.trim().toLowerCase()
  const hasActiveFilters = normalizedQuery.length > 0 || transferType !== null

  const quickFilters: QuickFilter[] = useMemo(
    () => [
      {
        id: "sale",
        label: t("inventoryPage.transfers.typeSale", "بيع"),
        filters: { transferType: "SALE" },
      },
      {
        id: "gift",
        label: t("inventoryPage.transfers.typeGift", "هدية"),
        filters: { transferType: "GIFT" },
      },
      {
        id: "return",
        label: t("inventoryPage.transfers.typeReturn", "إرجاع"),
        filters: { transferType: "RETURN" },
      },
    ],
    [t]
  )

  const filteredTransfers = useMemo(() => {
    const source = transfersQuery.data?.items ?? []
    let result = source
    if (normalizedQuery) {
      result = result.filter((transfer) =>
        [transfer.counterpartyId, transfer.fromId, transfer.notes ?? ""]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedQuery))
      )
    }
    if (transferType) {
      result = result.filter((transfer) => transfer.transferType === transferType)
    }
    return result
  }, [transfersQuery.data?.items, normalizedQuery, transferType])

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title={t("inventoryPage.transfers.title")} description={t("inventoryPage.transfers.description")} action={<PageActionGroup><Button variant="outline" onClick={onCreateV2}>النسخة الجديدة (V2)</Button><Button onClick={onCreate}>{t("inventoryPage.transfers.createButton")}</Button></PageActionGroup>} />
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title={t("inventoryPage.transfers.listTitle")} description={t("inventoryPage.transfers.listDescription")} />
          <AdvancedSearchBar
            onSearch={(searchQuery, filtersObj) => {
              setQuery(searchQuery)
              setFilters(filtersObj)
            }}
            storageKey="outbound-transfers-search-filters"
            quickFilters={quickFilters}
          />
          {isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("inventoryPage.transfers.loading")}</p>
          ) : filteredTransfers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? t("search.noResults")
                  : t("inventoryPage.transfers.empty")}
              </p>
              {!hasActiveFilters ? (
                <Button size="sm" onClick={onCreate}>{t("inventoryPage.transfers.createButton")}</Button>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 grid gap-3">
              {filteredTransfers.map((transfer) => (
                <div key={transfer.id} className="rounded-xl border border-border/70 p-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-foreground">
                        {transfer.counterpartyId}
                      </div>
                      <div className="text-muted-foreground">
                        {t("inventoryPage.transfers.fromLabel", "من")} {transfer.fromType === "WAREHOUSE" ? t("inventoryPage.transfers.fromWarehouse") : t("inventoryPage.transfers.fromProject")}: {transfer.fromId}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-medium text-foreground">
                        {transfer.transferType === "SALE" ? t("inventoryPage.transfers.typeSale") : transfer.transferType === "GIFT" ? t("inventoryPage.transfers.typeGift") : t("inventoryPage.transfers.typeReturn")}
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(transfer.transferDate).toLocaleDateString("ar-DZ")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageSurfaceContent>
      </Surface>
    </div>
  )
}
