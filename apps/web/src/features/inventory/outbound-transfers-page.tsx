/**
 * Outbound transfers listing page.
 */
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { useOutboundTransfersQuery } from "./inventory-hooks"

/**
 * @description Component
 */
export function OutboundTransfersPage({ onCreate, onCreateV2 }: { onCreate: () => void; onCreateV2?: () => void }) {
  const { t } = useTranslation()
  const transfersQuery = useOutboundTransfersQuery()

  const transfers = transfersQuery.data?.items ?? []
  const isLoading = transfersQuery.isLoading

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
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("inventoryPage.transfers.loading")}</p>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("inventoryPage.transfers.empty")}</p>
              <Button size="sm" onClick={onCreate}>{t("inventoryPage.transfers.createButton")}</Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {transfers.map((transfer) => (
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
