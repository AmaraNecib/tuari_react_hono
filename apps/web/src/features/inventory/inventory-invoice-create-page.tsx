import { useTranslation } from "react-i18next"
import { useState } from "react"

import { invoiceLineUsage, type InventoryItemDefinition } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { FileInput, NativeSelect } from "@/components/ui/form-controls"
import { CreateableSelect } from "@/components/ui/createable-select"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { showErrorToast } from "@/lib/toast"

import {
  uploadInvoiceAttachments,
  useCreateInventoryInvoiceGroupMutation,
  useInventoryExternalCounterpartiesQuery,
  useInventoryProjectsQuery,
  useInventoryWarehousesQuery,
} from "./inventory-hooks"
import { ItemOptionPicker } from "./item-option-picker"
import {
  INVOICE_ATTACHMENT_ACCEPT,
  validateInvoiceAttachmentFiles,
  type InvoiceAttachmentMessages,
} from "./invoice-attachment-rules"
import {
  useCreateWarehouseMutation,
  useCreateProjectMutation,
  useCreateExternalCounterpartyMutation,
} from "@/features/app-shell/workspace-mutations"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

type LineKind = "" | "CONSUMABLE" | "ASSET"

type AssetRow = {
  assetName: string
  assetTag: string
  serialNumber: string
  condition: "NEW" | "USED" | "MAINTENANCE" | "DAMAGED"
  purchaseDate: string
  purchasePriceDzd: string
  note: string
}

/**
 * One flat line shape for all three states: an untyped draft (`kind === ""`),
 * a consumable line, or an asset line. The type is a control on the row itself
 * (owner decision: prototype variant C), so a row can exist before its type is
 * chosen and `validateLines` can name that as the incomplete field.
 */
type LineState = {
  kind: LineKind
  /**
   * The picked option, not just its id: with server paging the definition is no
   * longer derivable from an in-memory catalog, and the row needs its `unit`
   * and `name`.
   */
  itemOption: InventoryItemDefinition | null
  warehouseId: string
  projectId: string
  note: string
  quantity: string
  unitPriceDzd: string
  totalPriceDzd: string
  assets: AssetRow[]
}

/** FieldLabel - helper function. */
function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <span>
      {label}
      {required ? <span className="ms-1 text-destructive">*</span> : null}
    </span>
  )
}


/** createLine - a new row, untyped until the operator picks its type. */
function createLine(kind: LineKind = ""): LineState {
  return {
    kind,
    itemOption: null,
    warehouseId: "",
    projectId: "",
    note: "",
    quantity: "1",
    unitPriceDzd: "0",
    totalPriceDzd: "0",
    assets: kind === "ASSET" ? [createAssetRow()] : [],
  }
}

/** createAssetRow - helper function. */
function createAssetRow(defaultName = "", purchaseDate = getAlgeriaDateInputValue()): AssetRow {
  return { assetName: defaultName, assetTag: "", serialNumber: "", condition: "NEW", purchaseDate, purchasePriceDzd: "0", note: "" }
}

/** Invoice creation page with line items and file attachments. */
/**
 * @description Component
 */
export function InventoryInvoiceCreatePage({ onCreated }: { onCreated: (invoiceId: string) => void }) {
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
  const [invoiceDate, setInvoiceDate] = useState(getAlgeriaDateInputValue())
  const [warehouseId, setWarehouseId] = useState<string>("")
  const [projectId, setProjectId] = useState<string>("")
  const [externalCounterpartyId, setExternalCounterpartyId] = useState<string>("")
  const [createDebt, setCreateDebt] = useState(false)
  const [paymentInputType, setPaymentInputType] = useState<"AMOUNT" | "PERCENT">("AMOUNT")
  const [paidValue, setPaidValue] = useState("0")
  const [note, setNote] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [lines, setLines] = useState<LineState[]>([createLine()])
  const [formError, setFormError] = useState<string | null>(null)
  // Set once the invoice is created: the attachment upload targets THIS id,
  // so a retry after an upload failure can never re-run the creation mutation
  // (which would persist a duplicate invoice + duplicate financial entries).
  const [createdInvoiceGroupId, setCreatedInvoiceGroupId] = useState<string | null>(null)
  const [uploadingAttachments, setUploadingAttachments] = useState(false)

  const warehouses = warehousesQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []
  const counterparties = counterpartiesQuery.data?.items ?? []
  const selectedCounterparty = counterparties.find((counterparty) => counterparty.id === externalCounterpartyId) ?? null

/** updateLine - helper function. */
  function updateLine(index: number, next: LineState) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? next : line)))
  }

  /**
   * Changes a row's type. The previously chosen item is CLEARED, because a
   * consumable kept under "أصل" (or the reverse) would be an incompatible pair;
   * the row's location/note are kept because they are type-independent.
   */
  function changeLineKind(index: number, kind: LineKind) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...createLine(kind), warehouseId: line.warehouseId, projectId: line.projectId, note: line.note }
          : line,
      ),
    )
  }

  /** Picks the row's item. The option already satisfies the row's offer rule. */
  function changeLineDefinition(index: number, option: InventoryItemDefinition | null) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line
        if (line.kind !== "ASSET") {
          return { ...line, itemOption: option }
        }
        const assets = line.assets.length > 0 ? line.assets : [createAssetRow()]
        return {
          ...line,
          itemOption: option,
          assets: assets.map((asset) => ({
            ...asset,
            assetName: asset.assetName || option?.name || "",
          })),
        }
      }),
    )
  }

  /**
   * Validates the line items and returns the first localized message, or
   * `null`. Extracted from `validateForm` so the disabled-save reason and the
   * submit gate share exactly one message set.
   */
  function validateLines(linesToValidate: LineState[]) {
    for (const [index, line] of linesToValidate.entries()) {
      // The type is a field on the row now, so a row without it is incomplete
      // exactly like a row without its item.
      if (line.kind === "") {
        return `اختر نوع السطر ${index + 1}.`
      }

      if (!line.itemOption) {
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
            return t("inventory.invoiceCreate.invalidAssetPrice", `سعر الأصل غير صالح في السطر ${index + 1} - الأصل ${assetIndex + 1}.`)
          }
        }
      }
    }

    return null
  }

  /** validateForm - helper function. */
  function validateForm() {
    if (warehouseId && projectId) {
      return "اختر مستودعًا أو مشروعًا واحدًا فقط كوجهة افتراضية."
    }

    // The wire contract bounds the paid fields (amount >= 0, percent 0-100);
    // mirror both bounds here so invalid values never leave the client.
    if (createDebt && paymentInputType === "PERCENT") {
      const percent = Number(paidValue)
      if (percent < 0 || percent > 100) {
        return t("inventory.invoiceCreate.invalidPaidPercent", "النسبة المدفوعة يجب أن تكون بين 0 و 100.")
      }
    }

    if (createDebt && paymentInputType === "AMOUNT") {
      if (Number(paidValue) < 0) {
        return t("inventory.invoiceCreate.invalidPaidAmount", "المبلغ المدفوع يجب أن يكون صفرًا أو أكثر.")
      }
    }

    return validateLines(lines)
  }

  const attachmentMessages: InvoiceAttachmentMessages = {
    tooMany: (max) => t("inventory.invoiceCreate.attachmentTooMany", { max }),
    tooLarge: (fileName, maxMb) => t("inventory.invoiceCreate.attachmentTooLarge", { fileName, maxMb }),
    totalTooLarge: (maxMb) => t("inventory.invoiceCreate.attachmentTotalTooLarge", { maxMb }),
    unsupportedType: (fileName) => t("inventory.invoiceCreate.attachmentUnsupportedType", { fileName }),
  }

  // The reason the save control is dead, shown next to it — "no lines yet",
  // or the exact line/item the reusable validator complains about.
  const saveDisabledReason = lines.length === 0
    ? t("inventory.invoiceCreate.noLines")
    : validateLines(lines)

  /** Upload failures name the file/reason when the server provided one. */
  function resolveUploadError(error: unknown) {
    return error instanceof Error && error.message.trim().length > 0
      ? error.message
      : t("inventory.invoiceCreate.attachmentsUploadFailed")
  }

  async function handleSubmit() {
    const validationMessage = validateForm()
    if (validationMessage) {
      setFormError(validationMessage)
      // Resolve instead of throwing: validation failures render via formError,
      // and a rejected promise from here would surface as an unhandled
      // rejection in dev/CI logs.
      return
    }

    // Reject invalid attachments BEFORE creating: the create-first/upload-
    // after shape would otherwise leave a half-saved invoice behind.
    const attachmentValidationMessage = validateInvoiceAttachmentFiles(files, attachmentMessages)
    if (attachmentValidationMessage) {
      setAttachmentError(attachmentValidationMessage)
      showErrorToast(attachmentValidationMessage)
      return
    }

    setFormError(null)
    setAttachmentError(null)

    let groupId: string
    try {
      const result = await createMutation.mutateAsync({
        invoiceNumber: invoiceNumber || null,
        supplierName: (selectedCounterparty?.fullName ?? supplierName) || null,
        invoiceDate: invoiceDate ? toAlgeriaDayBoundaryIso(invoiceDate, "start") ?? null : null,
        warehouseId: warehouseId || null,
        projectId: projectId || null,
        externalCounterpartyId: externalCounterpartyId || null,
        createDebt,
        paymentInputType: createDebt ? paymentInputType : undefined,
        paidAmountDzd: createDebt && paymentInputType === "AMOUNT" ? Number(paidValue || 0) : null,
        paidPercent: createDebt && paymentInputType === "PERCENT" ? Number(paidValue || 0) : null,
        note: note || null,
        entries: lines.map((line) => {
          // Seed header-level defaults into lines that leave their own
          // warehouse/project unset. A line that explicitly picks one of them
          // never inherits the other (warehouse XOR project is enforced per line).
          const lineWarehouseId = line.warehouseId || (line.projectId ? null : warehouseId || null)
          const lineProjectId = line.projectId || (line.warehouseId ? null : projectId || null)
          if (line.kind === "CONSUMABLE") {
            return {
              kind: "CONSUMABLE" as const,
              itemDefinitionId: line.itemOption?.id ?? "",
              warehouseId: lineWarehouseId,
              projectId: lineProjectId,
              quantity: Number(line.quantity),
              unitPriceDzd: Number(line.unitPriceDzd),
              totalPriceDzd: Number(line.totalPriceDzd),
              note: line.note || null,
            }
          }

          return {
            kind: "ASSET" as const,
            itemDefinitionId: line.itemOption?.id ?? "",
            warehouseId: lineWarehouseId,
            projectId: lineProjectId,
            note: line.note || null,
            assets: line.assets.map((asset) => ({
              assetName: asset.assetName,
              assetTag: asset.assetTag || null,
              serialNumber: asset.serialNumber || null,
              condition: asset.condition,
              purchaseDate: asset.purchaseDate ? toAlgeriaDayBoundaryIso(asset.purchaseDate, "start") ?? null : null,
              purchasePriceDzd: Number(asset.purchasePriceDzd),
              note: asset.note || null,
            })),
          }
        }),
      })
      groupId = result.item.group.id
    } catch {
      // The mutation's onError already surfaced a toast; never navigate on a
      // failed save, and never let the rejection reach the click handler's
      // catch unnecessarily (the toast is the user-facing signal).
      return
    }

    if (files.length > 0) {
      // Creation succeeded — remember the invoice id only when attachments
      // still need uploading: any retry must target THIS id and can never
      // re-run the creation mutation (a second save click would otherwise
      // persist a duplicate invoice + financial entries). With no files there
      // is nothing to retry, so the save flow completes normally below.
      setCreatedInvoiceGroupId(groupId)
      setUploadingAttachments(true)
      try {
        await uploadInvoiceAttachments(groupId, files)
      } catch (error) {
        // The invoice was already saved — surface the failed upload (the
        // creation mutation's onError does NOT cover this separate step) and
        // stay on the page in the retry state: the user must see the partial
        // save and be able to retry the upload against the same invoice id.
        // The server message already names the offending file.
        showErrorToast(resolveUploadError(error))
        return
      } finally {
        setUploadingAttachments(false)
      }
    }

    onCreated(groupId)
  }

  /**
   * Retries ONLY the attachment upload for the already-created invoice.
   * Never touches the creation mutation — duplication is impossible from here.
   */
  async function handleRetryAttachmentUpload() {
    if (!createdInvoiceGroupId || uploadingAttachments) return

    if (files.length === 0) {
      // Nothing left to upload; the invoice already exists.
      onCreated(createdInvoiceGroupId)
      return
    }

    setUploadingAttachments(true)
    try {
      await uploadInvoiceAttachments(createdInvoiceGroupId, files)
    } catch (error) {
      showErrorToast(resolveUploadError(error))
      return
    } finally {
      setUploadingAttachments(false)
    }

    onCreated(createdInvoiceGroupId)
  }

  return (
    <div className="space-y-6">
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader
            title={t("inventory.invoiceCreate.title")}
            description="أنشئ فاتورة واحدة، أرفق ملفاتها، ثم أضف كل العناصر المرتبطة بها دفعة واحدة."
          />
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          {/* Essential create path: invoice number + date, always visible */}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <FieldLabel label="رقم الفاتورة" />
              <Input placeholder="تلقائي" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <FieldLabel label={t("common.invoiceDate")} />
              <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
            </label>
          </div>

          {/* Progressive disclosure: less-used fields live in collapsible sections.
              Each section keeps its open state in the CollapsibleSection's own
              useState and is rendered unconditionally in this page tree, so
              adding/removing line items (which re-renders this page) never
              remounts a section or collapses one the user already opened. */}
          <div className="space-y-3">
            <CollapsibleSection title={t("inventory.invoiceCreate.debtSection")}>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label={t("inventory.invoiceCreate.isDebt")} />
                  <NativeSelect value={createDebt ? "YES" : "NO"} onChange={(event) => setCreateDebt(event.target.value === "YES")}>
                    <option value="NO">{t("common.no")}</option>
                    <option value="YES">{t("common.yes")}</option>
                  </NativeSelect>
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
            </CollapsibleSection>

            <CollapsibleSection title={t("inventory.invoiceCreate.counterpartySection")}>
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
                      { key: "fullName", label: t("externals.create.fullName"), placeholder: t("externals.create.fullNamePlaceholder"), required: true },
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
            </CollapsibleSection>

            <CollapsibleSection title={t("inventory.invoiceCreate.defaultsSection")}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label={t("inventory.invoiceCreate.defaultWarehouse")} />
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
                  <FieldLabel label={t("inventory.invoiceCreate.defaultProject")} />
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
              </div>
            </CollapsibleSection>

            <CollapsibleSection title={t("inventory.invoiceCreate.notesSection")}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label={t("common.note", "ملاحظات")} />
                  <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="اختياري" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label="ملفات الفاتورة" />
                  <FileInput
                    multiple
                    accept={INVOICE_ATTACHMENT_ACCEPT}
                    onChange={(event) => {
                      const nextFiles = Array.from(event.target.files ?? [])
                      setFiles(nextFiles)
                      setAttachmentError(validateInvoiceAttachmentFiles(nextFiles, attachmentMessages))
                    }}
                  />
                  {attachmentError ? (
                    <span role="alert" className="block text-sm text-destructive">
                      {attachmentError}
                    </span>
                  ) : null}
                </label>
              </div>
            </CollapsibleSection>
          </div>
        </PageSurfaceContent>
      </Surface>

      {lines.map((line, index) => {
        const definition = line.itemOption
        return (
          <Surface key={index} variant="panel">
            <PageSurfaceContent>
              <SurfaceHeader
                title={`العنصر ${index + 1}`}
                description={line.kind === "CONSUMABLE" ? t("inventory.invoiceCreate.consumable") : line.kind === "ASSET" ? t("inventory.invoiceCreate.asset") : t("inventory.invoiceCreate.chooseLineType")}
                action={<Button variant="outline" size="sm" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>{t("common.delete")}</Button>}
              />
              {/* Variant C: the type is the FIRST control of the row, and it filters
                  the item options to only what is valid for that type. */}
              <div className="grid gap-3 md:grid-cols-4">
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label={t("inventory.invoiceCreate.lineType")} required />
                  <NativeSelect value={line.kind} onChange={(event) => changeLineKind(index, event.target.value as LineKind)}>
                    <option value="">{t("inventory.invoiceCreate.chooseLineType")}</option>
                    <option value="CONSUMABLE">{t("inventory.invoiceCreate.lineTypeConsumable")}</option>
                    <option value="ASSET">{t("inventory.invoiceCreate.lineTypeAsset")}</option>
                  </NativeSelect>
                </label>
                <div className="space-y-1.5 text-sm">
                  <FieldLabel label="تعريف العنصر" required />
                  <ItemOptionPicker
                    key={line.kind}
                    label="تعريف العنصر"
                    usage={invoiceLineUsage(line.kind === "ASSET" ? "ASSET" : "CONSUMABLE")}
                    value={line.itemOption}
                    onChange={(option) => changeLineDefinition(index, option)}
                    disabled={line.kind === ""}
                  />
                </div>
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label={t("inventory.invoiceCreate.warehouse")} />
                  <NativeSelect value={line.warehouseId} onChange={(event) => updateLine(index, { ...line, warehouseId: event.target.value, projectId: event.target.value ? "" : line.projectId })}>
                    <option value="">{t("common.default")}</option>
                    {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                  </NativeSelect>
                </label>
                <label className="space-y-1.5 text-sm">
                  <FieldLabel label={t("inventory.invoiceCreate.project")} />
                  <NativeSelect value={line.projectId} onChange={(event) => updateLine(index, { ...line, projectId: event.target.value, warehouseId: event.target.value ? "" : line.warehouseId })}>
                    <option value="">{t("common.default")}</option>
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
              ) : null}

              {line.kind === "ASSET" ? (
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
                  <Button variant="outline" size="sm" onClick={() => setLines((current) => current.map((currentLine, lineIndex) => lineIndex !== index || currentLine.kind !== "ASSET" ? currentLine : { ...currentLine, assets: [...currentLine.assets, createAssetRow(currentLine.itemOption?.name ?? "", invoiceDate || getAlgeriaDateInputValue())] }))}>إضافة أصل آخر</Button>
                </div>
              ) : null}
            </PageSurfaceContent>
          </Surface>
        )
      })}

      {/* Item 12: the add action sits at the bottom of the list, after the rows. */}
      <div className="flex justify-start">
        <Button variant="outline" onClick={() => setLines((current) => [...current, createLine()])}>
          {t("inventory.invoiceCreate.addLine")}
        </Button>
      </div>

      <div className="flex items-center justify-end gap-3">
        {!createdInvoiceGroupId && saveDisabledReason ? (
          <p role="status" aria-live="polite" className="text-sm text-destructive">
            {saveDisabledReason}
          </p>
        ) : null}
        {createdInvoiceGroupId ? (
          <Button disabled={uploadingAttachments} onClick={() => {
            void handleRetryAttachmentUpload().catch(() => {
              showErrorToast("تعذر حفظ الفاتورة.")
            })
          }}>
            {t("inventory.invoiceCreate.retryAttachments")}
          </Button>
        ) : (
          <Button disabled={createMutation.isPending || saveDisabledReason !== null} onClick={() => {
            void handleSubmit().catch(() => {
              // Every known failure path (validation, mutation, attachment
              // upload) is handled inside handleSubmit with a field error or
              // toast. This catch only covers unexpected errors — surface them
              // and never let an unhandled rejection reach dev/CI logs.
              showErrorToast(t("inventory.invoiceCreate.attachmentsSaveFailed"))
            })
          }}>
            {createMutation.isPending ? t("common.saving") : t("inventory.invoiceCreate.save")}
          </Button>
        )}
        <Button variant="outline" onClick={() => window.history.back()}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  )
}
