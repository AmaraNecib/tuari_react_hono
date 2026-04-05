import { Button } from "@/components/ui/button"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { Surface } from "@/features/shared/page-primitives"
import { getDebtBalanceMeta, formatDebtMoney } from "./debt-utils"

function HubStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Surface className="rounded-[22px] px-5 py-4" variant="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${valueClassName ?? ""}`.trim()} dir="ltr">
        {value}
      </p>
    </Surface>
  )
}

export function DebtsHubPage({
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
  rows: Array<{
    accountId: string
    balanceDzd: number
    caseCount: number
    name: string
    partyId: string
    phone: string
    status: "OPEN" | "SETTLED"
    type: "worker" | "external"
  }>
  totals: { openCount: number; owedByUsDzd: number; owedToUsDzd: number }
}) {
  return (
    <RecordPageFrame
      action={
        <div className="flex gap-2">
          <Button onClick={onCreateDebt}>إنشاء دين جديد</Button>
          <Button variant="outline" onClick={onCreateExternalCounterparty}>إضافة طرف خارجي</Button>
        </div>
      }
      backHref="/"
      backLabel="العودة إلى لوحة التحكم"
      title="مركز الديون"
      description="ملخص سريع لأرصدة العمال والأطراف الخارجية. الأخضر يعني أنهم مدينون لنا، والأحمر يعني أننا مدينون لهم."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <HubStatCard label="عدد الحسابات المفتوحة" value={String(totals.openCount)} />
        <HubStatCard label="لنا عندهم" value={`دج ${formatDebtMoney(totals.owedToUsDzd)}`} valueClassName="text-emerald-700 dark:text-emerald-300" />
        <HubStatCard label="علينا لهم" value={`دج ${formatDebtMoney(-totals.owedByUsDzd)}`} valueClassName="text-rose-700 dark:text-rose-300" />
      </div>

      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الطرف</th>
                <th className="px-4 py-3 text-start font-medium">النوع</th>
                <th className="px-4 py-3 text-start font-medium">الهاتف</th>
                <th className="px-4 py-3 text-start font-medium">الحالات</th>
                <th className="px-4 py-3 text-start font-medium">الرصيد</th>
                <th className="px-4 py-3 text-start font-medium">الدلالة</th>
                <th className="px-4 py-3 text-start font-medium">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => {
                  const balanceMeta = getDebtBalanceMeta(row.balanceDzd)

                  return (
                    <tr key={row.accountId} className="border-t border-border/60 bg-background/75">
                      <td className="px-4 py-4 text-start font-medium text-foreground">{row.name}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{row.type === "worker" ? "عامل داخلي" : "طرف خارجي"}</td>
                      <td className="px-4 py-4 text-start text-foreground"><bdi dir="ltr">{row.phone}</bdi></td>
                      <td className="px-4 py-4 text-start text-foreground">{row.caseCount}</td>
                      <td className={`px-4 py-4 text-start font-mono ${balanceMeta.textClassName}`.trim()} dir="ltr">
                        دج {formatDebtMoney(row.balanceDzd)}
                      </td>
                      <td className="px-4 py-4 text-start">
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${balanceMeta.badgeClassName}`.trim()}>
                          {balanceMeta.shortLabel}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-start">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            row.type === "worker"
                              ? onOpenWorker(row.partyId)
                              : onOpenExternalCounterparty(row.partyId)
                          }
                        >
                          فتح التفاصيل
                        </Button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                    لا توجد حسابات ديون بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </RecordPageFrame>
  )
}
