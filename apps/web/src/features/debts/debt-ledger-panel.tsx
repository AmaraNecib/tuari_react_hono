/**
 * Debt ledger panel for viewing transaction history.
 * Displays all debt entries with filtering and sorting.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import {
  useCreateDebtEntryMutation,
  useSettleDebtAccountMutation,
} from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"

import { formatDebtAmount, formatDebtMoney, getDebtAccountBalance, getDebtBalanceDisplay, getDebtDirectionLabel, getDebtEntryTypeLabel, sortDebtEntries } from "./debt-utils"
import { RecordEntryPaymentDialog } from "./record-entry-payment-dialog"
import { VoidEntryDialog } from "./void-entry-dialog"

function DebtStatCard({ label, value, valueClassName, phrase }: { label: string; value: string; valueClassName?: string; phrase?: string }) {
  return (
    <Surface className="rounded-xl px-5 py-4" variant="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      {phrase ? <p className={cn("mt-2 text-sm font-semibold", valueClassName)}>{phrase}</p> : null}
      <p className={cn("mt-1 font-mono text-xl font-semibold", valueClassName)} dir="ltr">
        {value}
      </p>
    </Surface>
  )
}

/**
 * @description Component
 */
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
  const { t } = useTranslation()
  const [paymentTargetEntry, setPaymentTargetEntry] = useState<DebtEntry | null>(null)
  const [voidTargetEntry, setVoidTargetEntry] = useState<DebtEntry | null>(null)
  const [entryDate, setEntryDate] = useState(() => getAlgeriaDateInputValue())
  const [note, setNote] = useState("")
  const [signedAmount, setSignedAmount] = useState("")
  const sortedEntries = useMemo(() => sortDebtEntries(debtEntries), [debtEntries])
  const balanceDzd = getDebtAccountBalance(debtAccount)
  // Issue #22: the running balance is per-account, so its phrase and color
  // must respect the account's direction. The display helper flips a signed
  // balance into a positive amount plus a phrase, so a negative balance can
  // never contradict the direction words.
  const balance = getDebtBalanceDisplay({
    currentBalance: balanceDzd,
    direction: debtAccount?.direction,
  })
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
          phrase={t(balance.phraseKey)}
          value={`دج ${formatDebtAmount(balance.amount)}`}
          valueClassName={balance.textClassName}
        />
        <DebtStatCard label="الحالة" value={t(balance.phraseKey)} valueClassName={balance.textClassName} />
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
            <DatePicker value={entryDate} onChange={setEntryDate} />
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
            {t("debts.terminology.buttons.recordPayment")}
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            balanceDzd === 0
              ? "الرصيد مغلق بالفعل."
              : `سيتم إنشاء حركة تسوية بقيمة ${formatDebtAmount(balanceDzd)} دج لإرجاع الرصيد إلى صفر.`
          }
          title="تسوية الرصيد"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", balance.badgeClassName)}>
            {balance.description}
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
                  <th className="px-4 py-3 text-start font-medium">الحالة</th>
                  <th className="px-4 py-3 text-start font-medium">ملاحظة</th>
                  <th className="px-4 py-3 text-start font-medium">الإجراءات</th>
                </tr>
            </thead>
            <tbody>
              {sortedEntries.length > 0 ? (
                sortedEntries.map((entry) => {
                  // Movement tone follows the account direction: a positive
                  // movement on a PAYABLE account increases what we owe.
                  const amountDisplay = getDebtBalanceDisplay({
                    currentBalance: entry.signedAmountDzd,
                    direction: debtAccount?.direction,
                  })
                  // balanceAfterDzd is the per-account running balance,
                  // so its phrase and color follow the account direction.
                  const balanceAfter = getDebtBalanceDisplay({
                    currentBalance: entry.balanceAfterDzd,
                    direction: debtAccount?.direction,
                  })

                  const isLive = entry.status === "LIVE"

                  return (
                    <tr key={entry.id} className={cn("border-t border-border/60", !isLive && "opacity-50")}>
                      <td className="px-4 py-4 text-start text-foreground">
                        {new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">
                        {getDebtEntryTypeLabel(entry.entryType)}
                      </td>
                      <td className={cn("px-4 py-4 text-start font-mono", amountDisplay.textClassName)} dir="ltr">
                        دج {formatDebtMoney(entry.signedAmountDzd)}
                      </td>
                      <td className={cn("px-4 py-4 text-start font-mono", balanceAfter.textClassName)}>
                        <span className="block text-xs font-medium">{t(balanceAfter.phraseKey)}</span>
                        <span dir="ltr">دج {formatDebtAmount(balanceAfter.amount)}</span>
                      </td>
                      <td className="px-4 py-4 text-start">
                        {isLive ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            نشط
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                            ملغية
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">
                        {entry.note?.trim() || "—"}
                      </td>
                      <td className="px-4 py-4 text-start">
                        <div className="flex gap-1.5">
                          {isLive && entry.entryType === "OPENING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPaymentTargetEntry(entry)}
                            >
                              دفعة
                            </Button>
                          )}
                          {isLive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:text-rose-700"
                              onClick={() => setVoidTargetEntry(entry)}
                            >
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                    لا توجد حركات دين بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      <RecordEntryPaymentDialog
        entry={paymentTargetEntry}
        accountCurrentBalance={debtAccount?.currentBalance ?? 0}
        accountDirection={debtAccount?.direction}
        open={paymentTargetEntry !== null}
        onOpenChange={() => setPaymentTargetEntry(null)}
      />
      <VoidEntryDialog
        entry={voidTargetEntry}
        accountDirection={debtAccount?.direction}
        livePaymentEntries={sortedEntries.filter(e => e.entryType === "PAYMENT" && e.status === "LIVE")}
        open={voidTargetEntry !== null}
        onOpenChange={() => setVoidTargetEntry(null)}
      />
    </div>
  )
}
