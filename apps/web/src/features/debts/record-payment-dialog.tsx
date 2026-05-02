import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount } from "@tuari/contracts"

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
import { useCreateDebtEntryMutation, useSettleDebtAccountMutation } from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { formatDebtMoney, getDebtBalanceMeta } from "./debt-utils"
import { cn } from "@/lib/utils"
import { useFormAmount, useDateField } from "@/features/shared/use-form-amount"

export function RecordPaymentDialog({
  debtAccount,
  open,
  onOpenChange,
  onSuccess,
}: {
  debtAccount: DebtAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const { t } = useTranslation()
  const createDebtEntryMutation = useCreateDebtEntryMutation()
  const settleDebtAccountMutation = useSettleDebtAccountMutation()
  const { amount, setAmount, value: amountValue, isValid: hasValidAmount, reset: resetAmount } = useFormAmount()
  const { date: paymentDate, setDate: setPaymentDate, reset: resetDate } = useDateField(getAlgeriaDateInputValue())
  const [note, setNote] = useState("")
  const [showSettlePrompt, setShowSettlePrompt] = useState(false)

  const balance = debtAccount?.currentBalanceDzd ?? 0
  const balanceMeta = getDebtBalanceMeta(balance)

  const handlePayFull = () => {
    setAmount(String(Math.abs(balance)))
  }

  const handleSubmit = async () => {
    if (!debtAccount || !hasValidAmount) return

    const signedAmount = balance > 0 ? -amountValue! : amountValue!
    const balanceAfter = balance + signedAmount

    await createDebtEntryMutation.mutateAsync({
      debtAccountId: debtAccount.id,
      signedAmountDzd: signedAmount,
      entryDate: paymentDate ? toAlgeriaDayBoundaryIso(paymentDate, "start") : undefined,
      note: note.trim() || null,
    })

    if (balanceAfter === 0) {
      setShowSettlePrompt(true)
    } else {
      resetForm()
      onOpenChange(false)
      onSuccess?.()
    }
  }

  const handleSettle = async () => {
    if (!debtAccount) return
    await settleDebtAccountMutation.mutateAsync({
      debtAccountId: debtAccount.id,
      entryDate: paymentDate ? toAlgeriaDayBoundaryIso(paymentDate, "start") : undefined,
      note: note.trim() || null,
    })
    resetForm()
    setShowSettlePrompt(false)
    onOpenChange(false)
    onSuccess?.()
  }

  const resetForm = () => {
    resetAmount()
    setNote("")
    resetDate()
    setShowSettlePrompt(false)
  }

  if (!debtAccount) return null

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
          <DialogTitle>{t("detailPages.debt.payment.title")}</DialogTitle>
          <DialogDescription>{debtAccount.note?.trim() || t("detailPages.debt.caseLabel")}</DialogDescription>
        </DialogHeader>

        {!showSettlePrompt ? (
          <div className="space-y-4">
            <div className="rounded-[22px] border border-border/60 bg-background/60 p-4">
              <p className="text-sm text-muted-foreground">{t("detailPages.debt.payment.currentBalance")}</p>
              <p className={cn("mt-2 font-mono text-2xl font-semibold", balanceMeta.textClassName)} dir="ltr">
                {t("detailPages.debt.currency")} {formatDebtMoney(balance)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{balanceMeta.description}</p>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{t("detailPages.debt.payment.amount")}</span>
              <CurrencyInput placeholder={t("detailPages.debt.zeroPlaceholder")} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>

            <Button size="sm" variant="outline" className="w-full" onClick={handlePayFull} disabled={createDebtEntryMutation.isPending}>
              {t("detailPages.debt.payment.payFull")}
            </Button>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{t("common.note")}</span>
              <Textarea placeholder={t("detailPages.debt.paymentNotePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">{t("detailPages.debt.createDate")}</span>
              <input
                className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-300">{t("detailPages.debt.payment.settlePrompt")}</p>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
          >
            {t("common.cancel")}
          </Button>
          {!showSettlePrompt ? (
            <Button disabled={!hasValidAmount || createDebtEntryMutation.isPending} onClick={handleSubmit}>
              {t("detailPages.debt.payment.confirm")}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowSettlePrompt(false)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={settleDebtAccountMutation.isPending} onClick={handleSettle}>
                {t("detailPages.debt.settlement.settle")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
