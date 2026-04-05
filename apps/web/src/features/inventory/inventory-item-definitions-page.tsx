import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"

import { useCreateInventoryItemDefinitionMutation, useInventoryItemDefinitionsQuery } from "./inventory-hooks"

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <span>
      {label}
      {required ? <span className="ms-1 text-destructive">*</span> : null}
    </span>
  )
}

export function InventoryItemDefinitionsPage() {
  const listQuery = useInventoryItemDefinitionsQuery()
  const createMutation = useCreateInventoryItemDefinitionMutation()
  const [name, setName] = useState("")
  const [itemType, setItemType] = useState<"CONSUMABLE" | "ASSET">("CONSUMABLE")
  const [unit, setUnit] = useState("")
  const [description, setDescription] = useState("")

  async function handleCreate() {
    await createMutation.mutateAsync({
      name,
      itemType,
      unit: itemType === "CONSUMABLE" ? unit || null : null,
      description: description || null,
    })

    setName("")
    setUnit("")
    setDescription("")
    setItemType("CONSUMABLE")
  }

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title="دليل العناصر" description="أنشئ تعريفات المواد والأصول التي سيستخدمها النظام لاحقًا داخل الفواتير والتحويلات." />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <FieldLabel label="اسم العنصر" required />
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <FieldLabel label="نوع العنصر" required />
              <select className="h-10 rounded-xl border border-border bg-background px-3" value={itemType} onChange={(event) => setItemType(event.target.value as "CONSUMABLE" | "ASSET") }>
                <option value="CONSUMABLE">مواد استهلاكية</option>
                <option value="ASSET">أصل</option>
              </select>
            </label>
            {itemType === "CONSUMABLE" ? (
              <label className="space-y-2 text-sm">
                <FieldLabel label="وحدة القياس" required />
                <Input placeholder="مثل م² أو كغ أو لتر" value={unit} onChange={(event) => setUnit(event.target.value)} />
              </label>
            ) : null}
            <label className="space-y-2 text-sm md:col-span-2">
              <FieldLabel label="وصف مختصر" />
              <Input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </div>
          <div className="flex justify-end">
            <Button disabled={createMutation.isPending || name.trim().length === 0 || (itemType === "CONSUMABLE" && unit.trim().length === 0)} onClick={() => void handleCreate()}>
              إنشاء التعريف
            </Button>
          </div>
        </PageSurfaceContent>
      </Surface>

      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader title="العناصر الحالية" description="هذه العناصر ستظهر في شاشة إدخال الفواتير." />
          <div className="grid gap-3">
            {listQuery.data?.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3 text-sm">
                <div className="space-y-1">
                  <div className="font-medium text-foreground">{item.name}</div>
                  <div className="text-muted-foreground">
                    {item.itemType === "CONSUMABLE" ? `استهلاكي - ${item.unit}` : "أصل"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{item.isActive ? "نشط" : "مؤرشف"}</div>
              </div>
            ))}
            {listQuery.data?.items.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد تعريفات عناصر حتى الآن.</p> : null}
          </div>
        </PageSurfaceContent>
      </Surface>
    </div>
  )
}
