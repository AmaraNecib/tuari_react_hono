import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import type { Expense } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CurrencyInput, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { useDateField, useFormAmount } from "@/features/shared/use-form-amount"

import { useCreateExpenseMutation, useUpdateExpenseMutation } from "./expenses-queries"

/** Sentinel for the "no selection" option in the optional selects. */
const NO_SELECTION = "__none__"

export type ExpenseLookupOption = { id: string; label: string }

export type ExpenseFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode; absent when recording a new expense. */
  expense?: Expense | null
  projects: ExpenseLookupOption[]
  employees: ExpenseLookupOption[]
  sellers: ExpenseLookupOption[]
  stockItems: ExpenseLookupOption[]
}

/**
 * Add / edit expense dialog. Editing keeps who, when and an optional reason —
 * the reason is sent to the API and recorded on the expense revision.
 */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  projects,
  employees,
  sellers,
  stockItems,
}: ExpenseFormDialogProps) {
  const { t } = useTranslation()
  const createMutation = useCreateExpenseMutation()
  const updateMutation = useUpdateExpenseMutation()
  const { amount, setAmount, value: amountValue, isValid: hasValidAmount, reset: resetAmount } =
    useFormAmount()
  const { date, setDate, reset: resetDate } = useDateField(getAlgeriaDateInputValue())
  const [whatFor, setWhatFor] = useState("")
  const [responsibleWorkerId, setResponsibleWorkerId] = useState<string | null>(null)
  const [sellerId, setSellerId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [stockItemId, setStockItemId] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [reason, setReason] = useState("")

  const isEdit = Boolean(expense)
  const pending = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    if (!open) return
    setAmount(expense ? String(expense.amount) : "")
    setDate(expense ? getAlgeriaDateInputValue(new Date(expense.expenseDate)) : getAlgeriaDateInputValue())
    setWhatFor(expense?.whatFor ?? "")
    setResponsibleWorkerId(expense?.responsibleWorkerId ?? null)
    setSellerId(expense?.sellerId ?? null)
    setProjectId(expense?.projectId ?? null)
    setStockItemId(expense?.stockItemId ?? null)
    setNote(expense?.note ?? "")
    setReason("")
    // `setAmount`/`setDate` are stable state setters from the shared hooks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense])

  const resetForm = () => {
    resetAmount()
    resetDate()
    setWhatFor("")
    setResponsibleWorkerId(null)
    setSellerId(null)
    setProjectId(null)
    setStockItemId(null)
    setNote("")
    setReason("")
  }

  const close = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!hasValidAmount) return
    const expenseDate = date ? toAlgeriaDayBoundaryIso(date, "start") : undefined
    if (!expenseDate) return

    const base = {
      amount: amountValue!,
      expenseDate,
      whatFor: whatFor.trim() || null,
      responsibleWorkerId,
      sellerId,
      projectId,
      stockItemId,
      note: note.trim() || null,
    }

    try {
      if (expense) {
        await updateMutation.mutateAsync({
          id: expense.id,
          ...base,
          reason: reason.trim() || null,
        })
      } else {
        await createMutation.mutateAsync(base)
      }
    } catch {
      // The mutation's onError already surfaced the failure toast. Swallow the
      // rejection here so the submit path never leaks an unhandled rejection;
      // the dialog stays open with the user's input intact.
      return
    }

    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("expenses.form.editTitle") : t("expenses.form.createTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("expenses.form.amount")}</span>
            <CurrencyInput
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("expenses.form.date")}</span>
            <DatePicker
              value={date}
              onChange={setDate}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("expenses.form.whatFor")}</span>
            <Input
              value={whatFor}
              onChange={(event) => setWhatFor(event.target.value)}
              placeholder={t("expenses.form.whatForPlaceholder")}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("expenses.form.responsibleWorker")}</span>
              <NativeSelect
                value={responsibleWorkerId ?? NO_SELECTION}
                onChange={(event) =>
                  setResponsibleWorkerId(event.target.value === NO_SELECTION ? null : event.target.value)
                }
              >
                <option value={NO_SELECTION}>{t("expenses.form.none")}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("expenses.form.seller")}</span>
              <NativeSelect
                value={sellerId ?? NO_SELECTION}
                onChange={(event) =>
                  setSellerId(event.target.value === NO_SELECTION ? null : event.target.value)
                }
              >
                <option value={NO_SELECTION}>{t("expenses.form.none")}</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("expenses.form.project")}</span>
            <NativeSelect
              value={projectId ?? NO_SELECTION}
              onChange={(event) =>
                setProjectId(event.target.value === NO_SELECTION ? null : event.target.value)
              }
            >
              <option value={NO_SELECTION}>{t("expenses.form.none")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("expenses.form.stockItem")}</span>
            <NativeSelect
              value={stockItemId ?? NO_SELECTION}
              onChange={(event) =>
                setStockItemId(event.target.value === NO_SELECTION ? null : event.target.value)
              }
            >
              <option value={NO_SELECTION}>{t("expenses.form.none")}</option>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </label>

          {projectId ? (
            <p className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs text-ink-2">
              {t("expenses.form.projectChargeCallout")}
            </p>
          ) : null}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("expenses.form.note")}</span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("common.noNotes")}
            />
          </label>

          {isEdit ? (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("expenses.form.reason")}</span>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("expenses.form.reasonPlaceholder")}
              />
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!hasValidAmount || pending} onClick={() => void handleSubmit()}>
            {isEdit ? t("common.save") : t("expenses.form.createTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
