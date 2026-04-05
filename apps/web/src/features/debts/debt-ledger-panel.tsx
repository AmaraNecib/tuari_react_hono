import { useEffect, useMemo, useState } from "react"
import type { DebtAccount, DebtClosureLink, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { CurrencyInput, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import {
  useCloseDebtAgainstMutation,
  useCreateDebtEntryMutation,
  useSettleDebtAccountMutation,
} from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"

import { formatDebtMoney, getDebtAccountBalance, getDebtBalanceMeta, getDebtEntryTypeLabel, sortDebtEntries } from "./debt-utils"

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
  closeAgainstOptions,
  closureLinks,
  debtAccount,
  debtEntries,
  relatedAccounts,
  title,
}: {
  closeAgainstOptions: Array<{ account: DebtAccount; label: string }>
  closureLinks: DebtClosureLink[]
  debtAccount: DebtAccount | null
  debtEntries: DebtEntry[]
  relatedAccounts: DebtAccount[]
  title: string
}) {
  const closeDebtAgainstMutation = useCloseDebtAgainstMutation()
  const createDebtEntryMutation = useCreateDebtEntryMutation()
  const settleDebtAccountMutation = useSettleDebtAccountMutation()
  const [entryDate, setEntryDate] = useState(() => getAlgeriaDateInputValue())
  const [note, setNote] = useState("")
  const [signedAmount, setSignedAmount] = useState("")
  const [closureDate, setClosureDate] = useState(() => getAlgeriaDateInputValue())
  const [closureNote, setClosureNote] = useState("")
  const [targetDebtAccountId, setTargetDebtAccountId] = useState("")
  const sortedEntries = useMemo(() => sortDebtEntries(debtEntries), [debtEntries])
  const relatedAccountsById = useMemo(() => new Map(relatedAccounts.map((account) => [account.id, account])), [relatedAccounts])
  const balanceDzd = getDebtAccountBalance(debtAccount)
  const balanceMeta = getDebtBalanceMeta(balanceDzd)
  const normalizedAmount = signedAmount.trim()
  const signedAmountValue = normalizedAmount.length > 0 ? Number(normalizedAmount) : null
  const hasValidAmount = signedAmountValue !== null && Number.isFinite(signedAmountValue) && signedAmountValue !== 0
  const hasCloseAgainstTarget = targetDebtAccountId.trim().length > 0

  useEffect(() => {
    setEntryDate(getAlgeriaDateInputValue())
    setNote("")
    setSignedAmount("")
    setClosureDate(getAlgeriaDateInputValue())
    setClosureNote("")
    setTargetDebtAccountId(closeAgainstOptions[0]?.account.id ?? "")
  }, [closeAgainstOptions, debtAccount?.id])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DebtStatCard
          label="الرصيد الحالي"
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
              ? "الموجب بالأخضر يعني أن الطرف مدين لنا. السالب بالأحمر يعني أننا مدينون له."
              : "أنشئ أو اختر حالة دين أولًا قبل إضافة قيود جديدة."
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
            <Textarea placeholder="وصف مختصر للقيد" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">اكتب قيمة موجبة إذا كان المبلغ لنا، أو سالبة إذا كان علينا.</p>
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
            حفظ القيد
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            balanceDzd === 0
              ? "لا توجد حاجة إلى تسوية إضافية لأن الرصيد مغلق بالفعل."
              : `سيتم إنشاء قيد تسوية يعاكس الرصيد الحالي (${formatDebtMoney(-balanceDzd)} دج).`
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

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            debtAccount
              ? closeAgainstOptions.length > 0
                ? "أغلق هذه الحالة مقابل حالة معاكسة من نفس الطرف لإنقاص الرصيدين معًا."
                : "لا توجد حالة مقابلة بإشارة معاكسة لهذا الطرف حاليًا."
              : "اختر حالة دين أولًا قبل استخدام الإغلاق مقابل حالة أخرى."
          }
          title="إغلاق مقابل حالة أخرى"
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">الحالة المقابلة</span>
            <NativeSelect
              disabled={!debtAccount || closeAgainstOptions.length === 0}
              value={targetDebtAccountId}
              onChange={(event) => setTargetDebtAccountId(event.target.value)}
            >
              <option value="">اختر حالة مقابلة</option>
              {closeAgainstOptions.map((option) => (
                <option key={option.account.id} value={option.account.id}>
                  {option.label} — {formatDebtMoney(option.account.currentBalanceDzd)} دج
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">تاريخ الإغلاق</span>
            <input
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              type="date"
              value={closureDate}
              onChange={(event) => setClosureDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
            <span className="text-sm font-medium text-foreground">ملاحظة الإغلاق</span>
            <Textarea placeholder="سبب مختصر للإغلاق بين الحالتين" value={closureNote} onChange={(event) => setClosureNote(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            سيتم إغلاق أصغر رصيد ممكن بين الحالتين تلقائيًا.
          </p>
          <Button
            disabled={!debtAccount || balanceDzd === 0 || !hasCloseAgainstTarget || closeDebtAgainstMutation.isPending}
            variant="outline"
            onClick={() =>
              debtAccount
                ? closeDebtAgainstMutation.mutate({
                    entryDate: closureDate ? toAlgeriaDayBoundaryIso(closureDate, "start") : undefined,
                    note: closureNote.trim() || null,
                    sourceDebtAccountId: debtAccount.id,
                    targetDebtAccountId,
                  })
                : undefined
            }
          >
            إغلاق مقابل الحالة المختارة
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description="يعرض عمليات الإغلاق التي ربطت هذه الحالة بحالات أخرى من نفس الطرف."
          title="سجل الإغلاق"
        />

        <div className="mt-4 space-y-3">
          {closureLinks.length > 0 ? (
            closureLinks.map((link) => {
              const isSource = link.sourceDebtAccountId === debtAccount?.id
              const otherAccountId = isSource ? link.targetDebtAccountId : link.sourceDebtAccountId
              const otherAccount = relatedAccountsById.get(otherAccountId)
              const otherLabel = otherAccount
                ? otherAccount.note?.trim() || `حالة مرتبطة`
                : "حالة مرتبطة"

              return (
                <div key={link.id} className="rounded-[20px] border border-border/70 bg-background/60 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-foreground">
                      {isSource ? "أُغلق من هذه الحالة مقابل" : "أُغلق على هذه الحالة من"} {otherLabel}
                    </p>
                    <span className="font-mono text-foreground" dir="ltr">
                      دج {formatDebtMoney(link.closedAmountDzd)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {new Intl.DateTimeFormat("ar-DZ").format(new Date(link.entryDate))}
                  </p>
                  <p className="mt-1 text-muted-foreground">{link.note?.trim() || "—"}</p>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد عمليات إغلاق مرتبطة بهذه الحالة بعد.</p>
          )}
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
                <th className="px-4 py-3 text-start font-medium">الرصيد بعد القيد</th>
                <th className="px-4 py-3 text-start font-medium">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.length > 0 ? (
                sortedEntries.map((entry) => {
                  const amountMeta = getDebtBalanceMeta(entry.signedAmountDzd)

                  return (
                    <tr key={entry.id} className="border-t border-border/60 bg-background/75">
                      <td className="px-4 py-4 text-start text-foreground">{new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{getDebtEntryTypeLabel(entry.entryType)}</td>
                      <td className={cn("px-4 py-4 text-start font-mono", amountMeta.textClassName)} dir="ltr">
                        دج {formatDebtMoney(entry.signedAmountDzd)}
                      </td>
                      <td className={cn("px-4 py-4 text-start font-mono", getDebtBalanceMeta(entry.balanceAfterDzd).textClassName)} dir="ltr">
                        دج {formatDebtMoney(entry.balanceAfterDzd)}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{entry.note?.trim() || "—"}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                    لا توجد قيود دين بعد.
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
