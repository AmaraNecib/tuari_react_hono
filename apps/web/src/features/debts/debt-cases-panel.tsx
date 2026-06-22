import { useMemo, useState } from "react"
import type { DebtAccount, DebtEntry } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { CurrencyInput, Textarea } from "@/components/ui/form-controls"
import { useCreateDebtAccountMutation } from "@/features/app-shell/mock-dashboard"
import { PageFooterActions, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"

import { DebtLedgerPanel } from "./debt-ledger-panel"
import {
  formatDebtMoney,
  getDebtAccountBalanceMeta,
  getDebtDirectionLabel,
  sortDebtAccounts,
} from "./debt-utils"

function CasesStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Surface className="rounded-[22px] px-5 py-4" variant="card">
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
  const sortedAccounts = useMemo(() => sortDebtAccounts(accounts), [accounts])
  const debtAccount = sortedAccounts[0] ?? null
  const balanceMeta = debtAccount ? getDebtAccountBalanceMeta(debtAccount) : getDebtAccountBalanceMeta({ currentBalance: 0, direction: "PAYABLE" })
  const normalizedOpeningBalance = openingBalance.trim()
  const openingBalanceValue = normalizedOpeningBalance.length > 0 ? Number(normalizedOpeningBalance) : 0
  const hasValidOpeningBalance = Number.isFinite(openingBalanceValue)
  const accountEntries = debtAccount ? debtEntriesByAccountId[debtAccount.id] ?? [] : []

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <CasesStatCard
          label={debtAccount ? `الرصيد الحالي — ${getDebtDirectionLabel(debtAccount.direction)}` : "الرصيد الحالي"}
          value={`دج ${formatDebtMoney(debtAccount?.currentBalance ?? 0)}`}
          valueClassName={balanceMeta.textClassName}
        />
        <CasesStatCard label="الحساب" value={debtAccount ? "1" : "0"} />
        <CasesStatCard label="عدد الحركات" value={String(accountEntries.length)} />
      </div>

      <Surface className="p-5" variant="card">
        <SurfaceHeader
          description="لكل طرف حساب دين واحد فقط. إذا كان الحساب موجودًا فسيُسجَّل المبلغ كدفعة جديدة على نفس الحساب الموحد."
          title={debtAccount ? "تسجيل دفعة على الحساب" : "إنشاء الحساب"}
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">التاريخ</span>
            <input
              className="h-10 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground outline-none"
              type="date"
              value={createDate}
              onChange={(event) => setCreateDate(event.target.value)}
            />
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

      <DebtLedgerPanel
        debtAccount={debtAccount}
        debtEntries={accountEntries}
        title={title}
      />
    </div>
  )
}
