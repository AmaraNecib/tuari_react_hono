import { useState } from "react"

import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/form-controls"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"
import { useFormAmount, useDateField } from "@/features/shared/use-form-amount"
import { useEmployeeDebtAccountQuery, useCreateEmployeeDebtEntryMutation } from "./employee-debt-hooks"
import { formatDebtMoney, getDebtBalanceMeta } from "./debt-utils"

export function EmployeeDebtPanel({ employeeId }: { employeeId: string }) {
  const debtAccountQuery = useEmployeeDebtAccountQuery(employeeId)
  const createEntryMutation = useCreateEmployeeDebtEntryMutation()

  const [entryType, setEntryType] = useState<"OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE">("OPENING")
  const { amount, setAmount, value: amountValue, isValid: hasValidAmount, reset: resetAmount } = useFormAmount()
  const [note, setNote] = useState("")
  const { date: entryDate, setDate: setEntryDate, reset: resetDate } = useDateField(getAlgeriaDateInputValue())

  const debtAccount = debtAccountQuery.data
  const balanceMeta = getDebtBalanceMeta(debtAccount?.currentBalanceDzd ?? 0)

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
        <Surface className="rounded-[22px] px-5 py-4" variant="card">
          <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
          <p className={cn("mt-2 font-mono text-2xl font-semibold", balanceMeta.textClassName)} dir="ltr">
            دج {formatDebtMoney(debtAccount?.currentBalanceDzd ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{balanceMeta.description}</p>
        </Surface>
      </div>

      <Surface className="p-5" variant="card">
        <SurfaceHeader title="إضافة حركة دين" description="سجل دفعات أو مستحقات أو تسويات للعامل" />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">نوع الحركة</span>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE")}
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              disabled={createEntryMutation.isPending}
            >
              <option value="OPENING">فتح الحساب</option>
              <option value="PAYMENT">دفعة</option>
              <option value="ADJUSTMENT">تسوية</option>
              <option value="ADVANCE">سلفة</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">التاريخ</span>
            <input
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              disabled={createEntryMutation.isPending}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">المبلغ (دج)</span>
            <CurrencyInput
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={createEntryMutation.isPending}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">ملاحظة</span>
            <input
              type="text"
              placeholder="إضافة تفصيل"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              disabled={createEntryMutation.isPending}
            />
          </label>
        </div>

        <PageFooterActions>
          <Button variant="outline" onClick={resetForm} disabled={createEntryMutation.isPending}>
            إعادة تعيين
          </Button>
          <Button disabled={!hasValidAmount || createEntryMutation.isPending} onClick={handleSubmit}>
            {createEntryMutation.isPending ? "جاري الحفظ..." : "حفظ الحركة"}
          </Button>
        </PageFooterActions>
      </Surface>
    </div>
  )
}
