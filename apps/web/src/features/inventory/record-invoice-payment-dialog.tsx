/**
 * Record invoice payment dialog for recording payments against inventory invoices.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { InventoryInvoiceGroupDetail } from "@tuari/contracts"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"
import { useFormAmount } from "@/features/shared/use-form-amount"
import { useRecordInvoicePaymentMutation } from "./inventory-hooks"

export function RecordInvoicePaymentDialog({
  invoiceDetail,
  open,
  onOpenChange,
  onSuccess,
}: {
  invoiceDetail: InventoryInvoiceGroupDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const { t } = useTranslation()
  const recordPaymentMutation = useRecordInvoicePaymentMutation()
  const { amount, setAmount, value: amountValue, isValid: hasValidAmount } = useFormAmount()
  const [note, setNote] = useState("")

  const remainingDebt = useMemo(
    () => invoiceDetail?.group.remainingDebtDzd ?? 0,
    [invoiceDetail?.group.remainingDebtDzd]
  )
  const isAmountValid = hasValidAmount && amountValue! <= remainingDebt

  const handlePayFull = () => {
    setAmount(String(Math.max(0, remainingDebt)))
  }

  const handleSubmit = async () => {
    if (!invoiceDetail || !hasValidAmount || !isAmountValid) return

    await recordPaymentMutation.mutateAsync({
      invoiceGroupId: invoiceDetail.group.id,
      amountDzd: amountValue!,
      note: note.trim() || undefined,
    })

    resetForm()
    onOpenChange(false)
    onSuccess?.()
  }

  const resetForm = () => {
    setAmount("")
    setNote("")
    // Note: useFormAmount().reset() not called here as it requires initial state
    // Form will reset when dialog reopens
  }

  if (!invoiceDetail) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) resetForm()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventory.payment.title", "تسجيل دفعة")}</DialogTitle>
          <DialogDescription>{invoiceDetail.group.supplierName || `الفاتورة ${invoiceDetail.group.invoiceNumber}`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <p className="text-sm text-muted-foreground">{t("inventory.payment.remainingDebt", "الدين المتبقي")}</p>
            <p className={cn("mt-2 font-mono text-2xl font-semibold", remainingDebt > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")} dir="ltr">
              {remainingDebt.toFixed(2)} دج
            </p>
            {remainingDebt <= 0 && <p className="mt-1 text-xs text-green-600 dark:text-green-400">{t("inventory.payment.fullyPaid", "تم سداد هذه الفاتورة بالكامل")}</p>}
          </div>

          {remainingDebt > 0 && (
            <>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{t("inventory.payment.amount", "مبلغ الدفعة")}</span>
                <CurrencyInput placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={recordPaymentMutation.isPending} />
              </label>

              {!isAmountValid && amountValue !== null && <p className="text-xs text-red-600">{t("inventory.payment.exceedsDebt", "لا يمكن دفع أكثر من الدين المتبقي")}</p>}

              <Button size="sm" variant="outline" className="w-full" onClick={handlePayFull} disabled={recordPaymentMutation.isPending}>
                {t("inventory.payment.payFull", "دفع المبلغ الكامل")}
              </Button>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{t("common.note", "ملاحظة")}</span>
                <Textarea placeholder={t("inventory.payment.notePlaceholder", "إضافة ملاحظة عن الدفعة")} value={note} onChange={(e) => setNote(e.target.value)} disabled={recordPaymentMutation.isPending} />
              </label>
            </>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
          >
            {t("common.cancel", "إلغاء")}
          </Button>
          {remainingDebt > 0 && (
            <Button disabled={!isAmountValid || recordPaymentMutation.isPending} onClick={handleSubmit}>
              {recordPaymentMutation.isPending ? t("inventory.payment.pending", "جاري التسجيل...") : t("inventory.payment.confirm", "تأكيد الدفعة")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
