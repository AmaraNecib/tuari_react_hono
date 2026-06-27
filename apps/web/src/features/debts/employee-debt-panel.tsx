import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/form-controls"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"
import { useFormAmount, useDateField } from "@/features/shared/use-form-amount"
import { useEmployeeDebtAccountQuery, useCreateEmployeeDebtEntryMutation } from "./employee-debt-hooks"
import { formatDebtMoney, getDebtAccountBalanceMeta, getDebtDirectionLabel } from "./debt-utils"

/** Employee debt panel with balance and entry history. */
/**
 * @description Component
 */
export function EmployeeDebtPanel({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation()
  const debtAccountQuery = useEmployeeDebtAccountQuery(employeeId)
  const createEntryMutation = useCreateEmployeeDebtEntryMutation()

  const [entryType, setEntryType] = useState<"OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE">("OPENING")
  const { amount, setAmount, value: amountValue, isValid: hasValidAmount, reset: resetAmount } = useFormAmount()
  const [note, setNote] = useState("")
  const { date: entryDate, setDate: setEntryDate, reset: resetDate } = useDateField(getAlgeriaDateInputValue())

  const debtAccount = debtAccountQuery.data
  const balanceMeta = debtAccount
    ? getDebtAccountBalanceMeta(debtAccount)
    : getDebtAccountBalanceMeta({ currentBalance: 0, direction: "PAYABLE" })

  const handleSubmit = async () => {
    if (!hasValidAmount) return

    await createEntryMutation.mutateAsync({
      employeeId,
      entryType,
      amountDzd: amountValue!,
      entryDate: entryDate ? toAlgeriaDayBoundaryIso(entryDate, "start") : undefined,
      note: note.trim() || undefined,
    })

    resetForm()
  }

  const resetForm = () => {
    setEntryType("OPENING")
    resetAmount()
    setNote("")
    resetDate()
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <Surface className="rounded-xl px-5 py-4" variant="card">
          <p className="text-sm text-muted-foreground">
            {debtAccount ? `${t("debts.cases.currentBalance", "الرصيد الحالي")} — ${getDebtDirectionLabel(debtAccount.direction)}` : t("debts.cases.currentBalance", "الرصيد الحالي")}
          </p>
          <p className={cn("mt-2 font-mono text-2xl font-semibold", balanceMeta.textClassName)} dir="ltr">
            دج {formatDebtMoney(debtAccount?.currentBalance ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{balanceMeta.description}</p>
        </Surface>
      </div>

      <Surface className="p-5" variant="card">
        <SurfaceHeader title={t("debts.employee.addEntry", "إضافة حركة دين")} description={t("debts.employee.addEntryDescription", "سجل دفعات أو مستحقات أو تسويات للعامل")} />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("debts.employee.entryType", "نوع الحركة")}</span>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE")}
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              disabled={createEntryMutation.isPending}
            >
              <option value="OPENING">{t("debts.employee.opening", "فتح الحساب")}</option>
              <option value="PAYMENT">{t("debts.employee.payment", "دفعة")}</option>
              <option value="ADJUSTMENT">{t("debts.employee.adjustment", "تسوية")}</option>
              <option value="ADVANCE">{t("debts.employee.advance", "سلفة")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("common.createDate", "التاريخ")}</span>
            <DatePicker
              value={entryDate}
              onChange={setEntryDate}
              disabled={createEntryMutation.isPending}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("debts.employee.amount", "المبلغ (دج)")}</span>
            <CurrencyInput
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={createEntryMutation.isPending}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("common.note", "ملاحظة")}</span>
            <input
              type="text"
              placeholder={t("debts.employee.notePlaceholder", "إضافة تفصيل")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              disabled={createEntryMutation.isPending}
            />
          </label>
        </div>

        <PageFooterActions>
          <Button variant="outline" onClick={resetForm} disabled={createEntryMutation.isPending}>
            {t("common.reset", "إعادة تعيين")}
          </Button>
          <Button disabled={!hasValidAmount || createEntryMutation.isPending} onClick={handleSubmit}>
            {createEntryMutation.isPending ? t("debts.employee.saving", "جاري الحفظ...") : t("debts.employee.saveEntry", "حفظ الحركة")}
          </Button>
        </PageFooterActions>
      </Surface>
    </div>
  )
}
