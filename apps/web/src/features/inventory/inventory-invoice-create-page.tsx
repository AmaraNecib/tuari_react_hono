import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"

import {
  uploadInvoiceAttachments,
  useCreateInventoryInvoiceGroupMutation,
  useInventoryExternalCounterpartiesQuery,
  useInventoryItemDefinitionsQuery,
  useInventoryProjectsQuery,
  useInventoryWarehousesQuery,
} from "./inventory-hooks"

type ConsumableLine = {
  kind: "CONSUMABLE"
  itemDefinitionId: string
  warehouseId: string
  projectId: string
  quantity: string
  unitPriceDzd: string
  totalPriceDzd: string
  note: string
}

type AssetRow = {
  assetName: string
  assetTag: string
  serialNumber: string
  condition: "NEW" | "USED" | "MAINTENANCE" | "DAMAGED"
  purchaseDate: string
  purchasePriceDzd: string
  note: string
}

type AssetLine = {
  kind: "ASSET"
  itemDefinitionId: string
  warehouseId: string
  projectId: string
  note: string
  assets: AssetRow[]
}

type LineState = ConsumableLine | AssetLine

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <span>
      {label}
      {required ? <span className="ms-1 text-destructive">*</span> : null}
    </span>
  )
}

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

function createConsumableLine(): ConsumableLine {
  return { kind: "CONSUMABLE", itemDefinitionId: "", warehouseId: "", projectId: "", quantity: "1", unitPriceDzd: "0", totalPriceDzd: "0", note: "" }
}

function createAssetRow(defaultName = "", purchaseDate = getTodayDateValue()): AssetRow {
  return { assetName: defaultName, assetTag: "", serialNumber: "", condition: "NEW", purchaseDate, purchasePriceDzd: "0", note: "" }
}

function createAssetLine(defaultName = "", purchaseDate = getTodayDateValue()): AssetLine {
  return { kind: "ASSET", itemDefinitionId: "", warehouseId: "", projectId: "", note: "", assets: [createAssetRow(defaultName, purchaseDate)] }
}

export function InventoryInvoiceCreatePage({ onCreated }: { onCreated: (invoiceId: string) => void }) {
  const definitionsQuery = useInventoryItemDefinitionsQuery()
  const warehousesQuery = useInventoryWarehousesQuery()
  const projectsQuery = useInventoryProjectsQuery()
  const counterpartiesQuery = useInventoryExternalCounterpartiesQuery()
  const createMutation = useCreateInventoryInvoiceGroupMutation()
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(getTodayDateValue())
  const [warehouseId, setWarehouseId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [externalCounterpartyId, setExternalCounterpartyId] = useState("")
  const [createDebt, setCreateDebt] = useState(false)
  const [paymentInputType, setPaymentInputType] = useState<"AMOUNT" | "PERCENT">("AMOUNT")
  const [paidValue, setPaidValue] = useState("0")
  const [note, setNote] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [lines, setLines] = useState<LineState[]>([createConsumableLine()])
  const [formError, setFormError] = useState<string | null>(null)

  const definitionItems = definitionsQuery.data?.items
  const definitions = useMemo(() => definitionItems ?? [], [definitionItems])
  const warehouses = warehousesQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []
  const counterparties = counterpartiesQuery.data?.items ?? []
  const selectedDefinitions = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions])
  const selectedCounterparty = counterparties.find((counterparty) => counterparty.id === externalCounterpartyId) ?? null

  function updateLine(index: number, next: LineState) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? next : line)))
  }

  function validateForm() {
    if (warehouseId && projectId) {
      return "اختر مستودعًا أو مشروعًا واحدًا فقط كوجهة افتراضية."
    }

    for (const [index, line] of lines.entries()) {
      if (!line.itemDefinitionId) {
        return `اختر تعريف العنصر في السطر ${index + 1}.`
      }

      if (line.warehouseId && line.projectId) {
        return `اختر مستودعًا أو مشروعًا واحدًا فقط في السطر ${index + 1}.`
      }

      if (line.kind === "CONSUMABLE") {
        if (Number(line.quantity) <= 0) {
          return `أدخل كمية أكبر من صفر في السطر ${index + 1}.`
        }

        if (Number(line.unitPriceDzd) < 0 || Number(line.totalPriceDzd) < 0) {
          return `أدخل سعرًا صالحًا في السطر ${index + 1}.`
        }
      }

      if (line.kind === "ASSET") {
        for (const [assetIndex, asset] of line.assets.entries()) {
          if (!asset.assetName.trim()) {
            return `اسم الأصل مطلوب في السطر ${index + 1} - الأصل ${assetIndex + 1}.`
          }

          if (Number(asset.purchasePriceDzd) < 0) {
            return `سعر الأصل غير صالح في السطر ${index + 1} - الأصل ${assetIndex + 1}.`
          }
        }
      }
    }

    return null
  }

  async function handleSubmit() {
    const validationMessage = validateForm()
    if (validationMessage) {
      setFormError(validationMessage)
      throw new Error(validationMessage)
    }

    setFormError(null)

    const result = await createMutation.mutateAsync({
      invoiceNumber: invoiceNumber || null,
      supplierName: (selectedCounterparty?.fullName ?? supplierName) || null,
      invoiceDate: invoiceDate ? new Date(invoiceDate).toISOString() : null,
      warehouseId: warehouseId || null,
      projectId: projectId || null,
      externalCounterpartyId: externalCounterpartyId || null,
      createDebt,
      paymentInputType: createDebt ? paymentInputType : undefined,
      paidAmountDzd: createDebt && paymentInputType === "AMOUNT" ? Number(paidValue || 0) : null,
      paidPercent: createDebt && paymentInputType === "PERCENT" ? Number(paidValue || 0) : null,
      note: note || null,
      entries: lines.map((line) => {
        if (line.kind === "CONSUMABLE") {
          return {
            kind: "CONSUMABLE" as const,
            itemDefinitionId: line.itemDefinitionId,
            warehouseId: line.warehouseId || null,
            projectId: line.projectId || null,
            quantity: Number(line.quantity),
            unitPriceDzd: Number(line.unitPriceDzd),
            totalPriceDzd: Number(line.totalPriceDzd),
            note: line.note || null,
          }
        }

        return {
          kind: "ASSET" as const,
          itemDefinitionId: line.itemDefinitionId,
          warehouseId: line.warehouseId || null,
          projectId: line.projectId || null,
          note: line.note || null,
          assets: line.assets.map((asset) => ({
            assetName: asset.assetName,
            assetTag: asset.assetTag || null,
            serialNumber: asset.serialNumber || null,
            condition: asset.condition,
            purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate).toISOString() : null,
            purchasePriceDzd: Number(asset.purchasePriceDzd),
            note: asset.note || null,
          })),
        }
      }),
    })

    if (files.length > 0) {
      await uploadInvoiceAttachments(result.item.group.id, files)
    }

    onCreated(result.item.group.id)
  }

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader title="إضافة مخزون بالفاتورة" description="أنشئ فاتورة واحدة، أرفق ملفاتها، ثم أضف كل العناصر المرتبطة بها دفعة واحدة." action={<PageActionGroup><Button variant="outline" onClick={() => setLines((current) => [...current, createConsumableLine()])}>إضافة مادة</Button><Button variant="outline" onClick={() => setLines((current) => [...current, createAssetLine()])}>إضافة أصل</Button></PageActionGroup>} />
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm"><FieldLabel label="رقم الفاتورة" /><Input placeholder="يُنشأ تلقائيًا مثل IN-00001" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
            <label className="space-y-2 text-sm"><FieldLabel label="الجهة الخارجية" /><select className="h-10 rounded-xl border border-border bg-background px-3" value={externalCounterpartyId} onChange={(event) => { const id = event.target.value; setExternalCounterpartyId(id); if (id) { const counterparty = counterparties.find((item) => item.id === id); setSupplierName(counterparty?.fullName ?? "") } }}><option value="">بدون جهة خارجية</option>{counterparties.map((counterparty) => <option key={counterparty.id} value={counterparty.id}>{counterparty.fullName}</option>)}</select></label>
            <label className="space-y-2 text-sm"><FieldLabel label="هل هذه العملية دين؟" /><select className="h-10 rounded-xl border border-border bg-background px-3" value={createDebt ? "YES" : "NO"} onChange={(event) => setCreateDebt(event.target.value === "YES")}><option value="NO">لا</option><option value="YES">نعم</option></select></label>
            <label className="space-y-2 text-sm md:col-span-2"><FieldLabel label="اسم المورد اليدوي" /><Input placeholder="اختياري إذا لم تختر جهة خارجية" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label>
            <label className="space-y-2 text-sm"><FieldLabel label="تاريخ الفاتورة" /><Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
            <label className="space-y-2 text-sm"><FieldLabel label="المستودع الافتراضي" /><select className="h-10 rounded-xl border border-border bg-background px-3" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); if (event.target.value) setProjectId("") }}><option value="">بدون مستودع افتراضي</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <label className="space-y-2 text-sm"><FieldLabel label="المشروع الافتراضي" /><select className="h-10 rounded-xl border border-border bg-background px-3" value={projectId} onChange={(event) => { setProjectId(event.target.value); if (event.target.value) setWarehouseId("") }}><option value="">بدون مشروع افتراضي</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            {createDebt ? <label className="space-y-2 text-sm"><FieldLabel label="طريقة الدفعة الأولية" required /><select className="h-10 rounded-xl border border-border bg-background px-3" value={paymentInputType} onChange={(event) => setPaymentInputType(event.target.value as "AMOUNT" | "PERCENT")}><option value="AMOUNT">مبلغ ثابت</option><option value="PERCENT">نسبة مئوية</option></select></label> : null}
            {createDebt ? <label className="space-y-2 text-sm"><FieldLabel label={paymentInputType === "AMOUNT" ? "المدفوع الآن" : "النسبة المدفوعة الآن"} /><Input type="number" min="0" step="0.01" value={paidValue} onChange={(event) => setPaidValue(event.target.value)} /></label> : null}
            <label className="space-y-2 text-sm md:col-span-2"><FieldLabel label="ملاحظات" /><Input value={note} onChange={(event) => setNote(event.target.value)} /></label>
            <label className="space-y-2 text-sm md:col-span-2"><FieldLabel label="ملفات الفاتورة" /><Input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
          </div>
        </PageSurfaceContent>
      </Surface>

      {lines.map((line, index) => {
        const definition = line.itemDefinitionId ? selectedDefinitions.get(line.itemDefinitionId) : null
        return (
          <Surface key={index} variant="panel">
            <PageSurfaceContent>
              <SurfaceHeader title={`العنصر ${index + 1}`} description={line.kind === "CONSUMABLE" ? "سطر مادة استهلاكية" : "سطر أصل مع بيانات كل أصل على حدة"} action={<Button variant="outline" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>حذف</Button>} />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm"><FieldLabel label="تعريف العنصر" required /><select className="h-10 rounded-xl border border-border bg-background px-3" value={line.itemDefinitionId} onChange={(event) => {
                  const nextDefinition = selectedDefinitions.get(event.target.value)
                  if (nextDefinition?.itemType === "ASSET") {
                    updateLine(index, { kind: "ASSET", itemDefinitionId: event.target.value, warehouseId: line.warehouseId, projectId: line.projectId, note: line.note, assets: line.kind === "ASSET" ? line.assets.map((asset) => ({ ...asset, assetName: asset.assetName || nextDefinition.name })) : [createAssetRow(nextDefinition.name, invoiceDate || getTodayDateValue())] })
                    return
                  }
                  updateLine(index, { kind: "CONSUMABLE", itemDefinitionId: event.target.value, warehouseId: line.warehouseId, projectId: line.projectId, quantity: line.kind === "CONSUMABLE" ? line.quantity : "1", unitPriceDzd: line.kind === "CONSUMABLE" ? line.unitPriceDzd : "0", totalPriceDzd: line.kind === "CONSUMABLE" ? line.totalPriceDzd : "0", note: line.note })
                }}><option value="">اختر العنصر</option>{definitions.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.itemType === "CONSUMABLE" ? "استهلاكي" : "أصل"}</option>)}</select></label>
                <label className="space-y-2 text-sm"><FieldLabel label="المستودع" /><select className="h-10 rounded-xl border border-border bg-background px-3" value={line.warehouseId} onChange={(event) => updateLine(index, { ...line, warehouseId: event.target.value, projectId: event.target.value ? "" : line.projectId } as LineState)}><option value="">استخدم المستودع الافتراضي</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
                <label className="space-y-2 text-sm"><FieldLabel label="المشروع" /><select className="h-10 rounded-xl border border-border bg-background px-3" value={line.projectId} onChange={(event) => updateLine(index, { ...line, projectId: event.target.value, warehouseId: event.target.value ? "" : line.warehouseId } as LineState)}><option value="">استخدم المشروع الافتراضي</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              </div>

              {line.kind === "CONSUMABLE" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="space-y-2 text-sm"><FieldLabel label={`الكمية ${definition?.unit ? `(${definition.unit})` : ""}`} required /><Input type="number" min="0" value={line.quantity} onChange={(event) => {
                    const quantity = event.target.value
                    const nextTotal = Number(quantity || 0) * Number(line.unitPriceDzd || 0)
                    updateLine(index, { ...line, quantity, totalPriceDzd: nextTotal.toFixed(2) })
                  }} /></label>
                  <label className="space-y-2 text-sm"><FieldLabel label="سعر الوحدة" required /><Input type="number" min="0" step="0.01" value={line.unitPriceDzd} onChange={(event) => {
                    const unitPriceDzd = event.target.value
                    const nextTotal = Number(line.quantity || 0) * Number(unitPriceDzd || 0)
                    updateLine(index, { ...line, unitPriceDzd, totalPriceDzd: nextTotal.toFixed(2) })
                  }} /></label>
                  <label className="space-y-2 text-sm"><FieldLabel label="الإجمالي" required /><Input type="number" min="0" step="0.01" value={line.totalPriceDzd} onChange={(event) => {
                    const totalPriceDzd = event.target.value
                    const quantity = Number(line.quantity || 0)
                    const nextUnitPrice = quantity > 0 ? Number(totalPriceDzd || 0) / quantity : 0
                    updateLine(index, { ...line, totalPriceDzd, unitPriceDzd: nextUnitPrice.toFixed(2) })
                  }} /></label>
                </div>
              ) : (
                <div className="space-y-4">
                  {line.assets.map((asset, assetIndex) => (
                    <div key={assetIndex} className="grid gap-4 rounded-2xl border border-border/70 p-4 md:grid-cols-3">
                      <label className="space-y-2 text-sm"><FieldLabel label="اسم الأصل" required /><Input value={asset.assetName} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, assetName: event.target.value } : currentAsset) }))} /></label>
                      <label className="space-y-2 text-sm"><FieldLabel label="كود الأصل" /><Input value={asset.assetTag} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, assetTag: event.target.value } : currentAsset) }))} /></label>
                      <label className="space-y-2 text-sm"><FieldLabel label="الرقم التسلسلي" /><Input value={asset.serialNumber} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, serialNumber: event.target.value } : currentAsset) }))} /></label>
                      <label className="space-y-2 text-sm"><FieldLabel label="الحالة" /><select className="h-10 rounded-xl border border-border bg-background px-3" value={asset.condition} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, condition: event.target.value as AssetRow["condition"] } : currentAsset) }))}><option value="NEW">جديد</option><option value="USED">مستعمل</option><option value="MAINTENANCE">صيانة</option><option value="DAMAGED">متضرر</option></select></label>
                      <label className="space-y-2 text-sm"><FieldLabel label="تاريخ الشراء" /><Input type="date" value={asset.purchaseDate} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, purchaseDate: event.target.value } : currentAsset) }))} /></label>
                      <label className="space-y-2 text-sm"><FieldLabel label="سعر الأصل" required /><Input type="number" min="0" step="0.01" value={asset.purchasePriceDzd} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, purchasePriceDzd: event.target.value } : currentAsset) }))} /></label>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: [...currentLine.assets, createAssetRow(selectedDefinitions.get(currentLine.itemDefinitionId)?.name ?? "", invoiceDate || getTodayDateValue())] }))}>إضافة أصل آخر</Button>
                </div>
              )}
            </PageSurfaceContent>
          </Surface>
        )
      })}

      <div className="flex justify-end"><Button disabled={createMutation.isPending || lines.length === 0} onClick={() => void handleSubmit()}>حفظ الفاتورة</Button></div>
    </div>
  )
}
