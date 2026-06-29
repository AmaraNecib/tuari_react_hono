/**
 * Enhanced outbound transfer creation page with multi-source items and debt calculation.
 * Supports items from multiple locations (warehouses/projects) in a single transfer.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileInput, NativeSelect } from "@/components/ui/form-controls"
import { CreateableSelect } from "@/components/ui/createable-select"
import { PageActionGroup, PageHeader, PageSurfaceContent, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { showErrorToast } from "@/lib/toast"
import {
  MultiSourceItemPicker,
  type SelectedItem,
} from "./multi-source-item-picker"
import {
  useCreateOutboundTransferMutation,
  useInventoryExternalCounterpartiesQuery,
} from "./inventory-hooks"
import {
  useCreateExternalCounterpartyMutation,
} from "@/features/app-shell/workspace-mutations"

type PaymentType = "CASH" | "DEBT"
type FirstPaymentInputType = "AMOUNT" | "PERCENT"

/** calculateDebt - helper function. */
function calculateDebt(
  totalAmount: number,
  paymentType: PaymentType,
  firstPaymentInputType: FirstPaymentInputType,
  firstPaymentValue: number
) {
  if (paymentType === "CASH") {
    return {
      firstPaymentAmount: totalAmount,
      remainingDebt: 0,
    }
  }

  let firstPaymentAmount = 0
  if (firstPaymentValue > 0) {
    if (firstPaymentInputType === "AMOUNT") {
      firstPaymentAmount = Math.min(firstPaymentValue, totalAmount)
    } else {
      firstPaymentAmount = (firstPaymentValue / 100) * totalAmount
    }
  }

  return {
    firstPaymentAmount,
    remainingDebt: totalAmount - firstPaymentAmount,
  }
}

/**
 * @description Component
 */
export function OutboundTransferCreatePageV2({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const counterpartiesQuery = useInventoryExternalCounterpartiesQuery()
  const createTransferMutation = useCreateOutboundTransferMutation()
  const createCounterpartyMutation = useCreateExternalCounterpartyMutation()

  const [counterpartyId, setCounterpartyId] = useState("")
  const [counterpartyDisplayName, setCounterpartyDisplayName] = useState("")
  const [transferType, setTransferType] = useState<"SALE" | "GIFT" | "RETURN">("SALE")
  const [items, setItems] = useState<SelectedItem[]>([])
  const [notes, setNotes] = useState("")
  const [, setFiles] = useState<File[]>([])

  // Payment state
  const [paymentType, setPaymentType] = useState<PaymentType>("CASH")
  const [firstPaymentInputType, setFirstPaymentInputType] = useState<FirstPaymentInputType>("AMOUNT")
  const [firstPaymentValue, setFirstPaymentValue] = useState("0")

  const counterparties = counterpartiesQuery.data?.items ?? []

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  )

  const { firstPaymentAmount, remainingDebt } = calculateDebt(
    totalAmount,
    paymentType,
    firstPaymentInputType,
    Number(firstPaymentValue) || 0
  )

  const handleSubmit = async () => {
    // Validate
    if (!counterpartyId) {
      showErrorToast(t("validation.counterpartyRequired", "يرجى اختيار الطرف الخارجي"))
      return
    }

    if (items.length === 0) {
      showErrorToast(t("validation.itemsRequired", "يرجى إضافة عنصر واحد على الأقل"))
      return
    }

    // Group items by source location
    const itemsBySource = new Map<string, { sourceType: "WAREHOUSE" | "PROJECT"; sourceId: string; items: SelectedItem[] }>()
    for (const item of items) {
      const key = `${item.sourceType}-${item.sourceId}`
      const existing = itemsBySource.get(key)
      if (existing) {
        existing.items.push(item)
      } else {
        itemsBySource.set(key, {
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          items: [item],
        })
      }
    }

    // Create transfers for each source location
    try {
      for (const [, group] of itemsBySource) {
        await createTransferMutation.mutateAsync({
          fromType: group.sourceType,
          fromId: group.sourceId,
          counterpartyId,
          transferType,
          items: group.items.map((item) => ({
            itemId: item.itemId,
            quantity: item.quantity,
            ...(item.unitPrice > 0 ? { unitPriceDzd: item.unitPrice } : {}),
          })),
          debtAmountDzd: remainingDebt > 0 ? remainingDebt : undefined,
          notes: notes.trim() || undefined,
        })
      }

      // Upload attachments if any
      // Note: In a real implementation, you'd need the transfer ID to attach files
      // For now, we'll skip this or use the last transfer ID

      onBack()
    } catch {
      // Error is handled by the mutation
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <PageHeader
            title={t("inventory.transfer.createTitle", "إنشاء تحويل خارجي")}
            description={t("inventory.transfer.createDescription", "تحويل العناصر إلى طرف خارجي مع خيارات الدفع")}
            action={
              <PageActionGroup>
                <Button variant="outline" onClick={onBack}>
                  {t("common.cancel", "إلغاء")}
                </Button>
              </PageActionGroup>
            }
          />
        </PageSurfaceContent>
      </Surface>

      {/* Counterparty & Transfer Type */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader
            title={t("inventory.transfer.details", "بيانات التحويل")}
            description={t("inventory.transfer.detailsDescription", "اختر الطرف الخارجي ونوع التحويل")}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transfer.counterparty", "الطرف الخارجي")} *</span>
              <CreateableSelect
                value={counterpartyId}
                onChange={(val) => {
                  setCounterpartyId(val)
                  const found = counterparties.find((c) => c.id === val)
                  if (found) setCounterpartyDisplayName(found.fullName)
                }}
                options={counterparties.map((c) => ({ id: c.id, name: c.fullName }))}
                displayValue={counterpartyDisplayName}
                emptyLabel={t("inventory.transfer.selectCounterparty", "اختر الطرف الخارجي")}
                createLabel={t("inventory.transfer.createCounterparty", "إنشاء طرف خارجي")}
                createFields={[
                  { key: "fullName", label: t("externals.create.fullName", "الاسم الكامل"), placeholder: t("externals.create.fullNamePlaceholder", "اسم الجهة..."), required: true },
                  { key: "phoneNumber", label: t("externals.create.phoneNumber", "رقم الهاتف"), placeholder: "0612345678" },
                ]}
                onCreate={async (data) => {
                  const result = await createCounterpartyMutation.mutateAsync({
                    fullName: data.fullName ?? "",
                    phoneNumber: data.phoneNumber || "0500000000",
                    note: null,
                  })
                  const item = result.item as { id: string; fullName: string | null } | undefined
                  const name = item?.fullName ?? data.fullName ?? ""
                  setCounterpartyDisplayName(name)
                  return { id: item?.id ?? "", name }
                }}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transfer.type", "نوع التحويل")} *</span>
              <NativeSelect
                value={transferType}
                onChange={(e) => setTransferType(e.target.value as "SALE" | "GIFT" | "RETURN")}
              >
                <option value="SALE">{t("inventory.transfer.typeSale", "بيع")}</option>
                <option value="GIFT">{t("inventory.transfer.typeGift", "هدية")}</option>
                <option value="RETURN">{t("inventory.transfer.typeReturn", "مرتجع")}</option>
              </NativeSelect>
            </label>
          </div>
        </PageSurfaceContent>
      </Surface>

      {/* Multi-source Item Picker */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <MultiSourceItemPicker items={items} onItemsChange={setItems} />
        </PageSurfaceContent>
      </Surface>

      {/* Payment Section */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader
            title={t("inventory.transfer.payment", "الدفع")}
            description={t("inventory.transfer.paymentDescription", "اختر طريقة الدفع والمبلغ")}
          />

          <div className="space-y-4">
            {/* Payment Type */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("inventory.transfer.paymentType", "طريقة الدفع")}</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentType"
                    value="CASH"
                    checked={paymentType === "CASH"}
                    onChange={() => setPaymentType("CASH")}
                    className="accent-primary"
                  />
                  <span className="text-sm">{t("inventory.transfer.cash", "نقدي")}</span>
                  <span className="text-xs text-ink-4">({t("inventory.transfer.cashDescription", "تم استلام المبلغ")})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentType"
                    value="DEBT"
                    checked={paymentType === "DEBT"}
                    onChange={() => setPaymentType("DEBT")}
                    className="accent-primary"
                  />
                  <span className="text-sm">{t("inventory.transfer.debt", "دين")}</span>
                  <span className="text-xs text-ink-4">({t("inventory.transfer.debtDescription", "سيتم الدفع لاحقاً")})</span>
                </label>
              </div>
            </div>

            {/* First Payment (if Debt) */}
            {paymentType === "DEBT" && (
              <div className="space-y-3 rounded-lg border border-line/50 bg-surface-2/50 p-4">
                <p className="text-sm font-medium">{t("inventory.transfer.firstPayment", "الدفعة الأولى")} ({t("common.optional", "اختياري")})</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium">{t("inventory.transfer.inputType", "نوع الإدخال")}</span>
                    <NativeSelect
                      value={firstPaymentInputType}
                      onChange={(e) => setFirstPaymentInputType(e.target.value as FirstPaymentInputType)}
                    >
                      <option value="AMOUNT">{t("inventory.transfer.fixedAmount", "مبلغ ثابت")}</option>
                      <option value="PERCENT">{t("inventory.transfer.percent", "نسبة مئوية")}</option>
                    </NativeSelect>
                  </label>

                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium">
                      {firstPaymentInputType === "AMOUNT"
                        ? t("inventory.transfer.amount", "المبلغ")
                        : t("inventory.transfer.percentValue", "النسبة")}
                    </span>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        max={firstPaymentInputType === "PERCENT" ? 100 : totalAmount}
                        step={firstPaymentInputType === "PERCENT" ? 1 : 100}
                        value={firstPaymentValue}
                        onChange={(e) => setFirstPaymentValue(e.target.value)}
                        placeholder={firstPaymentInputType === "AMOUNT" ? "0" : "0"}
                      />
                      <span className="absolute inset-y-0 end-3 flex items-center text-sm text-ink-4">
                        {firstPaymentInputType === "AMOUNT" ? t("common.currency", "دج") : "%"}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg border border-line/50 bg-surface-2/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-4">{t("inventory.transfer.totalAmount", "المبلغ الإجمالي")}</span>
                <span className="font-medium tabular-nums">{totalAmount.toLocaleString("ar-DZ")} {t("common.currency", "دج")}</span>
              </div>
              {paymentType === "DEBT" && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-4">{t("inventory.transfer.firstPaymentAmount", "الدفعة الأولى")}</span>
                    <span className="font-medium tabular-nums text-good">{firstPaymentAmount.toLocaleString("ar-DZ")} {t("common.currency", "دج")}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-4">{t("inventory.transfer.remainingDebt", "المتبقي (دين)")}</span>
                    <span className="font-medium tabular-nums text-warn">{remainingDebt.toLocaleString("ar-DZ")} {t("common.currency", "دج")}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </PageSurfaceContent>
      </Surface>

      {/* Notes & Attachments */}
      <Surface variant="panel">
        <PageSurfaceContent>
          <SurfaceHeader
            title={t("inventory.transfer.additional", "معلومات إضافية")}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("common.notes", "ملاحظات")}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("common.noNotes", "لا توجد ملاحظات")}
                className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("inventory.transfer.attachments", "المرفقات")}</span>
              <FileInput
                multiple
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <p className="text-xs text-ink-4">
                {t("inventory.transfer.attachmentsHint", "صور، PDF، مستندات (اختياري)")}
              </p>
            </label>
          </div>
        </PageSurfaceContent>
      </Surface>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onBack}>
          {t("common.cancel", "إلغاء")}
        </Button>
        <Button
          disabled={!counterpartyId || items.length === 0 || createTransferMutation.isPending}
          onClick={handleSubmit}
        >
          {createTransferMutation.isPending
            ? t("common.saving", "جارٍ الحفظ...")
            : t("inventory.transfer.create", "إنشاء التحويل")}
        </Button>
      </div>
    </div>
  )
}
