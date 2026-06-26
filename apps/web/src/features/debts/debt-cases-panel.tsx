import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { useCreateDebtAccountMutation } from "@/features/app-shell/mock-dashboard"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

import { ConsolidationDialog } from "./consolidation-dialog"
import { DebtLedgerPanel } from "./debt-ledger-panel"
import {
  formatDebtMoney,
  getCombinedDebtBalance,
  getDebtAccountBalanceMeta,
  getDebtBalanceMeta,
  getDebtDirectionLabel,
  sortDebtAccounts,
} from "./debt-utils"

function CasesStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Surface className="rounded-xl px-5 py-4" variant="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${valueClassName ?? ""}`.trim()} dir="ltr">
        {value}
      </p>
    </Surface>
  )
}

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
  const [createDate, setCreateDate] = useState(() => getAlgeriaDateInputValue())
  const [openingBalance, setOpeningBalance] = useState("")
  const [note, setNote] = useState("")
  const [consolidationDialogOpen, setConsolidationDialogOpen] = useState(false)
  const sortedAccounts = useMemo(() => sortDebtAccounts(accounts), [accounts])
  const debtAccount = sortedAccounts[0] ?? null
  const normalizedOpeningBalance = openingBalance.trim()
  const openingBalanceValue = normalizedOpeningBalance.length > 0 ? Number(normalizedOpeningBalance) : 0
  const hasValidOpeningBalance = Number.isFinite(openingBalanceValue)

  // Aggregate stats across all accounts
  const totalEntryCount = useMemo(
    () =>
      sortedAccounts.reduce(
        (sum, a) => sum + (debtEntriesByAccountId[a.id] ?? []).length,
        0,
      ),
    [sortedAccounts, debtEntriesByAccountId],
  )
  const totalBalanceDzd = useMemo(
    () => getCombinedDebtBalance(sortedAccounts),
    [sortedAccounts],
  )
  const hasPayable = sortedAccounts.some((a) => a.direction === "PAYABLE")
  const hasReceivable = sortedAccounts.some((a) => a.direction === "RECEIVABLE")
  const isBidirectional = hasPayable && hasReceivable
  const balanceMeta = useMemo(
    () =>
      isBidirectional
        ? getDebtBalanceMeta(totalBalanceDzd)
        : debtAccount
          ? getDebtAccountBalanceMeta(debtAccount)
          : getDebtAccountBalanceMeta({ currentBalance: 0, direction: "PAYABLE" }),
    [isBidirectional, totalBalanceDzd, debtAccount],
  )

  const payableAccount = useMemo(
    () => sortedAccounts.find((a) => a.direction === "PAYABLE") ?? null,
    [sortedAccounts],
  )
  const receivableAccount = useMemo(
    () => sortedAccounts.find((a) => a.direction === "RECEIVABLE") ?? null,
    [sortedAccounts],
  )
  const hasBothDirections = payableAccount !== null && receivableAccount !== null
  const payableEntries = payableAccount ? debtEntriesByAccountId[payableAccount.id] ?? [] : []
  const receivableEntries = receivableAccount ? debtEntriesByAccountId[receivableAccount.id] ?? [] : []
  const hasConsolidatableOpenings =
    hasBothDirections &&
    payableEntries.some((e) => e.status === "LIVE" && e.entryType === "OPENING") &&
    receivableEntries.some((e) => e.status === "LIVE" && e.entryType === "OPENING")

  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <CasesStatCard
          label={isBidirectional ? "صافي الرصيد" : debtAccount ? `الرصيد الحالي — ${getDebtDirectionLabel(debtAccount.direction)}` : "الرصيد الحالي"}
          value={`دج ${formatDebtMoney(isBidirectional ? totalBalanceDzd : (debtAccount?.currentBalance ?? 0))}`}
          valueClassName={balanceMeta.textClassName}
        />
        <CasesStatCard label="عدد الحسابات" value={String(sortedAccounts.length)} />
        <CasesStatCard label="عدد الحركات" value={String(totalEntryCount)} />
      </div>

      {hasBothDirections ? (
        <Surface className="p-5" variant="card">
          <SurfaceHeader
            description={t("debts.consolidateDescription")}
            title="تجميد الديون"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm text-muted-foreground">
                {getDebtDirectionLabel(payableAccount!.direction)}{` `}
                دج {formatDebtMoney(payableAccount!.currentBalance)}
                {` — `}
                {getDebtDirectionLabel(receivableAccount!.direction)}{` `}
                دج {formatDebtMoney(receivableAccount!.currentBalance)}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasConsolidatableOpenings
                  ? t("debts.selectOneFromEachSide")
                  : "لا توجد حركات افتتاحية نشطة قابلة للتجميد."}
              </p>
            </div>
            <Button
              disabled={!hasConsolidatableOpenings}
              variant="outline"
              onClick={() => setConsolidationDialogOpen(true)}
            >
              فتح التجميد
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description="لكل طرف حساب دين واحد فقط. إذا كان الحساب موجودًا فسيُسجَّل المبلغ كدفعة جديدة على نفس الحساب الموحد."
          title={debtAccount ? "تسجيل دفعة على الحساب" : "إنشاء الحساب"}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">التاريخ</span>
            <DatePicker value={createDate} onChange={setCreateDate} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">المبلغ الموقّع</span>
            <CurrencyInput placeholder="0 أو 2500 أو -2500" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-foreground">ملاحظة الدفعة</span>
            <Textarea placeholder="مثال: دين جديد، دفعة وصلت، دفعة خرجت" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        <PageFooterActions className="mt-4">
          <Button
            disabled={!hasValidOpeningBalance || createDebtAccountMutation.isPending}
            onClick={async () => {
              await createDebtAccountMutation.mutateAsync({
                externalCounterpartyId: externalCounterpartyId ?? null,
                note: note.trim() || null,
                openingBalanceDzd: openingBalanceValue,
                openingEntryDate: createDate ? toAlgeriaDayBoundaryIso(createDate, "start") : undefined,
                openingEntryNote: note.trim() || null,
                partyType: workerId ? "INTERNAL_WORKER" : "EXTERNAL_COUNTERPARTY",
                workerId: workerId ?? null,
              })

              setCreateDate(getAlgeriaDateInputValue())
              setOpeningBalance("")
              setNote("")
            }}
          >
            {debtAccount ? "تسجيل الدفعة" : "إنشاء الحساب"}
          </Button>
        </PageFooterActions>
      </Surface>

      {sortedAccounts.map((account) => (
        <DebtLedgerPanel
          key={account.id}
          debtAccount={account}
          debtEntries={debtEntriesByAccountId[account.id] ?? []}
          title={`${title} — ${getDebtDirectionLabel(account.direction)}`}
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
