import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount, DebtClosureLink, DebtEntry, ExternalCounterparty } from "@tuari/contracts"

import { RecordInfoCard, RecordInfoGrid, RecordPageFrame, RecordTabPanel, RecordTabs } from "@/features/shared/record-page-frame"

import { DebtCasesPanel } from "./debt-cases-panel"
import { DebtPartySummaryCard } from "./debt-party-summary-card"
import { DebtLedgerPanel } from "./debt-ledger-panel"
import { formatDebtCaseLabel, getCombinedDebtBalance, getDebtBalanceMeta, formatDebtMoney, sortDebtAccounts } from "./debt-utils"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { Button } from "@/components/ui/button"
import { CurrencyInput, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { useCloseDebtAgainstMutation, useSettleDebtAccountMutation } from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"
import type { TFunction } from "i18next"

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

function ClosureTabContent({
  selectedAccount,
  sortedAccounts,
  closeAgainstOptions,
  debtClosureLinksByAccountId,
  t,
}: {
  selectedAccount: DebtAccount | null
  sortedAccounts: DebtAccount[]
  closeAgainstOptions: Array<{ account: DebtAccount; label: string }>
  debtClosureLinksByAccountId: Record<string, DebtClosureLink[]>
  t: TFunction
}) {
  const [entryDate, setEntryDate] = useState(() => getAlgeriaDateInputValue())
  const [note, setNote] = useState("")
  const [closureDate, setClosureDate] = useState(() => getAlgeriaDateInputValue())
  const [closureNote, setClosureNote] = useState("")
  const [targetDebtAccountId, setTargetDebtAccountId] = useState("")
  const closeDebtAgainstMutation = useCloseDebtAgainstMutation()
  const settleDebtAccountMutation = useSettleDebtAccountMutation()
  const relatedAccountsById = useMemo(() => new Map(sortedAccounts.map((account) => [account.id, account])), [sortedAccounts])
  const balanceDzd = selectedAccount?.currentBalanceDzd ?? 0
  const balanceMeta = getDebtBalanceMeta(balanceDzd, t)
  const hasCloseAgainstTarget = targetDebtAccountId.trim().length > 0
  const closureLinks = selectedAccount ? debtClosureLinksByAccountId[selectedAccount.id] ?? [] : []

  useState(() => {
    setEntryDate(getAlgeriaDateInputValue())
    setNote("")
    setClosureDate(getAlgeriaDateInputValue())
    setClosureNote("")
    setTargetDebtAccountId(closeAgainstOptions[0]?.account.id ?? "")
  })

  return (
    <div className="space-y-6">
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
            disabled={!selectedAccount || balanceDzd === 0 || settleDebtAccountMutation.isPending}
            variant="outline"
            onClick={() =>
              selectedAccount
                ? settleDebtAccountMutation.mutate({
                    debtAccountId: selectedAccount.id,
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
            selectedAccount
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
              disabled={!selectedAccount || closeAgainstOptions.length === 0}
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
            disabled={!selectedAccount || balanceDzd === 0 || !hasCloseAgainstTarget || closeDebtAgainstMutation.isPending}
            variant="outline"
            onClick={() =>
              selectedAccount
                ? closeDebtAgainstMutation.mutate({
                    entryDate: closureDate ? toAlgeriaDayBoundaryIso(closureDate, "start") : undefined,
                    note: closureNote.trim() || null,
                    sourceDebtAccountId: selectedAccount.id,
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
              const isSource = link.sourceDebtAccountId === selectedAccount?.id
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
    </div>
  )
}

export function ExternalCounterpartyDetailsPage({
  counterparty,
  debtAccounts,
  debtClosureLinksByAccountId,
  debtEntriesByAccountId,
}: {
  counterparty: ExternalCounterparty & { phone?: string }
  debtAccounts: DebtAccount[]
  debtClosureLinksByAccountId: Record<string, DebtClosureLink[]>
  debtEntriesByAccountId: Record<string, DebtEntry[]>
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState("cases")
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const sortedAccounts = useMemo(() => sortDebtAccounts(debtAccounts), [debtAccounts])
  const selectedAccount = sortedAccounts.find((account) => account.id === selectedAccountId) ?? sortedAccounts[0] ?? null
  const tabsBaseId = `counterparty-${counterparty.id}`

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

  return (
    <RecordPageFrame
      backHref="/debts/counterparties"
      backLabel={t("detailPages.debt.externalCounterpartyDetails.backLabel")}
      title={counterparty.fullName}
      description={t("detailPages.debt.externalCounterpartyDetails.description")}
    >
      <RecordTabs
        activeTab={activeTab}
        baseId={tabsBaseId}
        tabs={[
          { id: "cases", label: "الحالات" },
          { id: "ledger", label: "القيود والمدفوعات" },
          { id: "closure", label: "الإغلاق والتسوية" },
          { id: "party-info", label: "معلومات الطرف" },
        ]}
        onChange={setActiveTab}
      />

      <RecordTabPanel activeTab={activeTab} baseId={tabsBaseId} tabId="cases">
        <DebtCasesPanel
          accounts={debtAccounts}
          debtClosureLinksByAccountId={debtClosureLinksByAccountId}
          debtEntriesByAccountId={debtEntriesByAccountId}
          externalCounterpartyId={counterparty.id}
          title={t("detailPages.debt.externalCounterpartyDetails.debtLedgerTitle")}
          selectedAccountId={selectedAccountId}
          onSelectedAccountIdChange={setSelectedAccountId}
          hideDebtLedgerPanel
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={activeTab} baseId={tabsBaseId} tabId="ledger">
        <DebtLedgerPanel
          closeAgainstOptions={closeAgainstOptions}
          closureLinks={selectedAccount ? debtClosureLinksByAccountId[selectedAccount.id] ?? [] : []}
          debtAccount={selectedAccount}
          debtEntries={selectedAccount ? debtEntriesByAccountId[selectedAccount.id] ?? [] : []}
          relatedAccounts={sortedAccounts}
          title={selectedAccount ? formatDebtCaseLabel(selectedAccount, sortedAccounts.findIndex((account) => account.id === selectedAccount.id), t) : t("detailPages.debt.externalCounterpartyDetails.debtLedgerTitle")}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={activeTab} baseId={tabsBaseId} tabId="closure">
        <ClosureTabContent
          selectedAccount={selectedAccount}
          sortedAccounts={sortedAccounts}
          closeAgainstOptions={closeAgainstOptions}
          debtClosureLinksByAccountId={debtClosureLinksByAccountId}
          t={t}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={activeTab} baseId={tabsBaseId} tabId="party-info">
        <div className="space-y-6">
          <RecordInfoGrid>
            <RecordInfoCard label={t("detailPages.debt.externalCounterpartyDetails.nameLabel")} value={counterparty.fullName} />
            <RecordInfoCard label={t("detailPages.debt.externalCounterpartyDetails.phoneLabel")} value={counterparty.phone ?? counterparty.phoneNumber} valueClassName="font-mono" />
            <RecordInfoCard label={t("detailPages.debt.externalCounterpartyDetails.notesLabel")} value={counterparty.note?.trim() || t("detailPages.debt.externalCounterpartyDetails.noNotes")} />
          </RecordInfoGrid>

          <DebtPartySummaryCard accounts={debtAccounts} personName={counterparty.fullName} />
        </div>
      </RecordTabPanel>
    </RecordPageFrame>
  )
}
