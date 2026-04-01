import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount, DebtClosureLink, DebtEntry, ExternalCounterparty } from "@tuari/contracts"

import { RecordInfoCard, RecordInfoGrid, RecordPageFrame, RecordTabPanel, RecordTabs } from "@/features/shared/record-page-frame"
import { Button } from "@/components/ui/button"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { DebtLedgerPanel } from "./debt-ledger-panel"
import { DebtPartySummaryCard } from "./debt-party-summary-card"
import { formatDebtCaseLabel, getCombinedDebtBalance, getDebtBalanceMeta, formatDebtMoney, sortDebtAccounts } from "./debt-utils"
import { useCreateDebtAccountMutation } from "@/features/app-shell/mock-dashboard"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"
import type { TFunction } from "i18next"

function CasesTableView({
  accounts,
  debtEntriesByAccountId,
  onSelectAccount,
  selectedAccountId,
}: {
  accounts: DebtAccount[]
  debtEntriesByAccountId: Record<string, DebtEntry[]>
  onSelectAccount: (accountId: string) => void
  selectedAccountId: string | null
}) {
  const { t } = useTranslation()
  const sortedAccounts = useMemo(() => sortDebtAccounts(accounts), [accounts])

  return (
    <Surface className="overflow-hidden" variant="table">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.casesPanel.descLabel")}</th>
              <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.casesPanel.statusLabel")}</th>
              <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.ledgerPanel.currentBalanceLabel")}</th>
              <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.casesPanel.openedDateLabel")}</th>
              <th className="px-4 py-3 text-end font-medium text-muted-foreground">العدد</th>
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.length > 0 ? (
              sortedAccounts.map((account) => {
                const balanceMeta = getDebtBalanceMeta(account.currentBalanceDzd, t)
                const isSelected = selectedAccountId === account.id
                const entryCount = debtEntriesByAccountId[account.id]?.length ?? 0

                return (
                  <tr
                    key={account.id}
                    className={cn("border-t border-border/60 cursor-pointer transition-colors", isSelected ? "bg-primary/8" : "bg-background/75 hover:bg-muted/40")}
                    onClick={() => onSelectAccount(account.id)}
                  >
                    <td className="px-4 py-4 text-end font-medium text-foreground">{account.note?.trim() || "—"}</td>
                    <td className="px-4 py-4 text-end">
                      <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", balanceMeta.badgeClassName)}>
                        {balanceMeta.shortLabel}
                      </span>
                    </td>
                    <td className={cn("px-4 py-4 text-end font-mono", balanceMeta.textClassName)} dir="ltr">
                      {t("detailPages.debt.currency")} {formatDebtMoney(account.currentBalanceDzd)}
                    </td>
                    <td className="px-4 py-4 text-end text-muted-foreground text-xs">
                      {new Intl.DateTimeFormat("ar-DZ").format(new Date(account.createdAt))}
                    </td>
                    <td className="px-4 py-4 text-end text-muted-foreground">{entryCount}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                  {t("detailPages.debt.casesPanel.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Surface>
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
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createDate, setCreateDate] = useState(() => getAlgeriaDateInputValue())
  const [openingBalance, setOpeningBalance] = useState("")
  const [caseNote, setCaseNote] = useState("")
  const createDebtAccountMutation = useCreateDebtAccountMutation()

  const sortedAccounts = useMemo(() => sortDebtAccounts(debtAccounts), [debtAccounts])
  const selectedAccount = sortedAccounts.find((account) => account.id === selectedAccountId) ?? sortedAccounts[0] ?? null

  const normalizedOpeningBalance = openingBalance.trim()
  const openingBalanceValue = normalizedOpeningBalance.length > 0 ? Number(normalizedOpeningBalance) : 0
  const hasValidOpeningBalance = Number.isFinite(openingBalanceValue)

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

  const handleCreateCase = async () => {
    if (!hasValidOpeningBalance) return

    const result = await createDebtAccountMutation.mutateAsync({
      externalCounterpartyId: counterparty.id,
      note: caseNote.trim() || null,
      openingBalanceDzd: openingBalanceValue,
      openingEntryDate: createDate ? toAlgeriaDayBoundaryIso(createDate, "start") : undefined,
      openingEntryNote: caseNote.trim() || null,
      partyType: "EXTERNAL_COUNTERPARTY",
      workerId: null,
    })

    setSelectedAccountId(result.item.id)
    setCreateDate(getAlgeriaDateInputValue())
    setOpeningBalance("")
    setCaseNote("")
    setShowCreateForm(false)
  }

  return (
    <RecordPageFrame
      backHref="/debts/counterparties"
      backLabel={t("detailPages.debt.externalCounterpartyDetails.backLabel")}
      title={counterparty.fullName}
      description={t("detailPages.debt.externalCounterpartyDetails.description")}
    >
      <RecordTabs
        activeTab={activeTab}
        baseId={`counterparty-${counterparty.id}`}
        tabs={[
          { id: "cases", label: "الحالات" },
          { id: "ledger", label: "القيود والمدفوعات" },
          { id: "party-info", label: "معلومات الطرف" },
        ]}
        onChange={setActiveTab}
      />

      <RecordTabPanel activeTab={activeTab} baseId={`counterparty-${counterparty.id}`} tabId="cases">
        <div className="space-y-6">
          <DebtPartySummaryCard accounts={debtAccounts} personName={counterparty.fullName} />

          <CasesTableView
            accounts={debtAccounts}
            debtEntriesByAccountId={debtEntriesByAccountId}
            onSelectAccount={setSelectedAccountId}
            selectedAccountId={selectedAccountId}
          />

          <Button onClick={() => setShowCreateForm(!showCreateForm)} size="lg" className="w-full md:w-auto">
            {showCreateForm ? "إخفاء" : "+ إنشاء حالة جديدة"}
          </Button>

          {showCreateForm && (
            <Surface className="p-5" variant="card">
              <SurfaceHeader
                title={t("detailPages.debt.createTitle")}
                description={t("detailPages.debt.casesPanel.description")}
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
                  <CurrencyInput
                    placeholder={t("detailPages.debt.amountPlaceholder")}
                    value={openingBalance}
                    onChange={(event) => setOpeningBalance(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
                  <span className="text-sm font-medium text-foreground">{t("detailPages.debt.casesPanel.caseDescLabel")}</span>
                  <Textarea
                    placeholder={t("detailPages.debt.caseLabelPlaceholder")}
                    value={caseNote}
                    onChange={(event) => setCaseNote(event.target.value)}
                  />
                </label>
              </div>

              <PageFooterActions className="mt-4">
                <Button
                  disabled={!hasValidOpeningBalance || createDebtAccountMutation.isPending}
                  onClick={handleCreateCase}
                >
                  {createDebtAccountMutation.isPending ? t("common.saving") : t("detailPages.debt.casesPanel.saveButton")}
                </Button>
              </PageFooterActions>
            </Surface>
          )}
        </div>
      </RecordTabPanel>

      <RecordTabPanel activeTab={activeTab} baseId={`counterparty-${counterparty.id}`} tabId="ledger">
        {selectedAccount ? (
          <DebtLedgerPanel
            closeAgainstOptions={closeAgainstOptions}
            closureLinks={debtClosureLinksByAccountId[selectedAccount.id] ?? []}
            debtAccount={selectedAccount}
            debtEntries={debtEntriesByAccountId[selectedAccount.id] ?? []}
            relatedAccounts={sortedAccounts}
            title={formatDebtCaseLabel(selectedAccount, sortedAccounts.findIndex((account) => account.id === selectedAccount.id), t)}
          />
        ) : (
          <div className="rounded-[20px] border border-border/60 p-6 text-center text-muted-foreground">
            {t("detailPages.debt.casesPanel.selectDescription")}
          </div>
        )}
      </RecordTabPanel>

      <RecordTabPanel activeTab={activeTab} baseId={`counterparty-${counterparty.id}`} tabId="party-info">
        <div className="space-y-6">
          <RecordInfoGrid>
            <RecordInfoCard label={t("detailPages.debt.externalCounterpartyDetails.nameLabel")} value={counterparty.fullName} />
            <RecordInfoCard label={t("detailPages.debt.externalCounterpartyDetails.phoneLabel")} value={counterparty.phone ?? counterparty.phoneNumber} valueClassName="font-mono" />
            <RecordInfoCard label={t("detailPages.debt.externalCounterpartyDetails.notesLabel")} value={counterparty.note?.trim() || t("detailPages.debt.externalCounterpartyDetails.noNotes")} />
          </RecordInfoGrid>
        </div>
      </RecordTabPanel>
    </RecordPageFrame>
  )
}
