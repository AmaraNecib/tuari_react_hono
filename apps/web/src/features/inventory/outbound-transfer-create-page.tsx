import { useState } from "react"
import type { ExternalCounterparty, Warehouse, Project } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { useCreateOutboundTransferMutation, useInventoryExternalCounterpartiesQuery, useInventoryWarehousesQuery, useInventoryProjectsQuery, useInventoryItemDefinitionsQuery } from "./inventory-hooks"

export function OutboundTransferCreatePage({ onBack }: { onBack: () => void }) {
  const counterpartiesQuery = useInventoryExternalCounterpartiesQuery()
  const warehousesQuery = useInventoryWarehousesQuery()
  const projectsQuery = useInventoryProjectsQuery()
  const itemsQuery = useInventoryItemDefinitionsQuery()
  const createTransferMutation = useCreateOutboundTransferMutation()

  const [fromType, setFromType] = useState<"WAREHOUSE" | "PROJECT">("WAREHOUSE")
  const [fromId, setFromId] = useState("")
  const [counterpartyId, setCounterpartyId] = useState("")
  const [transferType, setTransferType] = useState<"SALE" | "GIFT" | "RETURN">("SALE")
  const [items, setItems] = useState<Array<{ itemId: string; quantity: string; unitPrice: string }>>([])
  const [notes, setNotes] = useState("")
  const [debtAmount, setDebtAmount] = useState("")

  const counterparties = counterpartiesQuery.data?.items ?? []
  const warehouses = warehousesQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []
  const itemDefinitions = itemsQuery.data?.items ?? []

  const currentLocation = fromType === "WAREHOUSE" ? warehouses.find((w) => w.id === fromId) : projects.find((p) => p.id === fromId)
  const locations = fromType === "WAREHOUSE" ? warehouses : projects

  const addItem = () => {
    setItems([...items, { itemId: "", quantity: "", unitPrice: "" } as const])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: string, value: string) => {
    if (!items[index]) return
    const newItems = [...items]
    const currentItem = newItems[index]!
    if (field === "itemId") {
      newItems[index] = { itemId: value, quantity: currentItem.quantity, unitPrice: currentItem.unitPrice }
    } else if (field === "quantity") {
      newItems[index] = { itemId: currentItem.itemId, quantity: value, unitPrice: currentItem.unitPrice }
    } else if (field === "unitPrice") {
      newItems[index] = { itemId: currentItem.itemId, quantity: currentItem.quantity, unitPrice: value }
    }
    setItems(newItems)
  }

  const handleSubmit = async () => {
    const validatedItems = items
      .filter((item) => item.itemId && item.quantity)
      .map((item) => ({
        itemId: item.itemId,
        quantity: Number(item.quantity),
        ...(item.unitPrice ? { unitPriceDzd: Number(item.unitPrice) } : {}),
      }))

    if (!fromId || !counterpartyId || validatedItems.length === 0) {
      alert("يرجى ملء البيانات المطلوبة")
      return
    }

    await createTransferMutation.mutateAsync({
      fromType,
      fromId,
      counterpartyId,
      transferType,
      items: validatedItems,
      notes: notes.trim() || undefined,
      debtAmountDzd: debtAmount ? Number(debtAmount) : undefined,
    })

    onBack()
  }

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title="إنشاء تحويل خارجي" description="تحويل العناصر إلى طرف خارجي" action={<PageActionGroup><Button variant="outline" onClick={onBack}>إلغاء</Button></PageActionGroup>} />
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="بيانات التحويل" description="اختر الموقع الأصلي والطرف الخارجي" />
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">نوع الموقع الأصلي</label>
              <select value={fromType} onChange={(e) => {
                setFromType(e.target.value as "WAREHOUSE" | "PROJECT")
                setFromId("")
              }} className="h-10 rounded-xl border border-border bg-background px-3">
                <option value="WAREHOUSE">مستودع</option>
                <option value="PROJECT">مشروع</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">اختر {fromType === "WAREHOUSE" ? "المستودع" : "المشروع"}</label>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3">
                <option value="">اختر...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">الطرف الخارجي</label>
              <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3">
                <option value="">اختر الطرف الخارجي</option>
                {counterparties.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">نوع التحويل</label>
              <select value={transferType} onChange={(e) => setTransferType(e.target.value as "SALE" | "GIFT" | "RETURN")} className="h-10 rounded-xl border border-border bg-background px-3">
                <option value="SALE">بيع</option>
                <option value="GIFT">هدية</option>
                <option value="RETURN">إرجاع</option>
              </select>
            </div>
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="العناصر المحولة" />
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-3 rounded-xl border border-border/70 p-3">
                <select value={item.itemId} onChange={(e) => updateItem(idx, "itemId", e.target.value)} className="h-10 flex-1 rounded-lg border border-border bg-background px-2 text-sm">
                  <option value="">اختر العنصر</option>
                  {itemDefinitions.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.name}
                    </option>
                  ))}
                </select>
                <Input type="number" min="0" step="0.01" placeholder="الكمية" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="w-20" />
                <Input type="number" min="0" step="0.01" placeholder="السعر" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} className="w-24" />
                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-600">
                  حذف
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addItem} className="w-full">
              + إضافة عنصر
            </Button>
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="معلومات إضافية" />
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">ملاحظات</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات عن التحويل" className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">مبلغ الدين (اختياري)</label>
              <Input type="number" min="0" step="0.01" placeholder="إذا كان هناك دين مستحق" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} />
            </div>
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack}>
              إلغاء
            </Button>
            <Button disabled={!fromId || !counterpartyId || items.length === 0 || createTransferMutation.isPending} onClick={handleSubmit}>
              {createTransferMutation.isPending ? "جاري الإنشاء..." : "إنشاء التحويل"}
            </Button>
          </div>
        </PageSurfaceContent>
      </Surface>
    </div>
  )
}
