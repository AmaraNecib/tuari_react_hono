import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount, DebtClosureLink, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { useCreateDebtAccountMutation } from "@/features/app-shell/mock-dashboard"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"

import { DebtLedgerPanel } from "./debt-ledger-panel"
import { RecordPaymentDialog } from "./record-payment-dialog"
import {
  formatDebtCaseLabel,
  formatDebtMoney,
  getCombinedDebtBalance,
  getDebtBalanceMeta,
  sortDebtAccounts,
} from "./debt-utils"

function CasesStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Surface className="rounded-[22px] px-5 py-4" variant="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-mono text-xl font-semibold", valueClassName)} dir="ltr">
        {value}
      </p>
    </Surface>
  )
}

export function DebtCasesPanel({
  accounts,
  debtClosureLinksByAccountId,
  debtEntriesByAccountId,
  externalCounterpartyId,
  title,
  workerId,
  selectedAccountId,
  onSelectedAccountIdChange,
  hideDebtLedgerPanel,
}: {
  accounts: DebtAccount[]
  debtClosureLinksByAccountId: Record<string, DebtClosureLink[]>
  debtEntriesByAccountId: Record<string, DebtEntry[]>
  externalCounterpartyId?: string
  title: string
  workerId?: string
  selectedAccountId?: string | null
  onSelectedAccountIdChange?: (accountId: string | null) => void
  hideDebtLedgerPanel?: boolean
}) {
  const { t } = useTranslation()
  const createDebtAccountMutation = useCreateDebtAccountMutation()
  const [internalSelectedAccountId, setInternalSelectedAccountId] = useState<string | null>(null)
  const [paymentTargetAccountId, setPaymentTargetAccountId] = useState<string | null>(null)
  const resolvedSelectedAccountId = selectedAccountId !== undefined ? selectedAccountId : internalSelectedAccountId
  const setResolvedSelectedAccountId = onSelectedAccountIdChange ?? setInternalSelectedAccountId
  const [createDate, setCreateDate] = useState(() => getAlgeriaDateInputValue())
  const [openingBalance, setOpeningBalance] = useState("")
  const [caseNote, setCaseNote] = useState("")
  const sortedAccounts = useMemo(() => sortDebtAccounts(accounts), [accounts])
  const combinedBalance = getCombinedDebtBalance(sortedAccounts)
  const combinedBalanceMeta = getDebtBalanceMeta(combinedBalance, t)
  const selectedAccount = sortedAccounts.find((account) => account.id === resolvedSelectedAccountId) ?? sortedAccounts[0] ?? null
  const closeAgainstOptions = useMemo(() => {
    if (!selectedAccount || selectedAccount.currentBalanceDzd === 0) {
      return []
    }

    return sortedAccounts
      .filter(
        (account) =>
          account.id !== selectedAccount.id &&
          account.currentBalanceDzd !== 0 &&
          Math.sign(account.currentBalanceDzd) === -Math.sign(selectedAccount.currentBalanceDzd),
      )
      .map((account) => ({
        account,
        label: formatDebtCaseLabel(account, sortedAccounts.findIndex((item) => item.id === account.id), t),
      }))
  }, [selectedAccount, sortedAccounts, t])
  const normalizedOpeningBalance = openingBalance.trim()
  const openingBalanceValue = normalizedOpeningBalance.length > 0 ? Number(normalizedOpeningBalance) : 0
  const hasValidOpeningBalance = Number.isFinite(openingBalanceValue)
  const openCasesCount = sortedAccounts.filter((account) => account.status === "OPEN").length
  const paymentTargetAccount = paymentTargetAccountId
    ? sortedAccounts.find((a) => a.id === paymentTargetAccountId) ?? null
    : null

  useEffect(() => {
    // Only set default selection if not controlled by parent
    if (selectedAccountId === undefined) {
      setInternalSelectedAccountId((currentValue) => {
        if (currentValue && sortedAccounts.some((account) => account.id === currentValue)) {
          return currentValue
        }

        return sortedAccounts[0]?.id ?? null
      })
    }
  }, [sortedAccounts, selectedAccountId])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <CasesStatCard label={t("detailPages.debt.casesPanel.statsLabel")} value={`${t("detailPages.debt.currency")} ${formatDebtMoney(combinedBalance)}`} valueClassName={combinedBalanceMeta.textClassName} />
        <CasesStatCard label={t("detailPages.debt.casesPanel.casesCountLabel")} value={String(sortedAccounts.length)} />
        <CasesStatCard label={t("detailPages.debt.casesPanel.openCasesLabel")} value={String(openCasesCount)} />
      </div>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={t("detailPages.debt.casesPanel.description")}
          title={t("detailPages.debt.createTitle")}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.casesPanel.openedDateLabel")}</span>
            <input
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              type="date"
              value={createDate}
              onChange={(event) => setCreateDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.casesPanel.openingBalanceLabel")}</span>
            <CurrencyInput placeholder={t("detailPages.debt.amountPlaceholder")} value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.casesPanel.caseDescLabel")}</span>
            <Textarea placeholder={t("detailPages.debt.caseLabelPlaceholder")} value={caseNote} onChange={(event) => setCaseNote(event.target.value)} />
          </label>
        </div>

        <PageFooterActions className="mt-4">
          <Button
            disabled={!hasValidOpeningBalance || createDebtAccountMutation.isPending}
            onClick={async () => {
              const result = await createDebtAccountMutation.mutateAsync({
                externalCounterpartyId: externalCounterpartyId ?? null,
                note: caseNote.trim() || null,
                openingBalanceDzd: openingBalanceValue,
                openingEntryDate: createDate ? toAlgeriaDayBoundaryIso(createDate, "start") : undefined,
                openingEntryNote: caseNote.trim() || null,
                partyType: workerId ? "INTERNAL_WORKER" : "EXTERNAL_COUNTERPARTY",
                workerId: workerId ?? null,
              })

              setResolvedSelectedAccountId(result.item.id)
              setCreateDate(getAlgeriaDateInputValue())
              setOpeningBalance("")
              setCaseNote("")
            }}
          >
            {t("detailPages.debt.casesPanel.saveButton")}
          </Button>
        </PageFooterActions>
      </Surface>

      <div className={hideDebtLedgerPanel ? "" : "grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"}>
        <Surface className="p-5" variant="table">
          <SurfaceHeader
            description={t("detailPages.debt.casesPanel.selectDescription")}
            title={title}
          />

          <div className="mt-5 space-y-3">
            {sortedAccounts.length > 0 ? (
              sortedAccounts.map((account, index) => {
                const balanceMeta = getDebtBalanceMeta(account.currentBalanceDzd, t)
                const isSelected = selectedAccount?.id === account.id

                return (
                  <button
                    key={account.id}
                    className={cn(
                      "w-full rounded-[22px] border p-4 text-start transition-colors",
                      isSelected
                        ? "border-primary/35 bg-primary/8"
                        : "border-border/70 bg-background/60 hover:border-primary/20 hover:bg-muted/40",
                    )}
                    type="button"
                    onClick={() => setResolvedSelectedAccountId(account.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-semibold text-foreground">{formatDebtCaseLabel(account, index, t)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("detailPages.debt.casesPanel.openedDateLabel")} {new Intl.DateTimeFormat("ar-DZ").format(new Date(account.createdAt))}
                        </p>
                        {account.settledAt ? (
                          <p className="text-xs text-muted-foreground">
                            {t("detailPages.debt.casesPanel.closedDateLabel")} {new Intl.DateTimeFormat("ar-DZ").format(new Date(account.settledAt))}
                          </p>
                        ) : null}
                      </div>
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", balanceMeta.badgeClassName)}>
                        {balanceMeta.shortLabel}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className={cn("font-mono text-sm font-semibold", balanceMeta.textClassName)} dir="ltr">
                        {t("detailPages.debt.currency")} {formatDebtMoney(account.currentBalanceDzd)}
                      </span>
                      <span className="text-xs text-muted-foreground">{debtEntriesByAccountId[account.id]?.length ?? 0} {t("detailPages.debt.casesPanel.recordButton")}</span>
                    </div>
                    <Button
                      className="mt-3 w-full"
                      disabled={account.status === "SETTLED" || account.currentBalanceDzd === 0}
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPaymentTargetAccountId(account.id)
                      }}
                    >
                      {t("detailPages.debt.casesPanel.paymentButton")}
                    </Button>
                  </button>
                )
              })
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">{t("detailPages.debt.casesPanel.empty")}</p>
            )}
          </div>
        </Surface>

        {!hideDebtLedgerPanel && (
          <DebtLedgerPanel
            closeAgainstOptions={closeAgainstOptions}
            closureLinks={selectedAccount ? debtClosureLinksByAccountId[selectedAccount.id] ?? [] : []}
            debtAccount={selectedAccount}
            debtEntries={selectedAccount ? debtEntriesByAccountId[selectedAccount.id] ?? [] : []}
            relatedAccounts={sortedAccounts}
            title={selectedAccount ? formatDebtCaseLabel(selectedAccount, sortedAccounts.findIndex((account) => account.id === selectedAccount.id), t) : title}
          />
        )}
      </div>

      <RecordPaymentDialog
        debtAccount={paymentTargetAccount}
        open={Boolean(paymentTargetAccount)}
        onOpenChange={(open) => { if (!open) setPaymentTargetAccountId(null) }}
      />
    </div>
  )
}
