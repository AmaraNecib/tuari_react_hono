import { useEffect, useMemo, useState } from "react"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import {
  useCreateDebtEntryMutation,
  useSettleDebtAccountMutation,
} from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"

import { formatDebtMoney, getDebtAccountBalance, getDebtAccountBalanceMeta, getDebtBalanceMeta, getDebtDirectionLabel, getDebtEntryTypeLabel, sortDebtEntries } from "./debt-utils"

function DebtStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Surface className="rounded-[22px] px-5 py-4" variant="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-mono text-xl font-semibold", valueClassName)} dir="ltr">
        {value}
      </p>
    </Surface>
  )
}

export function DebtLedgerPanel({
  debtAccount,
  debtEntries,
  title,
}: {
  debtAccount: DebtAccount | null
  debtEntries: DebtEntry[]
  title: string
}) {
  const createDebtEntryMutation = useCreateDebtEntryMutation()
  const settleDebtAccountMutation = useSettleDebtAccountMutation()
  const [entryDate, setEntryDate] = useState(() => getAlgeriaDateInputValue())
  const [note, setNote] = useState("")
  const [signedAmount, setSignedAmount] = useState("")
  const sortedEntries = useMemo(() => sortDebtEntries(debtEntries), [debtEntries])
  const balanceDzd = getDebtAccountBalance(debtAccount)
  // Issue #22: the running balance is per-account, so its color and
  // Arabic label must respect the account's direction. The
  // direction-agnostic `getDebtBalanceMeta` would label a positive
  // PAYABLE balance as "لنا عنده" when it actually means "we owe
  // them" (علينا له).
  const balanceMeta = debtAccount
    ? getDebtAccountBalanceMeta(debtAccount)
    : getDebtAccountBalanceMeta({ currentBalance: 0, direction: "PAYABLE" })
  const normalizedAmount = signedAmount.trim()
  const signedAmountValue = normalizedAmount.length > 0 ? Number(normalizedAmount) : null
  const hasValidAmount = signedAmountValue !== null && Number.isFinite(signedAmountValue) && signedAmountValue !== 0

  useEffect(() => {
    setEntryDate(getAlgeriaDateInputValue())
    setNote("")
    setSignedAmount("")
  }, [debtAccount?.id])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DebtStatCard
          label={debtAccount ? `الرصيد الحالي — ${getDebtDirectionLabel(debtAccount.direction)}` : "الرصيد الحالي"}
          value={`دج ${formatDebtMoney(balanceDzd)}`}
          valueClassName={balanceMeta.textClassName}
        />
        <DebtStatCard label="الحالة" value={balanceMeta.shortLabel} valueClassName={balanceMeta.textClassName} />
        <DebtStatCard label="عدد القيود" value={String(sortedEntries.length)} />
      </div>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            debtAccount
              ? "أدخل مبلغًا موجبًا إذا زاد ما لنا عند الطرف، وأدخل مبلغًا سالبًا إذا نزل الرصيد. مثال: +5000 دين جديد، -2000 دفعة وصلت إلينا، +2000 دفعة دفعناها لطرف كنا مدينين له."
              : "أنشئ الحساب أولًا قبل إضافة الحركات."
          }
          title={title}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">التاريخ</span>
            <input
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              type="date"
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">المبلغ الموقّع</span>
            <CurrencyInput placeholder="مثال: 2500 أو -2500" value={signedAmount} onChange={(event) => setSignedAmount(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
            <span className="text-sm font-medium text-foreground">ملاحظة</span>
            <Textarea placeholder="وصف مختصر للحركة" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">المبلغ يغيّر الرصيد مباشرة: موجب يرفع الرصيد، وسالب يخفضه.</p>
          <Button
            disabled={!debtAccount || !hasValidAmount || createDebtEntryMutation.isPending}
            onClick={() =>
              debtAccount
                ? createDebtEntryMutation.mutate({
                    debtAccountId: debtAccount.id,
                    entryDate: entryDate ? toAlgeriaDayBoundaryIso(entryDate, "start") : undefined,
                    note: note.trim() || null,
                    signedAmountDzd: signedAmountValue!,
                  })
                : undefined
            }
          >
            تسجيل الدفعة
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            balanceDzd === 0
              ? "الرصيد مغلق بالفعل."
              : `سيتم إنشاء حركة تسوية بقيمة ${formatDebtMoney(-balanceDzd)} دج لإرجاع الرصيد إلى صفر.`
          }
          title="تسوية الرصيد"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", balanceMeta.badgeClassName)}>
            {balanceMeta.description}
          </span>
          <Button
            disabled={!debtAccount || balanceDzd === 0 || settleDebtAccountMutation.isPending}
            variant="outline"
            onClick={() =>
              debtAccount
                ? settleDebtAccountMutation.mutate({
                    debtAccountId: debtAccount.id,
                    entryDate: entryDate ? toAlgeriaDayBoundaryIso(entryDate, "start") : undefined,
                    note: note.trim() || null,
                  })
                : undefined
            }
          >
            تسوية إلى صفر
          </Button>
        </div>
      </Surface>

      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">التاريخ</th>
                <th className="px-4 py-3 text-start font-medium">النوع</th>
                <th className="px-4 py-3 text-start font-medium">المبلغ</th>
                <th className="px-4 py-3 text-start font-medium">الرصيد بعد الحركة</th>
                <th className="px-4 py-3 text-start font-medium">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.length > 0 ? (
                sortedEntries.map((entry) => {
                  const amountMeta = getDebtBalanceMeta(entry.signedAmountDzd)
                  // balanceAfterDzd is the per-account running balance,
                  // so its color follows the account direction (same
                  // convention as the stat card above).
                  const balanceAfterMeta = debtAccount
                    ? getDebtAccountBalanceMeta({
                        currentBalance: entry.balanceAfterDzd,
                        direction: debtAccount.direction,
                      })
                    : getDebtBalanceMeta(entry.balanceAfterDzd)

                  return (
                    <tr key={entry.id} className="border-t border-border/60 bg-background/75">
                      <td className="px-4 py-4 text-start text-foreground">{new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{getDebtEntryTypeLabel(entry.entryType)}</td>
                      <td className={cn("px-4 py-4 text-start font-mono", amountMeta.textClassName)} dir="ltr">
                        دج {formatDebtMoney(entry.signedAmountDzd)}
                      </td>
                      <td className={cn("px-4 py-4 text-start font-mono", balanceAfterMeta.textClassName)} dir="ltr">
                        دج {formatDebtMoney(entry.balanceAfterDzd)}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{entry.note?.trim() || "—"}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                    لا توجد حركات دين بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  )
}
