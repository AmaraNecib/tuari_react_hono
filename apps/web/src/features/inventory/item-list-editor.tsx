/**
 * Item list editor for managing inventory items in invoices.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface ItemEditorRow {
  itemId: string
  quantity: string
  unitPrice: string
}

export function ItemListEditor({
  items,
  itemDefinitions,
  onAdd,
  onRemove,
  onUpdate,
}: {
  items: ItemEditorRow[]
  itemDefinitions: Array<{ id: string; name: string }>
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: string, value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3 rounded-xl border border-border/70 p-3">
          <Select
            value={item.itemId}
            onValueChange={(value) => { if (value) onUpdate(idx, "itemId", value) }}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={t("inventory.items.selectItem", "اختر العنصر")} />
            </SelectTrigger>
            <SelectContent>
              {itemDefinitions.map((def) => (
                <SelectItem key={def.id} value={def.id}>
                  {def.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder={t("inventory.items.quantity", "الكمية")}
            value={item.quantity}
            onChange={(e) => onUpdate(idx, "quantity", e.target.value)}
            className="w-20"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder={t("inventory.items.price", "السعر")}
            value={item.unitPrice}
            onChange={(e) => onUpdate(idx, "unitPrice", e.target.value)}
            className="w-24"
          />
          <Button variant="ghost" size="sm" onClick={() => onRemove(idx)} className="text-destructive hover:bg-destructive/10">
            {t("common.delete", "حذف")}
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        + {t("inventory.items.addItem", "إضافة عنصر")}
      </Button>
    </div>
  )
}
