import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"

import { useInventoryLocationContentsQuery } from "./inventory-hooks"
import { TransferItemDialog, type TransferTarget } from "./transfer-item-dialog"

export function InventoryLocationContentsSection({ warehouseId, projectId }: { warehouseId?: string; projectId?: string }) {
  const { t } = useTranslation()
  const query = useInventoryLocationContentsQuery({ warehouseId, projectId })
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null)

  return (
    <div className="space-y-4">
      <SurfaceHeader title="العناصر الحالية" description="كل ما يوجد الآن داخل هذا الموقع مع الكميات والأصول الحالية." />

      <TransferItemDialog
        open={transferTarget !== null}
        target={transferTarget}
        onOpenChange={(open) => { if (!open) setTransferTarget(null) }}
      />

      <Surface className="p-4" variant="table">
        <h3 className="mb-3 text-sm font-semibold text-foreground">الأصول</h3>
        <div className="space-y-2">
          {query.data?.assets.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{asset.assetName}</div>
                <div className="text-muted-foreground">{asset.currentLocationLabel ?? "غير محدد"}</div>
              </div>
              <Button
                size="xs"
                variant="outline"
                className="shrink-0"
                onClick={() => setTransferTarget({
                  type: "ASSET",
                  assetUnitId: asset.id,
                  assetName: asset.assetName,
                  sourceWarehouseId: warehouseId ?? null,
                  sourceProjectId: projectId ?? null,
                })}
              >
                {t("inventory.transfer.button")}
              </Button>
            </div>
          ))}
          {query.data && query.data.assets.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أصول في هذا الموقع.</p> : null}
        </div>
      </Surface>

      <Surface className="p-4" variant="table">
        <h3 className="mb-3 text-sm font-semibold text-foreground">المواد الاستهلاكية</h3>
        <div className="space-y-2">
          {query.data?.consumables.map((balance) => (
            <div key={balance.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{balance.itemName}</div>
                <div className="text-muted-foreground">{balance.locationLabel}</div>
                <div className="text-muted-foreground">الكمية الحالية: {balance.quantity}</div>
              </div>
              <Button
                size="xs"
                variant="outline"
                className="shrink-0"
                onClick={() => setTransferTarget({
                  type: "CONSUMABLE",
                  inventoryEntryId: balance.inventoryEntryId,
                  itemName: balance.itemName,
                  availableQuantity: balance.quantity,
                  sourceWarehouseId: warehouseId ?? null,
                  sourceProjectId: projectId ?? null,
                })}
              >
                {t("inventory.transfer.button")}
              </Button>
            </div>
          ))}
          {query.data && query.data.consumables.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد مواد استهلاكية في هذا الموقع.</p> : null}
        </div>
      </Surface>
    </div>
  )
}
