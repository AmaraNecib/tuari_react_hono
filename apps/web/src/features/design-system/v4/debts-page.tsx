import { Button } from "@/components/ui/button"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { formatDebtMoney, getDebtBalanceMeta } from "@/features/debts/debt-utils"

function HubStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl border border-border/40 shadow-sm bg-card transition-all hover:shadow-md px-6 py-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`mt-3 font-mono text-2xl font-bold ${valueClassName ?? ""}`.trim()} dir="ltr">
        {value}
      </p>
    </div>
  )
}

export function DebtsHubPageV4({
  onCreateDebt,
  onCreateExternalCounterparty,
  onOpenExternalCounterparty,
  onOpenWorker,
  rows,
  totals,
}: {
  onCreateDebt: () => void
  onCreateExternalCounterparty: () => void
  onOpenExternalCounterparty: (counterpartyId: string) => void
  onOpenWorker: (employeeId: string) => void
  rows: Array<any>
  totals: { openCount: number; owedByUsDzd: number; owedToUsDzd: number }
}) {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <RecordPageFrame
        backHref="/"
        backLabel="Back to Dashboard"
        title="Debts V4"
        description="Theme variation V4 for Debts list page."
        action={
          <div className="flex gap-3">
            <Button size="lg" className="rounded-full" onClick={onCreateDebt}>New Debt</Button>
            <Button size="lg" className="rounded-full" variant="outline" onClick={onCreateExternalCounterparty}>New Counterparty</Button>
          </div>
        }
      >
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <HubStatCard label="Open Cases" value={String(totals.openCount)} />
          <HubStatCard label="Owed to Us" value={`DZ ${formatDebtMoney(totals.owedToUsDzd)}`} valueClassName="text-emerald-600" />
          <HubStatCard label="We Owe" value={`DZ ${formatDebtMoney(-totals.owedByUsDzd)}`} valueClassName="text-rose-600" />
        </div>

        <div className="rounded-xl border border-border/40 shadow-sm overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="px-5 py-4 text-start font-semibold">Name</th>
                  <th className="px-5 py-4 text-start font-semibold">Type</th>
                  <th className="px-5 py-4 text-start font-semibold">Phone</th>
                  <th className="px-5 py-4 text-start font-semibold">Cases</th>
                  <th className="px-5 py-4 text-start font-semibold">Balance</th>
                  <th className="px-5 py-4 text-start font-semibold">Status</th>
                  <th className="px-5 py-4 text-start font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {rows.length > 0 ? (
                  rows.map((row) => {
                    const balanceMeta = getDebtBalanceMeta(row.balanceDzd)
                    return (
                      <tr key={row.accountId} className="bg-background/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-4 text-start font-medium">{row.name}</td>
                        <td className="px-5 py-4 text-start text-muted-foreground">{row.type === "worker" ? "Worker" : "External"}</td>
                        <td className="px-5 py-4 text-start"><bdi dir="ltr">{row.phone}</bdi></td>
                        <td className="px-5 py-4 text-start">{row.caseCount}</td>
                        <td className={`px-5 py-4 text-start font-mono ${balanceMeta.textClassName}`} dir="ltr">
                          DZ {formatDebtMoney(row.balanceDzd)}
                        </td>
                        <td className="px-5 py-4 text-start">
                          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${balanceMeta.badgeClassName}`}>
                            {balanceMeta.shortLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-start">
                          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => row.type === "worker" ? onOpenWorker(row.partyId) : onOpenExternalCounterparty(row.partyId)}>
                            View Account
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-8 text-center text-muted-foreground" colSpan={7}>No debts found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </RecordPageFrame>
    </div>
  )
}
