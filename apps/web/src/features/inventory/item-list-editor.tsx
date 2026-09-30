/**
 * Item list editor for managing the outbound transfer's items.
 *
 * Each row's item is chosen through {@link ItemOptionPicker}, the usage-scoped,
 * paged adapter: the row holds the picked option, so an option that is not on
 * the loaded page still renders, and the read is filtered to what the surface
 * may actually offer (active, and in stock at the transfer's source).
 */
import { useTranslation } from "react-i18next"

import type { InventoryItemDefinition, InventoryItemUsage } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { ItemOptionPicker } from "./item-option-picker"

/** ItemEditorRow. */
export interface ItemEditorRow {
  itemOption: InventoryItemDefinition | null
  quantity: string
  unitPrice: string
}

/**
 * @description Component
 */
export function ItemListEditor({
  items,
  usage,
  onAdd,
  onRemove,
  onUpdate,
}: {
  items: ItemEditorRow[]
  usage: InventoryItemUsage
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, patch: Partial<ItemEditorRow>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-3 rounded-xl border border-border/70 p-3">
          <div className="min-w-0 flex-1">
            <ItemOptionPicker
              label={t("inventory.items.selectItem")}
              usage={usage}
              value={item.itemOption}
              onChange={(option) => onUpdate(idx, { itemOption: option })}
            />
          </div>
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label={t("inventory.items.quantity")}
            placeholder={t("inventory.items.quantity")}
            value={item.quantity}
            onChange={(e) => onUpdate(idx, { quantity: e.target.value })}
            className="w-24"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            aria-label={t("inventory.items.price")}
            placeholder={t("inventory.items.price")}
            value={item.unitPrice}
            onChange={(e) => onUpdate(idx, { unitPrice: e.target.value })}
            className="w-28"
          />
          <Button variant="ghost" size="sm" onClick={() => onRemove(idx)} className="text-destructive hover:bg-destructive/10">
            {t("common.delete")}
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        + {t("inventory.items.addItem")}
      </Button>
    </div>
  )
}
