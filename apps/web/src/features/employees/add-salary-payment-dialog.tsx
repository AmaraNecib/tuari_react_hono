import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { DatePicker } from "@/components/ui/date-picker"
import { useCreateSalaryPaymentMutation } from "@/features/app-shell/workspace-mutations"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { useFormAmount, useDateField } from "@/features/shared/use-form-amount"

/** Dialog for recording a salary payment. */
export function AddSalaryPaymentDialog({
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: {
  employeeId: string | null
  employeeName?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const mutation = useCreateSalaryPaymentMutation()
  const { amount, setAmount, value: amountValue, isValid: hasValidAmount, reset: resetAmount } = useFormAmount()
  const { date, setDate, reset: resetDate } = useDateField(getAlgeriaDateInputValue())
  const [note, setNote] = useState("")

  const resetForm = () => {
    resetAmount()
    resetDate()
    setNote("")
  }

  const handleSubmit = async () => {
    if (!employeeId || !hasValidAmount) return

    await mutation.mutateAsync({
      employeeId,
      actualAmountDzd: amountValue!,
      paymentDate: date ? toAlgeriaDayBoundaryIso(date, "start") : undefined,
      note: note.trim() || null,
    })

    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("salaries.addPayment")}</DialogTitle>
          {employeeName ? (
            <p className="text-sm text-muted-foreground" dir="auto">{employeeName}</p>
          ) : null}
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("salaries.actualAmount")}</span>
            <CurrencyInput
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("salaries.paymentDate")}</span>
            <DatePicker value={date} onChange={setDate} />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("salaries.notes")}</span>
            <Textarea
              placeholder={t("common.noNotes")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm()
              onOpenChange(false)
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!hasValidAmount || mutation.isPending}
            onClick={handleSubmit}
          >
            {t("salaries.addPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
