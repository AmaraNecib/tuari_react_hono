import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import type { DebtEntry } from "@tuari/contracts"

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
import {
  useRecordDebtPaymentMutation,
} from "@/features/app-shell/mock-dashboard"
import { formatDebtMoney, getDebtBalanceMeta } from "./debt-utils"
import { cn } from "@/lib/utils"

export function RecordEntryPaymentDialog({
  entry,
  accountCurrentBalance,
  open,
  onOpenChange,
}: {
  entry: DebtEntry | null
  /** The account's current balance at dialog open time (used for max-payment validation) */
  accountCurrentBalance: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const recordPaymentMutation = useRecordDebtPaymentMutation()
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHECK">("CASH")
  const [note, setNote] = useState("")

  const amountValue = amount.trim() ? Number(amount.trim()) : null
  const hasValidAmount = amountValue !== null && Number.isFinite(amountValue) && amountValue > 0
  const maxPayment = entry ? accountCurrentBalance : 0
  const amountExceedsMax = amountValue !== null && amountValue > maxPayment

  useEffect(() => {
    if (open) {
      setAmount("")
      setPaymentMethod("CASH")
      setNote("")
    }
  }, [open])

  if (!entry) return null

  const amountMeta = getDebtBalanceMeta(entry.signedAmountDzd)

  const handleSubmit = async () => {
    if (!hasValidAmount || amountExceedsMax || !entry) return

    await recordPaymentMutation.mutateAsync({
      debtEntryId: entry.id,
      amountDzd: amountValue!,
      paymentMethod,
      note: note.trim() || null,
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("debts.payment.title", "تسديد دفعة")}</DialogTitle>
          <DialogDescription>
            {t("debts.payment.description", "سجل دفعة مقابل حركة الفتح هذه")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry summary */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("debts.payment.openingBalance", "رصيد افتتاحي")}</span>
              <span className={cn("font-mono text-lg font-semibold", amountMeta.textClassName)} dir="ltr">
                دج {formatDebtMoney(entry.signedAmountDzd)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}
              {entry.note?.trim() ? ` — ${entry.note.trim()}` : ""}
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {t("debts.payment.maxAmount", "الحد الأقصى للدفعة:")} دج {formatDebtMoney(maxPayment)}
            </p>
          </div>

          {/* Amount */}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("debts.payment.amount", "مبلغ الدفعة")}</span>
            <CurrencyInput
              placeholder={t("debts.payment.amountPlaceholder", "أدخل المبلغ المدفوع")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amountExceedsMax && (
              <p className="text-xs text-rose-600">{t("debts.payment.amountExceeds", "مبلغ الدفعة يتجاوز الرصيد المتبقي.")}</p>
            )}
          </label>

          {/* Payment method */}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("debts.payment.method", "طريقة الدفع")}</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CHECK")}
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
            >
              <option value="CASH">{t("debts.payment.cash", "نقداً")}</option>
              <option value="BANK_TRANSFER">{t("debts.payment.bankTransfer", "تحويل بنكي")}</option>
              <option value="CHECK">{t("debts.payment.check", "شيك")}</option>
            </select>
          </label>

          {/* Note */}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("common.note", "ملاحظة")}</span>
            <Textarea
              placeholder={t("debts.payment.notePlaceholder", "اختياري — تفصيل عن الدفعة")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "إلغاء")}
          </Button>
          <Button
            disabled={!hasValidAmount || amountExceedsMax || recordPaymentMutation.isPending}
            onClick={handleSubmit}
          >
            {recordPaymentMutation.isPending ? t("debts.payment.pending", "جاري التسجيل...") : t("debts.payment.confirm", "تأكيد الدفعة")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
