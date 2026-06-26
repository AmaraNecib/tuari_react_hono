import { useMemo, useState } from "react"
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
          <DialogTitle>تسجيل دفعة</DialogTitle>
          <DialogDescription>{invoiceDetail.group.supplierName || `الفاتورة ${invoiceDetail.group.invoiceNumber}`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <p className="text-sm text-muted-foreground">الدين المتبقي</p>
            <p className={cn("mt-2 font-mono text-2xl font-semibold", remainingDebt > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")} dir="ltr">
              {remainingDebt.toFixed(2)} دج
            </p>
            {remainingDebt <= 0 && <p className="mt-1 text-xs text-green-600 dark:text-green-400">تم سداد هذه الفاتورة بالكامل</p>}
          </div>

          {remainingDebt > 0 && (
            <>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">مبلغ الدفعة</span>
                <CurrencyInput placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={recordPaymentMutation.isPending} />
              </label>

              {!isAmountValid && amountValue !== null && <p className="text-xs text-red-600">لا يمكن دفع أكثر من الدين المتبقي</p>}

              <Button size="sm" variant="outline" className="w-full" onClick={handlePayFull} disabled={recordPaymentMutation.isPending}>
                دفع المبلغ الكامل
              </Button>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">ملاحظة</span>
                <Textarea placeholder="إضافة ملاحظة عن الدفعة" value={note} onChange={(e) => setNote(e.target.value)} disabled={recordPaymentMutation.isPending} />
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
            إلغاء
          </Button>
          {remainingDebt > 0 && (
            <Button disabled={!isAmountValid || recordPaymentMutation.isPending} onClick={handleSubmit}>
              {recordPaymentMutation.isPending ? "جاري التسجيل..." : "تأكيد الدفعة"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
