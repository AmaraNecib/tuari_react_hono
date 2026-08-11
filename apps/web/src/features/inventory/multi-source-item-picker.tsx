/**
 * Multi-source item picker for selecting items from different locations.
 * Allows users to pick items from warehouses and projects in a single transfer.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { SurfaceHeader } from "@/features/shared/page-primitives"
import { useInventoryWarehousesQuery, useInventoryProjectsQuery, useInventoryLocationContentsQuery } from "./inventory-hooks"

export type SelectedItem = {
  itemId: string
  itemName: string
  itemType: "CONSUMABLE" | "ASSET"
  sourceType: "WAREHOUSE" | "PROJECT"
  sourceId: string
  sourceName: string
  quantity: number
  maxQuantity: number
  unitPrice: number
}

type MultiSourceItemPickerProps = {
  items: SelectedItem[]
  onItemsChange: (items: SelectedItem[]) => void
}

/** MultiSourceItemPicker component. */
export function MultiSourceItemPicker({ items, onItemsChange }: MultiSourceItemPickerProps) {
  const { t } = useTranslation()
  const warehousesQuery = useInventoryWarehousesQuery()
  const projectsQuery = useInventoryProjectsQuery()

  const [sourceType, setSourceType] = useState<"WAREHOUSE" | "PROJECT">("WAREHOUSE")
  const [sourceId, setSourceId] = useState("")

  const warehouses = warehousesQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []
  const sourceOptions = sourceType === "WAREHOUSE" ? warehouses : projects

  // Fetch contents of selected source
  const sourceContentsQuery = useInventoryLocationContentsQuery({
    warehouseId: sourceType === "WAREHOUSE" ? sourceId : undefined,
    projectId: sourceType === "PROJECT" ? sourceId : undefined,
  })

  const availableAssets = (sourceContentsQuery.data?.assets ?? []).map((asset) => ({
    id: asset.id,
    name: asset.assetName,
    type: "ASSET" as const,
    quantity: 1,
    locationLabel: asset.currentLocationLabel ?? "",
  }))

  const availableConsumables = (sourceContentsQuery.data?.consumables ?? []).map((balance) => ({
    id: balance.inventoryEntryId,
    name: balance.itemName,
    type: "CONSUMABLE" as const,
    quantity: balance.quantity,
    locationLabel: balance.locationLabel,
  }))

  const availableItems = [...availableAssets, ...availableConsumables]

  const addItem = (itemId: string) => {
    const item = availableItems.find((i) => i.id === itemId)
    if (!item || !sourceId) return

    // Check if already added from this source
    const exists = items.find(
      (i) => i.itemId === item.id && i.sourceId === sourceId && i.sourceType === sourceType
    )
    if (exists) return

    const sourceName = sourceOptions.find((s) => s.id === sourceId)?.name ?? ""

    onItemsChange([
      ...items,
      {
        itemId: item.id,
        itemName: item.name,
        itemType: item.type,
        sourceType,
        sourceId,
        sourceName,
        quantity: 1,
        maxQuantity: item.quantity,
        unitPrice: 0,
      },
    ])
  }

  const removeItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index))
  }

  const updateItemQuantity = (index: number, quantity: number) => {
    const newItems = [...items]
    const item = newItems[index]
    if (item) {
      newItems[index] = { ...item, quantity: Math.min(Math.max(1, quantity), item.maxQuantity) }
      onItemsChange(newItems)
    }
  }

  const updateItemPrice = (index: number, price: number) => {
    const newItems = [...items]
    const item = newItems[index]
    if (item) {
      newItems[index] = { ...item, unitPrice: Math.max(0, price) }
      onItemsChange(newItems)
    }
  }

  const updateItemTotal = (index: number, total: number) => {
    const newItems = [...items]
    const item = newItems[index]
    if (item && item.quantity > 0) {
      newItems[index] = { ...item, unitPrice: Math.max(0, total / item.quantity) }
      onItemsChange(newItems)
    }
  }

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  return (
    <div className="space-y-4">
      <SurfaceHeader
        title={t("inventory.transfer.selectItems")}
        description={t("inventory.transfer.selectItemsDescription")}
      />

      {/* Source selection */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">{t("inventory.transfer.sourceType")}</span>
          <NativeSelect
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value as "WAREHOUSE" | "PROJECT")
              setSourceId("")
            }}
          >
            <option value="WAREHOUSE">{t("inventory.transfer.warehouse")}</option>
            <option value="PROJECT">{t("inventory.transfer.project")}</option>
          </NativeSelect>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium">{t("inventory.transfer.source")}</span>
          <NativeSelect
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">{t("inventory.transfer.selectSource")}</option>
            {sourceOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </NativeSelect>
        </label>
      </div>

      {/* Available items */}
      {sourceId && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-3">
            {t("inventory.transfer.availableItems")}
          </p>
          {availableItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("inventory.transfer.noItems")}
            </p>
          ) : (
            <div className="space-y-1">
              {availableItems.map((item) => {
                const isAlreadyAdded = items.some(
                  (i) => i.itemId === item.id && i.sourceId === sourceId && i.sourceType === sourceType
                )
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line/50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{item.name}</span>
                      <span className="ms-2 text-ink-4">
                        ({item.type === "ASSET" ? t("inventory.type.asset") : t("inventory.type.consumable", "استهلاكي")})
                        — {item.quantity} {item.type === "CONSUMABLE" ? t("inventory.unit.pieces") : ""}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isAlreadyAdded}
                      onClick={() => addItem(item.id)}
                    >
                      {isAlreadyAdded ? t("common.added") : t("common.add")}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected items */}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-3">
            {t("inventory.transfer.selectedItems")}
          </p>
          <div className="space-y-1">
            {items.map((item, index) => (
              <div
                key={`${item.itemId}-${item.sourceId}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-line/50 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.itemName}</div>
                  <div className="text-ink-4 text-xs">
                    {item.sourceType === "WAREHOUSE" ? t("inventory.transfer.warehouse") : t("inventory.transfer.project")}: {item.sourceName}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-ink-4">
                    {t("inventory.transfer.quantity")}
                    <Input
                      type="number"
                      min="1"
                      max={item.maxQuantity}
                      value={item.quantity}
                      onChange={(e) => updateItemQuantity(index, Number(e.target.value))}
                      className="h-8 w-20 text-center"
                    />
                  </label>

                  <label className="flex items-center gap-1 text-xs text-ink-4">
                    {t("inventory.transfer.unitPrice")}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItemPrice(index, Number(e.target.value))}
                      className="h-8 w-24 text-center"
                    />
                  </label>

                  <label className="flex items-center gap-1 text-xs text-ink-4">
                    {t("inventory.transfer.total")}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity * item.unitPrice}
                      onChange={(e) => updateItemTotal(index, Number(e.target.value))}
                      className="h-8 w-24 text-center"
                    />
                  </label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => removeItem(index)}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-end gap-2 border-t border-line/50 pt-2">
            <span className="text-sm font-medium text-ink-4">{t("inventory.transfer.total", "الإجمالي")}:</span>
            <span className="text-lg font-display font-semibold tabular-nums">
              {totalAmount.toLocaleString("ar-DZ")} {t("common.currency")}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export type { SelectedItem as MultiSourceSelectedItem }
