import { useState } from "react"
import type { ExternalCounterparty, Warehouse, Project } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { showErrorToast } from "@/lib/toast"
import { ItemListEditor, type ItemEditorRow } from "./item-list-editor"
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
  const [items, setItems] = useState<ItemEditorRow[]>([])
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
    // Validate required fields
    if (!fromId) {
      showErrorToast("يرجى اختيار الموقع الأصلي")
      return
    }
    if (!counterpartyId) {
      showErrorToast("يرجى اختيار الطرف الخارجي")
      return
    }

    // Validate items
    const validationErrors: string[] = []
    const validatedItems = items.map((item, idx) => {
      if (!item.itemId) {
        validationErrors.push(`العنصر ${idx + 1}: يجب تحديد العنصر`)
        return null
      }
      if (!itemDefinitions.some((def) => def.id === item.itemId)) {
        validationErrors.push(`العنصر ${idx + 1}: العنصر المحدد غير موجود`)
        return null
      }
      const quantity = Number(item.quantity)
      if (!item.quantity || quantity <= 0) {
        validationErrors.push(`العنصر ${idx + 1}: يجب إدخال كمية أكبر من 0`)
        return null
      }
      if (!Number.isFinite(quantity)) {
        validationErrors.push(`العنصر ${idx + 1}: الكمية غير صحيحة`)
        return null
      }
      return {
        itemId: item.itemId,
        quantity,
        ...(item.unitPrice ? { unitPriceDzd: Number(item.unitPrice) } : {}),
      }
    }).filter((item) => item !== null)

    if (validationErrors.length > 0) {
      showErrorToast(validationErrors.join("\n"))
      return
    }

    if (validatedItems.length === 0) {
      showErrorToast("يرجى إضافة عنصر واحد على الأقل")
      return
    }

    // Validate debt amount if provided
    if (debtAmount) {
      const debtValue = Number(debtAmount)
      if (!Number.isFinite(debtValue) || debtValue < 0) {
        showErrorToast("مبلغ الدين غير صحيح")
        return
      }
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
          <ItemListEditor items={items} itemDefinitions={itemDefinitions} onAdd={addItem} onRemove={removeItem} onUpdate={updateItem} />
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
