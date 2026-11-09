import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { Field } from "@/components/ui/field"
import { useCreateDebtAccountMutation, useCreateDebtEntryMutation } from "@/features/app-shell/mock-dashboard"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"

import { ConsolidationDialog } from "./consolidation-dialog"
import { DebtLedgerPanel } from "./debt-ledger-panel"
import { parseDebtAmount, resolveDebtPaymentAction } from "./debt-payment"
import { DebtPaymentPreview } from "./debt-payment-preview"
import {
  debtDirectionFromAlias,
  formatDebtAmount,
  findAccountByDirection,
  getDebtAccountBalanceDisplay,
  getDebtDirectionLabel,
  resolveDebtCasesFormAction,
  sortDebtAccounts,
  type DebtDirectionAlias,
} from "./debt-utils"

function CasesStatCard({ label, value, valueClassName, phrase }: { label: string; value: string; valueClassName?: string; phrase?: string }) {
  return (
    <Surface className="rounded-xl px-5 py-4" variant="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      {phrase ? <p className={`mt-2 text-sm font-semibold ${valueClassName ?? ""}`.trim()}>{phrase}</p> : null}
      <p className={`mt-1 font-mono text-xl font-semibold ${valueClassName ?? ""}`.trim()} dir="ltr">
        {value}
      </p>
    </Surface>
  )
}

/** Debt cases panel with consolidation actions. */
/**
 * @description Component
 */
export function DebtCasesPanel({
  accounts,
  debtEntriesByAccountId,
  externalCounterpartyId,
  title,
  workerId,
}: {
  accounts: DebtAccount[]
  debtEntriesByAccountId: Record<string, DebtEntry[]>
  externalCounterpartyId?: string
  title: string
  workerId?: string
}) {
  const createDebtAccountMutation = useCreateDebtAccountMutation()
  const createDebtEntryMutation = useCreateDebtEntryMutation()
  const [createDate, setCreateDate] = useState(() => getAlgeriaDateInputValue())
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [selectedDirection, setDirection] = useState<DebtDirectionAlias | null>(null)
  const direction = selectedDirection ?? (accounts.length === 1 && accounts[0]?.direction === "RECEIVABLE" ? "owed-to-us" : "owed-by-us")
  const [consolidationDialogOpen, setConsolidationDialogOpen] = useState(false)
  const sortedAccounts = useMemo(() => sortDebtAccounts(accounts), [accounts])
  const amountValue = amount.trim().length === 0 ? 0 : parseDebtAmount(amount)
  // The direction carries the meaning; the opening amount is always a positive
  // magnitude (a signed balance is never stored or shown).
  const accountDirection = debtDirectionFromAlias(direction)
  // The label, the description and the submit must agree: an account on the
  // chosen ledger means this amount is a payment on it, otherwise the form opens
  // that account. One resolver feeds all four.
  const accountAction = resolveDebtCasesFormAction(sortedAccounts, accountDirection)
  const isRecordingPayment = accountAction.kind === "record-payment"
  const debtAccount = accountAction.kind === "record-payment" ? accountAction.account : null
  const paymentAction = debtAccount ? resolveDebtPaymentAction(debtAccount, amount) : null
  // One rule names the block, feeds the disabled state and the on-screen reason.
  // An unparseable amount is invalid in both modes; a payment additionally needs
  // a non-zero magnitude. An opening amount is optional on the create path, so
  // an empty one is a legitimate account with no opening entry.
  const amountBlockedReasonKey = amountValue === null
    ? "debts.cases.amountInvalid"
    : isRecordingPayment && amountValue === 0
      ? "debts.cases.paymentAmountRequired"
      : null
  // Both mutations gate the submit. The account refresh can flip the form to
  // "record-payment" while the opening save is still in flight, and the button
  // then watches the now-idle entry mutation — a second click would post the
  // opening amount as a payment and cancel the debt. The original amount is
  // only cleared after the save resolves, so pending means blocked.
  const isSubmitDisabled =
    createDebtEntryMutation.isPending ||
    createDebtAccountMutation.isPending ||
    amountBlockedReasonKey !== null
  // A disabled save must say why, on screen. The amount is the only input the
  // operator can fix; while a save is in flight the reason is the save itself.
  const saveBlockedReasonKey =
    amountBlockedReasonKey ?? (isSubmitDisabled ? "debts.cases.saving" : null)

  // Balance and entry count describe the ledger selected by the form.
  const selectedEntryCount = useMemo(
    () => debtAccount ? (debtEntriesByAccountId[debtAccount.id] ?? []).length : 0,
    [debtAccount, debtEntriesByAccountId],
  )
  const balance = getDebtAccountBalanceDisplay(debtAccount ?? { currentBalance: 0, direction: accountDirection })

  const payableAccount = useMemo(
    () => findAccountByDirection(sortedAccounts, "PAYABLE"),
    [sortedAccounts],
  )
  const receivableAccount = useMemo(
    () => findAccountByDirection(sortedAccounts, "RECEIVABLE"),
    [sortedAccounts],
  )
  const hasBothDirections = payableAccount !== null && receivableAccount !== null
  const payableEntries = payableAccount ? debtEntriesByAccountId[payableAccount.id] ?? [] : []
  const receivableEntries = receivableAccount ? debtEntriesByAccountId[receivableAccount.id] ?? [] : []
  const hasConsolidatableOpenings =
    hasBothDirections &&
    payableEntries.some((e) => e.status === "LIVE" && e.entryType === "OPENING") &&
    receivableEntries.some((e) => e.status === "LIVE" && e.entryType === "OPENING")

  const payableBalance = useMemo(
    () => (payableAccount ? getDebtAccountBalanceDisplay(payableAccount) : null),
    [payableAccount],
  )
  const receivableBalance = useMemo(
    () => (receivableAccount ? getDebtAccountBalanceDisplay(receivableAccount) : null),
    [receivableAccount],
  )

  const { t } = useTranslation()
  // One construction of the request, reused by both submit branches so the
  // payment and the opening cannot drift.
  const entryDateIso = createDate ? toAlgeriaDayBoundaryIso(createDate, "start") : undefined
  const trimmedNote = note.trim() || null
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <CasesStatCard
          label={`${t("debts.cases.currentBalance")} — ${getDebtDirectionLabel(accountDirection)}`}
          phrase={balance.phrase}
          value={`دج ${formatDebtAmount(balance.amount)}`}
          valueClassName={balance.textClassName}
        />
        <CasesStatCard label={t("debts.cases.accountCount")} value={String(sortedAccounts.length)} />
        <CasesStatCard label={t("debts.cases.entryCount")} value={String(selectedEntryCount)} />
      </div>

      {hasBothDirections ? (
        <Surface className="p-5" variant="card">
          <SurfaceHeader
            description={t("debts.consolidateDescription")}
            title={t("debts.cases.consolidateTitle")}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm text-muted-foreground">
                {getDebtDirectionLabel(payableAccount!.direction)} · {payableBalance!.phrase} دج {formatDebtAmount(payableBalance!.amount)}
                {` — `}
                {getDebtDirectionLabel(receivableAccount!.direction)} · {receivableBalance!.phrase} دج {formatDebtAmount(receivableBalance!.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasConsolidatableOpenings
                  ? t("debts.selectOneFromEachSide")
                  : t("debts.cases.noConsolidatable")}
              </p>
            </div>
            <Button
              disabled={!hasConsolidatableOpenings}
              variant="outline"
              onClick={() => setConsolidationDialogOpen(true)}
            >
              {t("debts.cases.openConsolidation")}
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={isRecordingPayment ? t("debts.cases.recordPaymentDescription") : t("debts.cases.createAccountDescription")}
          title={isRecordingPayment ? t("debts.cases.recordPayment") : t("debts.cases.createAccount")}
        />

        <div className="mt-5 space-y-2">
          <label className="text-sm font-medium text-foreground">{t("detailPages.debt.chooseDirection")}</label>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              className={cn(
                "rounded-xl border p-3 transition-all",
                direction === "owed-to-us"
                  ? "border-emerald-500/30 bg-primary/8"
                  : "border-border/60 hover:bg-muted/40",
              )}
              type="button"
              onClick={() => setDirection("owed-to-us")}
            >
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                {t("detailPages.debt.direction.owedToUs")}
              </p>
            </button>
            <button
              className={cn(
                "rounded-xl border p-3 transition-all",
                direction === "owed-by-us"
                  ? "border-rose-500/30 bg-primary/8"
                  : "border-border/60 hover:bg-muted/40",
              )}
              type="button"
              onClick={() => setDirection("owed-by-us")}
            >
              <p className="font-semibold text-rose-700 dark:text-rose-300">
                {t("detailPages.debt.direction.owedByUs")}
              </p>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label={t("common.createDate", "التاريخ")}>
            <DatePicker value={createDate} onChange={(value) => { setDirection(direction); setCreateDate(value) }} />
          </Field>
          <Field label={t("debts.cases.amount")}>
            <CurrencyInput placeholder={t("debts.cases.amountPlaceholder")} value={amount} onChange={(event) => { setDirection(direction); setAmount(event.target.value) }} />
          </Field>
          <Field label={t("debts.cases.note")} className="md:col-span-2">
            <Textarea placeholder={t("debts.cases.notePlaceholder")} value={note} onChange={(event) => { setDirection(direction); setNote(event.target.value) }} />
          </Field>
        </div>

        {paymentAction ? <div className="mt-4"><DebtPaymentPreview action={paymentAction} direction={accountDirection} /></div> : null}
        <PageFooterActions className="mt-4">
          {saveBlockedReasonKey ? (
            <p aria-live="polite" className="self-center text-sm text-destructive" role="status">
              {t(saveBlockedReasonKey)}
            </p>
          ) : null}
          <Button
            disabled={isSubmitDisabled}
            onClick={async () => {
              if (isSubmitDisabled || amountValue === null) return
              try {
                if (accountAction.kind === "record-payment") {
                  if (!paymentAction) return
                  await createDebtEntryMutation.mutateAsync({
                    ...paymentAction.input,
                    entryDate: entryDateIso,
                    note: trimmedNote,
                  })
                } else {
                  await createDebtAccountMutation.mutateAsync({
                    externalCounterpartyId: externalCounterpartyId ?? null,
                    note: trimmedNote,
                    direction: accountDirection,
                    openingBalanceDzd: amountValue === 0 ? undefined : Math.abs(amountValue),
                    openingEntryDate: entryDateIso,
                    openingEntryNote: trimmedNote,
                    partyType: workerId ? "INTERNAL_WORKER" : "EXTERNAL_COUNTERPARTY",
                    workerId: workerId ?? null,
                  })
                }

                setCreateDate((current) => current === createDate ? getAlgeriaDateInputValue() : current)
                setAmount((current) => current === amount ? "" : current)
                setNote((current) => current === note ? "" : current)
              } catch {
                // The mutation's onError toast reports failure; preserve the draft.
              }
            }}
          >
            {isRecordingPayment ? t("debts.cases.recordPaymentButton") : t("debts.cases.createAccountButton")}
          </Button>
        </PageFooterActions>
      </Surface>

      {sortedAccounts.map((account) => (
        <DebtLedgerPanel
          key={account.id}
          debtAccount={account}
          debtEntries={debtEntriesByAccountId[account.id] ?? []}
          title={`${title} - ${getDebtDirectionLabel(account.direction)}`}
        />
      ))}

      {payableAccount && receivableAccount ? (
        <ConsolidationDialog
          payableAccount={payableAccount}
          receivableAccount={receivableAccount}
          payableEntries={payableEntries}
          receivableEntries={receivableEntries}
          open={consolidationDialogOpen}
          onOpenChange={setConsolidationDialogOpen}
        />
      ) : null}
    </div>
  )
}
