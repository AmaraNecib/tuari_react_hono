import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
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
  const balanceMeta = getDebtBalanceMeta(balanceDzd, t)
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
          label={t("detailPages.debt.ledgerPanel.currentBalanceLabel")}
          value={`${t("detailPages.debt.currency")} ${formatDebtMoney(balanceDzd)}`}
          valueClassName={balanceMeta.textClassName}
        />
        <DebtStatCard label={t("detailPages.debt.ledgerPanel.statusLabel")} value={balanceMeta.shortLabel} valueClassName={balanceMeta.textClassName} />
        <DebtStatCard label={t("detailPages.debt.ledgerPanel.entryCountLabel")} value={String(sortedEntries.length)} />
      </div>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            debtAccount
              ? t("detailPages.debt.ledgerPanel.ledgerDescription")
              : t("detailPages.debt.ledgerPanel.noAccountDescription")
          }
          title={title}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.ledgerPanel.entryDateLabel")}</span>
            <input
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              type="date"
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.ledgerPanel.amountLabel")}</span>
            <CurrencyInput placeholder={t("detailPages.debt.amountPlaceholder")} value={signedAmount} onChange={(event) => setSignedAmount(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.note")}</span>
            <Textarea placeholder={t("detailPages.debt.note")} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("detailPages.debt.ledgerPanel.amountHelperText")}</p>
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
            {t("detailPages.debt.ledgerPanel.saveEntryButton")}
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            balanceDzd === 0
              ? t("detailPages.debt.ledgerPanel.settleDescription")
              : t("detailPages.debt.ledgerPanel.settleCreateDescription", { amount: formatDebtMoney(-balanceDzd) })
          }
          title={t("detailPages.debt.ledgerPanel.settleTitle")}
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
            {t("detailPages.debt.ledgerPanel.settleButton")}
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={
            debtAccount
              ? closeAgainstOptions.length > 0
                ? t("detailPages.debt.ledgerPanel.closeAgainstDescription")
                : t("detailPages.debt.ledgerPanel.noCounterpartDescription")
              : t("detailPages.debt.ledgerPanel.noAccountDescription")
          }
          title={t("detailPages.debt.ledgerPanel.closeAgainstButton")}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.ledgerPanel.counterpartyLabel")}</span>
            <NativeSelect
              disabled={!debtAccount || closeAgainstOptions.length === 0}
              value={targetDebtAccountId}
              onChange={(event) => setTargetDebtAccountId(event.target.value)}
            >
              <option value="">{t("detailPages.debt.selectParty")}</option>
              {closeAgainstOptions.map((option) => (
                <option key={option.account.id} value={option.account.id}>
                  {option.label} — {formatDebtMoney(option.account.currentBalanceDzd)} {t("detailPages.debt.currency")}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.ledgerPanel.closureDateLabel")}</span>
            <input
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              type="date"
              value={closureDate}
              onChange={(event) => setClosureDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
            <span className="text-sm font-medium text-foreground">{t("detailPages.debt.ledgerPanel.closureNoteLabel")}</span>
            <Textarea placeholder={t("detailPages.debt.note")} value={closureNote} onChange={(event) => setClosureNote(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("detailPages.debt.ledgerPanel.closureHelperText")}
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
            {t("detailPages.debt.ledgerPanel.closeAgainstButton")}
          </Button>
        </div>
      </Surface>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description={t("detailPages.debt.ledgerPanel.closureHistoryDescription")}
          title={t("detailPages.debt.ledgerPanel.closureHistoryTitle")}
        />

        <div className="mt-4 space-y-3">
          {closureLinks.length > 0 ? (
            closureLinks.map((link) => {
              const isSource = link.sourceDebtAccountId === debtAccount?.id
              const otherAccountId = isSource ? link.targetDebtAccountId : link.sourceDebtAccountId
              const otherAccount = relatedAccountsById.get(otherAccountId)
              const otherLabel = otherAccount
                ? otherAccount.note?.trim() || t("detailPages.debt.ledgerPanel.linkedCaseFallback")
                : t("detailPages.debt.ledgerPanel.linkedCaseFallback")

              return (
                <div key={link.id} className="rounded-[20px] border border-border/70 bg-background/60 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-foreground">
                      {isSource ? t("detailPages.debt.ledgerPanel.closedFromLabel") : t("detailPages.debt.ledgerPanel.closedToLabel")} {otherLabel}
                    </p>
                    <span className="font-mono text-foreground" dir="ltr">
                      {t("detailPages.debt.currency")} {formatDebtMoney(link.closedAmountDzd)}
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
            <p className="text-sm text-muted-foreground">{t("detailPages.debt.ledgerPanel.closureEmpty")}</p>
          )}
        </div>
      </Surface>

      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.ledgerPanel.tableDate")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.ledgerPanel.tableType")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.ledgerPanel.tableAmount")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.ledgerPanel.tableBalance")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.ledgerPanel.tableNote")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.length > 0 ? (
                sortedEntries.map((entry) => {
                  const amountMeta = getDebtBalanceMeta(entry.signedAmountDzd, t)

                  return (
                    <tr key={entry.id} className="border-t border-border/60 bg-background/75">
                      <td className="px-4 py-4 text-end text-foreground">{new Intl.DateTimeFormat("ar-DZ").format(new Date(entry.entryDate))}</td>
                      <td className="px-4 py-4 text-end text-muted-foreground">{getDebtEntryTypeLabel(entry.entryType, t)}</td>
                      <td className={cn("px-4 py-4 text-end font-mono", amountMeta.textClassName)} dir="ltr">
                        {t("detailPages.debt.currency")} {formatDebtMoney(entry.signedAmountDzd)}
                      </td>
                      <td className={cn("px-4 py-4 text-end font-mono", getDebtBalanceMeta(entry.balanceAfterDzd, t).textClassName)} dir="ltr">
                        {t("detailPages.debt.currency")} {formatDebtMoney(entry.balanceAfterDzd)}
                      </td>
                      <td className="px-4 py-4 text-end text-muted-foreground">{entry.note?.trim() || "—"}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                    {t("detailPages.debt.ledgerPanel.tableEmpty")}
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
