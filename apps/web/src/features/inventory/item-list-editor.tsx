import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3 rounded-xl border border-border/70 p-3">
          <select
            value={item.itemId}
            onChange={(e) => onUpdate(idx, "itemId", e.target.value)}
            className="h-10 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">اختر العنصر</option>
            {itemDefinitions.map((def) => (
              <option key={def.id} value={def.id}>
                {def.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="الكمية"
            value={item.quantity}
            onChange={(e) => onUpdate(idx, "quantity", e.target.value)}
            className="w-20"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="السعر"
            value={item.unitPrice}
            onChange={(e) => onUpdate(idx, "unitPrice", e.target.value)}
            className="w-24"
          />
          <Button variant="ghost" size="sm" onClick={() => onRemove(idx)} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20">
            حذف
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        + إضافة عنصر
      </Button>
    </div>
  )
}
