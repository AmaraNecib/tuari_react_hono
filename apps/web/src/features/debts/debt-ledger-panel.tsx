import { i18n as featureI18n } from "@/i18n"
import { AppDate } from "@/components/app-date"
/**
 * Debt ledger panel for viewing transaction history.
 * Displays all debt entries with filtering and sorting.
 */
import { CurrencyProse } from "@/features/shared/currency-prose"
import { CurrencyRun } from "@/features/shared/money-value"
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

import { formatDebtAmount, formatDebtMoney, getDebtAccountBalanceDisplay, getDebtDirectionLabel, getDebtEntryTypeLabel, sortDebtEntries } from "./debt-utils"
import { RecordEntryPaymentDialog } from "./record-entry-payment-dialog"
import { resolveDebtPaymentAction } from "./debt-payment"
import { DebtPaymentPreview } from "./debt-payment-preview"
import { VoidEntryDialog } from "./void-entry-dialog"

function DebtStatCard({ label, value, valueClassName, phrase }: { label: string; value: import("react").ReactNode; valueClassName?: string; phrase?: string }) {
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
  debtAccount: DebtAccount
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
  const balanceDzd = debtAccount.currentBalance
  // Issue #22: the running balance is per-account, so its phrase and color
  // must respect the account's direction. The display helper flips a signed
  // balance into a positive amount plus a phrase, so a negative balance can
  // never contradict the direction words.
  const balance = getDebtAccountBalanceDisplay(debtAccount)
  const paymentAction = resolveDebtPaymentAction(debtAccount, signedAmount)
  const paymentBlockedReason = !paymentAction ? "debts.cases.amountInvalid" : createDebtEntryMutation.isPending ? "debts.cases.saving" : null

  useEffect(() => {
    setEntryDate(getAlgeriaDateInputValue())
    setNote("")
    setSignedAmount("")
  }, [debtAccount.id])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DebtStatCard
          label={featureI18n.t("featureCopy.debtLedgerPanel.currentBalance", { value1: getDebtDirectionLabel(debtAccount.direction) })}
          phrase={balance.phrase}
          value={<CurrencyRun amount={formatDebtAmount(balance.amount)} currencyLabel={featureI18n.t("featureCopy.debtLedgerPanel.currency")} />}
          valueClassName={balance.textClassName}
        />
        <DebtStatCard label={featureI18n.t("featureCopy.debtLedgerPanel.status")} value={balance.phrase} valueClassName={balance.textClassName} />
        <DebtStatCard label={featureI18n.t("featureCopy.debtLedgerPanel.entryCount")} value={String(sortedEntries.length)} />
      </div>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={t("debts.cases.recordPaymentDescription")}
          title={title}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{featureI18n.t("featureCopy.debtLedgerPanel.date")}</span>
            <DatePicker value={entryDate} onChange={setEntryDate} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("debts.payment.amount")}</span>
            <CurrencyInput placeholder={t("debts.payment.groupedAmountPlaceholder")} value={signedAmount} onChange={(event) => setSignedAmount(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
            <span className="text-sm font-medium text-foreground">{featureI18n.t("featureCopy.debtLedgerPanel.note")}</span>
            <Textarea placeholder={t("debts.payment.ledgerNotePlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 space-y-3">
          {paymentAction ? <DebtPaymentPreview action={paymentAction} direction={debtAccount.direction} /> : null}
          {paymentBlockedReason ? <p className="text-sm text-destructive" aria-live="polite">{t(paymentBlockedReason)}</p> : null}
          <Button
            disabled={!paymentAction || createDebtEntryMutation.isPending}
            onClick={() => {
              if (!paymentAction) return
              createDebtEntryMutation.mutate({
                ...paymentAction.input,
                entryDate: entryDate ? toAlgeriaDayBoundaryIso(entryDate, "start") : undefined,
                note: note.trim() || null,
              }, { onSuccess: () => {
                setSignedAmount((current) => current === signedAmount ? "" : current)
                setNote((current) => current === note ? "" : current)
              } })
            }}
          >
            {t("debts.terminology.buttons.recordPayment")}
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            balanceDzd === 0
              ? featureI18n.t("featureCopy.debtLedgerPanel.alreadyClosed")
              : <CurrencyProse text={featureI18n.t("featureCopy.debtLedgerPanel.settlementDescription", { value1: formatDebtAmount(balanceDzd) })} />
          }
          title={featureI18n.t("featureCopy.debtLedgerPanel.settleBalance")}
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", balance.badgeClassName)}>
            {balance.description}
          </span>
          <Button
            disabled={balanceDzd === 0 || settleDebtAccountMutation.isPending}
            variant="outline"
            onClick={() =>
              settleDebtAccountMutation.mutate({
                debtAccountId: debtAccount.id,
                entryDate: entryDate ? toAlgeriaDayBoundaryIso(entryDate, "start") : undefined,
                note: note.trim() || null,
              })
            }
          >
            {featureI18n.t("featureCopy.debtLedgerPanel.settleToZero")}</Button>
        </div>
      </Surface>

      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                  <th className="px-4 py-3 text-start font-medium">{featureI18n.t("featureCopy.debtLedgerPanel.date")}</th>
                  <th className="px-4 py-3 text-start font-medium">{featureI18n.t("featureCopy.debtLedgerPanel.type")}</th>
                  <th className="px-4 py-3 text-start font-medium">{featureI18n.t("featureCopy.debtLedgerPanel.amount")}</th>
                  <th className="px-4 py-3 text-start font-medium">{featureI18n.t("featureCopy.debtLedgerPanel.balanceAfter")}</th>
                  <th className="px-4 py-3 text-start font-medium">{featureI18n.t("featureCopy.debtLedgerPanel.status")}</th>
                  <th className="px-4 py-3 text-start font-medium">{featureI18n.t("featureCopy.debtLedgerPanel.note")}</th>
                  <th className="px-4 py-3 text-start font-medium">{featureI18n.t("featureCopy.debtLedgerPanel.actions")}</th>
                </tr>
            </thead>
            <tbody>
              {sortedEntries.length > 0 ? (
                sortedEntries.map((entry) => {
                  // Movement tone follows the account direction: a positive
                  // movement on a PAYABLE account increases what we owe.
                  const amountDisplay = getDebtAccountBalanceDisplay({
                    currentBalance: entry.signedAmountDzd,
                    direction: debtAccount.direction,
                  })
                  // balanceAfterDzd is the per-account running balance,
                  // so its phrase and color follow the account direction.
                  const balanceAfter = getDebtAccountBalanceDisplay({
                    currentBalance: entry.balanceAfterDzd,
                    direction: debtAccount.direction,
                  })

                  const isLive = entry.status === "LIVE"

                  return (
                    <tr key={entry.id} className={cn("border-t border-border/60", !isLive && "opacity-50")}>
                      <td className="px-4 py-4 text-start text-foreground">
                        {<AppDate value={entry.entryDate} />}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">
                        {getDebtEntryTypeLabel(entry.entryType)}
                      </td>
                      <td className={cn("px-4 py-4 text-start font-mono", amountDisplay.textClassName)} dir="ltr">
                        <CurrencyRun amount={formatDebtMoney(entry.signedAmountDzd)} currencyLabel={featureI18n.t("featureCopy.debtLedgerPanel.currency")} />
                      </td>
                      <td className={cn("px-4 py-4 text-start font-mono", balanceAfter.textClassName)}>
                        <span className="block text-xs font-medium">{balanceAfter.phrase}</span>
                        <span dir="ltr"><CurrencyRun amount={formatDebtAmount(balanceAfter.amount)} currencyLabel={featureI18n.t("featureCopy.debtLedgerPanel.currency")} /></span>
                      </td>
                      <td className="px-4 py-4 text-start">
                        {isLive ? (
                          <span className="inline-flex items-center rounded-full bg-good/10 px-2.5 py-0.5 text-xs font-medium text-good">
                            {featureI18n.t("featureCopy.debtLedgerPanel.active")}</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-bad/10 px-2.5 py-0.5 text-xs font-medium text-bad">
                            {featureI18n.t("featureCopy.debtLedgerPanel.voided")}</span>
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
                              {featureI18n.t("featureCopy.debtLedgerPanel.payment")}</Button>
                          )}
                          {isLive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-bad hover:text-bad"
                              onClick={() => setVoidTargetEntry(entry)}
                            >
                              {featureI18n.t("featureCopy.debtLedgerPanel.void")}</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                    {featureI18n.t("featureCopy.debtLedgerPanel.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      <RecordEntryPaymentDialog
        entry={paymentTargetEntry}
        accountCurrentBalance={debtAccount.currentBalance}
        accountDirection={debtAccount.direction}
        open={paymentTargetEntry !== null}
        onOpenChange={() => setPaymentTargetEntry(null)}
      />
      <VoidEntryDialog
        entry={voidTargetEntry}
        accountDirection={debtAccount.direction}
        livePaymentEntries={sortedEntries.filter(e => e.entryType === "PAYMENT" && e.status === "LIVE")}
        open={voidTargetEntry !== null}
        onOpenChange={() => setVoidTargetEntry(null)}
      />
    </div>
  )
}
