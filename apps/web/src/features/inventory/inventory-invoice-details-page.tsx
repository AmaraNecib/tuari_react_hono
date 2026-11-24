import { i18n as featureI18n } from "@/i18n"
import { AppDate } from "@/components/app-date"
import { CurrencyRun } from "@/features/shared/money-value"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { LoadErrorSurface } from "@/features/shared/load-error-surface"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { downloadDesktopApiFile } from "@/lib/desktop-api-bridge"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { resolveApiUrl } from "@/lib/runtime-config"

import { AssetChargeHistory } from "./asset-charge-history"
import { useInventoryInvoiceGroupQuery } from "./inventory-hooks"
import { RecordInvoicePaymentDialog } from "./record-invoice-payment-dialog"
import { TransferItemDialog, type TransferTarget } from "./transfer-item-dialog"

/** buildLocationHref - helper function. */
function buildLocationHref(location: { warehouseId?: string | null; projectId?: string | null }) {
  if (location.warehouseId) {
    return `/warehouses/${encodeURIComponent(location.warehouseId)}?tab=items`
  }

  if (location.projectId) {
    return `/projects/${encodeURIComponent(location.projectId)}?tab=items`
  }

  return null
}

/** Invoice detail page with item list and payment recording. */
/**
 * @description Component
 */
export function InventoryInvoiceDetailsPage({ invoiceId, onBack }: { invoiceId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const invoiceQuery = useInventoryInvoiceGroupQuery(invoiceId)
  // The destination lists live inside `TransferItemDialog`, which enables them
  // only while it is open. The page itself must not fetch them eagerly: a fixed
  // two-list fetch on every invoice open is pure waste until a transfer starts
  // (#422 round 6).
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)

  const detail = invoiceQuery.data
  const isDesktop = isDesktopRuntime()

  async function handleAttachmentOpen(attachment: { id: string; originalName: string }) {
    await downloadDesktopApiFile(resolveApiUrl(`/api/inventory/attachments/${attachment.id}`), attachment.originalName)
  }

  // Error surface (issue #34): when the invoice-group query errored (invalid
  // or 404 id) or settled without data, replace the page instead of showing
  // the loading line forever. Pending still renders the loader below.
  if (!invoiceQuery.isPending && (invoiceQuery.isError || !detail)) {
    return (
      <LoadErrorSurface
        message={t("detailPages.invoice.loadError")}
        retryLabel={t("common.retry")}
        onRetry={() => void invoiceQuery.refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <TransferItemDialog
        open={transferTarget !== null}
        target={transferTarget}
        onOpenChange={(open) => { if (!open) setTransferTarget(null) }}
      />

      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title={detail?.group.invoiceNumber || featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.title")} description={detail?.group.supplierName || featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.noSupplier")} action={<PageActionGroup><Button variant="outline" onClick={onBack}>{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.back")}</Button>{detail && detail.group.remainingDebtDzd > 0 && <Button onClick={() => setPaymentDialogOpen(true)}>{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.recordPayment")}</Button>}</PageActionGroup>} />
          {detail ? (
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/70 p-4">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.invoiceDate")}{detail.group.invoiceDate ? <AppDate value={detail.group.invoiceDate} /> : featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.unspecified")}</div>
              <div className="rounded-xl border border-border/70 p-4">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.total")}<CurrencyRun amount={detail.group.grossTotalDzd.toFixed(2)} currencyLabel={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.currency")} /></div>
              <div className="rounded-xl border border-border/70 p-4">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.paid")}<CurrencyRun amount={detail.group.paidAmountDzd.toFixed(2)} currencyLabel={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.currency")} /></div>
              <div className="rounded-xl border border-border/70 p-4">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.remainingDebt")}<CurrencyRun amount={detail.group.remainingDebtDzd.toFixed(2)} currencyLabel={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.currency")} /></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.loading")}</p>}
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.items")} description={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.itemsDescription")} />
          <div className="grid gap-4">
            {detail?.entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border/70 p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-medium text-foreground">{entry.itemName}</div>
                  <div className="text-muted-foreground">{entry.itemType === "CONSUMABLE" ? featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.quantity", { value1: entry.quantity, value2: entry.unit ?? "" }) : featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.assetCount", { value1: entry.assets.length })}</div>
                </div>
                <div className="mt-2 text-muted-foreground">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.total")}<CurrencyRun amount={entry.totalPriceDzd.toFixed(2)} currencyLabel={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.currency")} /></div>

                {entry.assets.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {entry.assets.map((asset) => {
                      const href = buildLocationHref({ warehouseId: asset.currentWarehouseId, projectId: asset.currentProjectId })

                      return (
                        <div key={asset.id} className="rounded-xl bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{asset.assetName}</div>
                              <div className="text-xs text-muted-foreground">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.currentLocation")}{asset.currentLocationLabel ?? featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.unspecified")}</div>
                              {/* The unit stays reachable here after a sale, a
                                  gift or a return clears its location, so its
                                  charge history and correction stay available
                                  (#422 round 6). */}
                              <AssetChargeHistory assetUnitId={asset.id} />
                            </div>
                            {href ? <a className="text-xs text-primary underline-offset-4 hover:underline" href={href}>{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.openLocation")}</a> : null}
                          </div>

                          <div className="mt-3">
                            {/* The transfer dialog asks for the placement charge when
                                the destination is a project (#413); a warehouse
                                transfer writes none. */}
                            <Button variant="outline" onClick={() => setTransferTarget({ type: "ASSET", assetUnitId: asset.id, assetName: asset.assetName })}>{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.transferAsset")}</Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.balances")} description={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.balancesDescription")} />
          <div className="grid gap-3">
            {detail?.consumableBalances.map((balance) => {
              const href = buildLocationHref({ warehouseId: balance.warehouseId, projectId: balance.projectId })
              return (
                <div key={balance.id} className="rounded-xl border border-border/70 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">{balance.itemName}</div>
                      <div className="text-muted-foreground">{balance.locationLabel}</div>
                      <div className="text-muted-foreground">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.availableQuantity")}{balance.quantity}</div>
                    </div>
                    {href ? <a className="text-xs text-primary underline-offset-4 hover:underline" href={href}>{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.openLocation")}</a> : null}
                  </div>
                  {/* One transfer entry point: the shared dialog enables the
                      destination lists only while it is open (#422 round 6). */}
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      onClick={() => setTransferTarget({
                        type: "CONSUMABLE",
                        inventoryEntryId: balance.inventoryEntryId,
                        itemName: balance.itemName,
                        availableQuantity: balance.quantity,
                        sourceWarehouseId: balance.warehouseId,
                        sourceProjectId: balance.projectId,
                      })}
                    >
                      {featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.transferQuantity")}</Button>
                  </div>
                </div>
              )
            })}
            {detail && detail.consumableBalances.length === 0 ? <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.emptyBalances")}</p> : null}
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.history")} description={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.historyDescription")} />
          <div className="grid gap-2">
            {detail?.movements.map((movement) => (
              <div key={movement.id} className="rounded-xl border border-border/70 px-4 py-3 text-sm">
                <div className="font-medium text-foreground">{movement.movementType === "PURCHASE" ? featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.purchase") : featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.transfer")} - {movement.itemType === "ASSET" ? featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.asset") : featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.consumable")}</div>
                <div className="text-muted-foreground">{<AppDate value={movement.occurredAt} includeTime timeStyle="medium" />}</div>
              </div>
            ))}
            {detail && detail.movements.length === 0 ? <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.emptyHistory")}</p> : null}
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.files")} description={featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.filesDescription")} />
          <div className="grid gap-3">
            {detail?.attachments.map((attachment) => (
              isDesktop ? (
                <button
                  key={attachment.id}
                  className="rounded-xl border border-border/70 px-4 py-3 text-start text-sm transition hover:bg-muted/30"
                  type="button"
                  onClick={() => void handleAttachmentOpen(attachment)}
                >
                  {attachment.originalName}
                </button>
              ) : (
                <a key={attachment.id} className="rounded-xl border border-border/70 px-4 py-3 text-sm transition hover:bg-muted/30" href={resolveApiUrl(`/api/inventory/attachments/${attachment.id}`)} rel="noreferrer" target="_blank">
                  {attachment.originalName}
                </a>
              )
            ))}
            {detail && detail.attachments.length === 0 ? <p className="text-sm text-muted-foreground">{featureI18n.t("featureCopy.inventoryInvoiceDetailsPage.emptyFiles")}</p> : null}
          </div>
        </PageSurfaceContent>
      </Surface>

      <RecordInvoicePaymentDialog invoiceDetail={detail ?? null} open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} onSuccess={() => invoiceQuery.refetch()} />
    </div>
  )
}
