import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { FileInput, NativeSelect } from "@/components/ui/form-controls"
import { CreateableSelect } from "@/components/ui/createable-select"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"

import {
  uploadInvoiceAttachments,
  useCreateInventoryInvoiceGroupMutation,
  useInventoryExternalCounterpartiesQuery,
  useInventoryItemDefinitionsQuery,
  useInventoryProjectsQuery,
  useInventoryWarehousesQuery,
} from "./inventory-hooks"
import {
  useCreateWarehouseMutation,
  useCreateProjectMutation,
  useCreateExternalCounterpartyMutation,
} from "@/features/app-shell/workspace-mutations"

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
  const createWarehouseMutation = useCreateWarehouseMutation()
  const createProjectMutation = useCreateProjectMutation()
  const createCounterpartyMutation = useCreateExternalCounterpartyMutation()
  const { t } = useTranslation()
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(getTodayDateValue())
  const [warehouseId, setWarehouseId] = useState<string>("")
  const [projectId, setProjectId] = useState<string>("")
  const [externalCounterpartyId, setExternalCounterpartyId] = useState<string>("")
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
          <PageHeader
            title="إضافة مخزون بالفاتورة"
            description="أنشئ فاتورة واحدة، أرفق ملفاتها، ثم أضف كل العناصر المرتبطة بها دفعة واحدة."
            action={
              <PageActionGroup>
                <Button variant="outline" onClick={() => setLines((current) => [...current, createConsumableLine()])}>إضافة مادة</Button>
                <Button variant="outline" onClick={() => setLines((current) => [...current, createAssetLine()])}>إضافة أصل</Button>
              </PageActionGroup>
            }
          />
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          {/* Compact 3-column grid for small fields */}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="رقم الفاتورة" />
              <Input placeholder="تلقائي" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <FieldLabel label={t("common.invoiceDate")} />
              <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
            </label>
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="هل هذه دين؟" />
              <NativeSelect value={createDebt ? "YES" : "NO"} onChange={(event) => setCreateDebt(event.target.value === "YES")}>
                <option value="NO">لا</option>
                <option value="YES">نعم</option>
              </NativeSelect>
            </label>
          </div>

          {/* Counterparty and supplier — 2 columns */}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="الجهة الخارجية" />
              <CreateableSelect
                value={externalCounterpartyId}
                onChange={(id) => {
                  setExternalCounterpartyId(id)
                  if (id) {
                    const counterparty = counterparties.find((item) => item.id === id)
                    setSupplierName(counterparty?.fullName ?? "")
                  }
                }}
                options={counterparties.map((c) => ({ id: c.id, name: c.fullName }))}
                emptyLabel="بدون جهة خارجية"
                createLabel="إنشاء جهة خارجية"
                createFields={[
                  { key: "fullName", label: "الاسم الكامل", placeholder: "اسم الجهة...", required: true },
                  { key: "phoneNumber", label: "رقم الهاتف", placeholder: "0612345678" },
                ]}
                onCreate={async (data) => {
                  const result = await createCounterpartyMutation.mutateAsync({
                    fullName: data.fullName ?? "",
                    phoneNumber: data.phoneNumber || "",
                    note: null,
                  })
                  const item = result.item as { id: string; fullName: string | null } | undefined
                  return { id: item?.id ?? "", name: item?.fullName ?? "" }
                }}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="اسم المورد" />
              <Input placeholder="اختياري إذا أدخلت جهة خارجية" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
            </label>
          </div>

          {/* Warehouse, Project, Debt fields — 3 columns */}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="المستودع الافتراضي" />
              <CreateableSelect
                value={warehouseId}
                onChange={(id) => { setWarehouseId(id); if (id) setProjectId("") }}
                options={warehouses.map((w) => ({ id: w.id, name: w.name }))}
                emptyLabel="بدون مستودع"
                createLabel="إنشاء مستودع"
                createFields={[
                  { key: "name", label: "اسم المستودع", placeholder: "المستودع...", required: true },
                  { key: "address", label: "العنوان", placeholder: "المدينة..." },
                ]}
                onCreate={async (data) => {
                  const result = await createWarehouseMutation.mutateAsync({
                    name: data.name ?? "",
                    address: data.address || null,
                    managerId: null,
                    status: "ACTIVE",
                    notes: null,
                  })
                  const item = result.item as { id: string; name: string } | undefined
                  return { id: item?.id ?? "", name: item?.name ?? "" }
                }}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="المشروع الافتراضي" />
              <CreateableSelect
                value={projectId}
                onChange={(id) => { setProjectId(id); if (id) setWarehouseId("") }}
                options={projects.map((p) => ({ id: p.id, name: p.name }))}
                emptyLabel="بدون مشروع"
                createLabel="إنشاء مشروع"
                createFields={[
                  { key: "name", label: "اسم المشروع", placeholder: "المشروع...", required: true },
                  { key: "location", label: "الموقع", placeholder: "المدينة..." },
                ]}
                onCreate={async (data) => {
                  const result = await createProjectMutation.mutateAsync({
                    name: data.name ?? "",
                    location: data.location || null,
                    managerId: null,
                    status: "ACTIVE",
                    notes: null,
                  })
                  const item = result.item as { id: string; name: string } | undefined
                  return { id: item?.id ?? "", name: item?.name ?? "" }
                }}
              />
            </label>
            {createDebt ? (
              <>
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label="طريقة الدفع" required />
                  <NativeSelect value={paymentInputType} onChange={(event) => setPaymentInputType(event.target.value as "AMOUNT" | "PERCENT")}>
                    <option value="AMOUNT">مبلغ ثابت</option>
                    <option value="PERCENT">نسبة مئوية</option>
                  </NativeSelect>
                </label>
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label={paymentInputType === "AMOUNT" ? "المدفوع الآن" : "النسبة المدفوعة"} />
                  <Input type="number" min="0" step="0.01" value={paidValue} onChange={(event) => setPaidValue(event.target.value)} />
                </label>
              </>
            ) : null}
          </div>

          {/* Note and files — full width */}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="ملاحظات" />
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="اختياري" />
            </label>
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="ملفات الفاتورة" />
              <FileInput multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            </label>
          </div>
        </PageSurfaceContent>
      </Surface>

      {lines.map((line, index) => {
        const definition = line.itemDefinitionId ? selectedDefinitions.get(line.itemDefinitionId) : null
        return (
          <Surface key={index} variant="panel">
            <PageSurfaceContent>
              <SurfaceHeader
                title={`العنصر ${index + 1}`}
                description={line.kind === "CONSUMABLE" ? "مادة استهلاكية" : "أصل مع بيانات كل أصل"}
                action={<Button variant="outline" size="sm" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>حذف</Button>}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label="تعريف العنصر" required />
                  <NativeSelect value={line.itemDefinitionId} onChange={(event) => {
                    const nextDefinition = selectedDefinitions.get(event.target.value)
                    if (nextDefinition?.itemType === "ASSET") {
                      updateLine(index, { kind: "ASSET", itemDefinitionId: event.target.value, warehouseId: line.warehouseId, projectId: line.projectId, note: line.note, assets: line.kind === "ASSET" ? line.assets.map((asset) => ({ ...asset, assetName: asset.assetName || nextDefinition.name })) : [createAssetRow(nextDefinition.name, invoiceDate || getTodayDateValue())] })
                      return
                    }
                    updateLine(index, { kind: "CONSUMABLE", itemDefinitionId: event.target.value, warehouseId: line.warehouseId, projectId: line.projectId, quantity: line.kind === "CONSUMABLE" ? line.quantity : "1", unitPriceDzd: line.kind === "CONSUMABLE" ? line.unitPriceDzd : "0", totalPriceDzd: line.kind === "CONSUMABLE" ? line.totalPriceDzd : "0", note: line.note })
                  }}>
                    <option value="">اختر العنصر</option>
                    {definitions.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.itemType === "CONSUMABLE" ? "استهلاكي" : "أصل"}</option>)}
                  </NativeSelect>
                </label>
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label="المستودع" />
                  <NativeSelect value={line.warehouseId} onChange={(event) => updateLine(index, { ...line, warehouseId: event.target.value, projectId: event.target.value ? "" : line.projectId } as LineState)}>
                    <option value="">الافتراضي</option>
                    {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                  </NativeSelect>
                </label>
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label="المشروع" />
                  <NativeSelect value={line.projectId} onChange={(event) => updateLine(index, { ...line, projectId: event.target.value, warehouseId: event.target.value ? "" : line.warehouseId } as LineState)}>
                    <option value="">الافتراضي</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </NativeSelect>
                </label>
              </div>

              {line.kind === "CONSUMABLE" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1.5 text-sm">
                    <FieldLabel label={`الكمية ${definition?.unit ? `(${definition.unit})` : ""}`} required />
                    <Input type="number" min="0" value={line.quantity} onChange={(event) => {
                      const quantity = event.target.value
                      const nextTotal = Number(quantity || 0) * Number(line.unitPriceDzd || 0)
                      updateLine(index, { ...line, quantity, totalPriceDzd: nextTotal.toFixed(2) })
                    }} />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <FieldLabel label="سعر الوحدة" required />
                    <Input type="number" min="0" step="0.01" value={line.unitPriceDzd} onChange={(event) => {
                      const unitPriceDzd = event.target.value
                      const nextTotal = Number(line.quantity || 0) * Number(unitPriceDzd || 0)
                      updateLine(index, { ...line, unitPriceDzd, totalPriceDzd: nextTotal.toFixed(2) })
                    }} />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <FieldLabel label="الإجمالي" required />
                    <Input type="number" min="0" step="0.01" value={line.totalPriceDzd} onChange={(event) => {
                      const totalPriceDzd = event.target.value
                      const quantity = Number(line.quantity || 0)
                      const nextUnitPrice = quantity > 0 ? Number(totalPriceDzd || 0) / quantity : 0
                      updateLine(index, { ...line, totalPriceDzd, unitPriceDzd: nextUnitPrice.toFixed(2) })
                    }} />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  {line.assets.map((asset, assetIndex) => (
                    <div key={assetIndex} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-3">
                      <label className="space-y-1.5 text-sm">
                        <FieldLabel label="اسم الأصل" required />
                        <Input value={asset.assetName} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, assetName: event.target.value } : currentAsset) }))} />
                      </label>
                      <label className="space-y-1.5 text-sm">
                        <FieldLabel label="كود الأصل" />
                        <Input value={asset.assetTag} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, assetTag: event.target.value } : currentAsset) }))} />
                      </label>
                      <label className="space-y-1.5 text-sm">
                        <FieldLabel label="الرقم التسلسلي" />
                        <Input value={asset.serialNumber} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, serialNumber: event.target.value } : currentAsset) }))} />
                      </label>
                      <label className="space-y-1.5 text-sm">
                        <FieldLabel label="الحالة" />
                        <NativeSelect value={asset.condition} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, condition: event.target.value as AssetRow["condition"] } : currentAsset) }))}>
                          <option value="NEW">جديد</option>
                          <option value="USED">مستعمل</option>
                          <option value="MAINTENANCE">صيانة</option>
                          <option value="DAMAGED">متضرر</option>
                        </NativeSelect>
                      </label>
                      <label className="space-y-1.5 text-sm">
                        <FieldLabel label="تاريخ الشراء" />
                        <DatePicker
                          value={asset.purchaseDate}
                          onChange={(value: string) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, purchaseDate: value } : currentAsset) }))}
                        />
                      </label>
                      <label className="space-y-1.5 text-sm">
                        <FieldLabel label="سعر الأصل" required />
                        <Input type="number" min="0" step="0.01" value={asset.purchasePriceDzd} onChange={(event) => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: currentLine.assets.map((currentAsset, currentAssetIndex) => currentAssetIndex === assetIndex ? { ...currentAsset, purchasePriceDzd: event.target.value } : currentAsset) }))} />
                      </label>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: [...currentLine.assets, createAssetRow(selectedDefinitions.get(currentLine.itemDefinitionId)?.name ?? "", invoiceDate || getTodayDateValue())] }))}>إضافة أصل آخر</Button>
                </div>
              )}
            </PageSurfaceContent>
          </Surface>
        )
      })}

      <div className="flex justify-end">
        <Button disabled={createMutation.isPending || lines.length === 0} onClick={() => void handleSubmit()}>حفظ الفاتورة</Button>
      </div>
    </div>
  )
}
