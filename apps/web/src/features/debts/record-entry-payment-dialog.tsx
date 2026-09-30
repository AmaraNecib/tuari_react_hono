/**
 * Record entry payment dialog for recording payments against debt entries.
 */
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

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
import { formatDebtAmount, getDebtBalanceDisplay } from "./debt-utils"
import { cn } from "@/lib/utils"

/**
 * @description Component
 */
export function RecordEntryPaymentDialog({
  entry,
  accountCurrentBalance,
  accountDirection,
  open,
  onOpenChange,
}: {
  entry: DebtEntry | null
  /** The account's current balance at dialog open time (used for max-payment validation) */
  accountCurrentBalance: number
  /** The account's ledger direction, so the balance is phrased unambiguously. */
  accountDirection?: DebtAccount["direction"] | null
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

  const openingBalance = getDebtBalanceDisplay({ currentBalance: entry.signedAmountDzd, direction: accountDirection })
  const maxPaymentDisplay = getDebtBalanceDisplay({
    currentBalance: accountCurrentBalance,
    direction: accountDirection,
  })

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
          <DialogTitle>{t("debts.payment.title")}</DialogTitle>
          <DialogDescription>
            {t("debts.payment.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry summary */}
          <div className="rounded-xl border border-border/60 bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("debts.payment.openingBalance")}</span>
              <span className={cn("font-mono text-lg font-semibold", openingBalance.textClassName)} dir="ltr">
                دج {formatDebtAmount(openingBalance.amount)}
              </span>
            </div>
            <p className={cn("mt-1 text-xs font-medium", openingBalance.textClassName)}>{t(openingBalance.phraseKey)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}
              {entry.note?.trim() ? ` — ${entry.note.trim()}` : ""}
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {t("debts.payment.maxAmount")} {t(maxPaymentDisplay.phraseKey)} دج {formatDebtAmount(maxPaymentDisplay.amount)}
            </p>
          </div>

          {/* Amount */}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("debts.payment.amount")}</span>
            <CurrencyInput
              placeholder={t("debts.payment.amountPlaceholder")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amountExceedsMax && (
              <p className="text-xs text-rose-600">{t("debts.payment.amountExceeds")}</p>
            )}
          </label>

          {/* Payment method */}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("debts.payment.method")}</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CHECK")}
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
            >
              <option value="CASH">{t("debts.payment.cash")}</option>
              <option value="BANK_TRANSFER">{t("debts.payment.bankTransfer")}</option>
              <option value="CHECK">{t("debts.payment.check")}</option>
            </select>
          </label>

          {/* Note */}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("common.note")}</span>
            <Textarea
              placeholder={t("debts.payment.notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!hasValidAmount || amountExceedsMax || recordPaymentMutation.isPending}
            onClick={handleSubmit}
          >
            {recordPaymentMutation.isPending ? t("debts.payment.pending") : t("debts.payment.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
