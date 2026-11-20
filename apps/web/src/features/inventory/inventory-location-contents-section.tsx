import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { SurfaceHeader } from "@/features/shared/page-primitives"
import { MoneyValue } from "@/features/shared/money-value"
import { financialClient } from "@/lib/orpc-client"
import { useInventoryExternalCounterpartiesQuery, useInventoryProjectsQuery, useInventoryWarehousesQuery } from "./inventory-hooks"
import { ExactInventoryMovementForm } from "./inventory-exact-movement-form"
import { useExactInventoryAction, useExactInventoryDefinitions, useExactInventoryLocation } from "./inventory-exact-queries"
import type { ExactInventoryLocation, ExactInventoryParty } from "./inventory-exact-page"

export function InventoryLocationContentsSection({ warehouseId, projectId }: { warehouseId?: string; projectId?: string }) {
  const { t } = useTranslation()
  const location = warehouseId ? { warehouseId } : projectId ? { projectId } : null
  const contents = useExactInventoryLocation(financialClient.inventory, location)
  const definitions = useExactInventoryDefinitions(financialClient.inventory)
  const warehouses = useInventoryWarehousesQuery()
  const projects = useInventoryProjectsQuery()
  const counterparties = useInventoryExternalCounterpartiesQuery()
  const action = useExactInventoryAction(financialClient.inventory)
  const [movement, setMovement] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const historyId = useId()
  const locations: ExactInventoryLocation[] = [
    ...(warehouses.data?.items ?? []).map(row => ({ id: row.id, label: row.name, type: "WAREHOUSE" as const })),
    ...(projects.data?.items ?? []).map(row => ({ id: row.id, label: row.name, type: "PROJECT" as const })),
  ]
  const parties: ExactInventoryParty[] = (counterparties.data?.items ?? []).map(row => ({ id: row.id, label: row.fullName }))
  const source = warehouseId ? `WAREHOUSE:${warehouseId}` : `PROJECT:${projectId}`
  const context = [definitions, warehouses, projects, counterparties]
  const contextError = context.some(query => query.isError)
  const contextPending = context.some(query => query.isPending)

  return (
    <div className="space-y-6">
      <SurfaceHeader title={t("inventory.location.currentItems")} description={t("inventory.location.currentItemsDescription")} />
      {contents.isPending ? <p role="status">{t("exactCommerce.loadingStock")}</p> : contents.isError ? (
        <div role="alert">
          {t("exactCommerce.loadStockError")}
          <Button variant="outline" onClick={() => void contents.refetch()}>{t("common.retry")}</Button>
        </div>
      ) : (
        <>
          {contextError ? (
            <div role="alert">
              {t("exactCommerce.loadStockError")}
              <Button variant="outline" onClick={() => { context.forEach(query => { void query.refetch() }) }}>{t("common.retry")}</Button>
            </div>
          ) : contextPending ? <p role="status">{t("exactCommerce.loadingStock")}</p> : null}
          <Button
            disabled={contextPending || contextError || !locations.length || action.isPending}
            onClick={() => { action.reset(); setMovement(true) }}
          >
            {t("exactCommerce.movementTitle")}
          </Button>
          <div className="space-y-2">
            {contents.data?.assets.map(asset => (
              <div key={asset.id} className="rounded-lg border border-line px-4 py-3">
                <div className="font-medium">{asset.assetName}</div>
                <div className="text-muted-foreground">{asset.currentLocationLabel}</div>
                <MoneyValue exact value={asset.purchasePriceDzd} currencyLabel={t("common.currency")} />
                <Button
                  size="xs"
                  variant="ghost"
                  aria-expanded={expandedHistory === `${source}:${asset.id}`}
                  aria-controls={`${historyId}-${asset.id}`}
                  onClick={() => setExpandedHistory(current => current === `${source}:${asset.id}` ? null : `${source}:${asset.id}`)}
                >
                  {t(expandedHistory === `${source}:${asset.id}` ? "inventory.chargeHistory.hide" : "inventory.chargeHistory.show")}
                </Button>
                {/* Asset-wide history needs an exact read. Never mount retired numeric actions. */}
                {expandedHistory === `${source}:${asset.id}` && (
                  <p id={`${historyId}-${asset.id}`} role="alert" className="text-sm text-destructive">{t("inventory.chargeHistory.loadError")}</p>
                )}
              </div>
            ))}
            {contents.data?.consumables.map(row => (
              <div key={row.id} className="rounded-lg border border-line px-4 py-3">
                <div className="font-medium">{row.itemName}</div>
                <div>{t("inventory.location.currentQuantity")} <bdi>{row.quantity}</bdi></div>
                <div className="text-muted-foreground">{row.locationLabel}</div>
              </div>
            ))}
            {contents.data && !contents.data.assets.length && !contents.data.consumables.length && <p>{t("exactCommerce.noStock")}</p>}
          </div>
        </>
      )}
      {movement && contents.data && !contextError && !contextPending && (
        <ExactInventoryMovementForm
          key={source}
          client={financialClient.inventory}
          contents={contents.data}
          definitions={definitions.data ?? []}
          locations={locations}
          parties={parties}
          source={source}
          pending={action.isPending}
          error={action.isError ? t("exactCommerce.commandError") : null}
          close={() => setMovement(false)}
          submit={async command => { await action.mutateAsync(command) }}
        />
      )}
    </div>
  )
}
