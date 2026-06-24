import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { Surface } from "@/features/shared/page-primitives"
import { getDebtBalanceMeta, formatDebtMoney } from "./debt-utils"

type FilterOption = "all" | "owed-to-us" | "owed-by-us" | "settled"

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

const FILTER_OPTIONS: Array<{ id: FilterOption; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "owed-to-us", label: "لنا عنده" },
  { id: "owed-by-us", label: "علينا له" },
  { id: "settled", label: "مغلقة" },
]

export function DebtsHubPage({
  onCreateDebt,
  onOpenExternalCounterparty,
  onOpenWorker,
  rows,
  totals,
}: {
  onCreateDebt: () => void
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
  const [filter, setFilter] = useState<FilterOption>("all")

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      switch (filter) {
        case "owed-to-us":
          return row.status === "OPEN" && row.balanceDzd > 0
        case "owed-by-us":
          return row.status === "OPEN" && row.balanceDzd < 0
        case "settled":
          return row.status === "SETTLED"
        default:
          return true
      }
    })
  }, [rows, filter])

  const filteredOpenCount = useMemo(
    () => filteredRows.filter((r) => r.status === "OPEN").length,
    [filteredRows],
  )

  return (
    <RecordPageFrame
      action={
        <div className="flex gap-2">
          <Button size="lg" onClick={onCreateDebt}>إضافة رصيد دين</Button>
        </div>
      }
      title="مركز الديون"
      description="ملخص سريع لحساب دين واحد لكل عامل أو طرف خارجي. الأخضر يعني أنهم مدينون لنا، والأحمر يعني أننا مدينون لهم."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <HubStatCard label="عدد الأرصدة المفتوحة" value={String(filter === "all" ? totals.openCount : filteredOpenCount)} />
        <HubStatCard label="لنا عندهم" value={`دج ${formatDebtMoney(totals.owedToUsDzd)}`} valueClassName="text-emerald-700 dark:text-emerald-300" />
        <HubStatCard label="علينا لهم" value={`دج ${formatDebtMoney(-totals.owedByUsDzd)}`} valueClassName="text-rose-700 dark:text-rose-300" />
        <HubStatCard label="عدد الحسابات" value={String(rows.length)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === option.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
            onClick={() => setFilter(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الطرف</th>
                <th className="px-4 py-3 text-start font-medium">النوع</th>
                <th className="px-4 py-3 text-start font-medium">الهاتف</th>
                <th className="px-4 py-3 text-start font-medium">عدد الحسابات</th>
                <th className="px-4 py-3 text-start font-medium">الرصيد</th>
                <th className="px-4 py-3 text-start font-medium">الدلالة</th>
                <th className="px-4 py-3 text-start font-medium">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => {
                  const balanceMeta = getDebtBalanceMeta(row.balanceDzd)

                  return (
                    <tr
                      key={row.accountId}
                      className="cursor-pointer border-t border-border/60 bg-background/75 transition-colors hover:bg-muted/30"
                      onClick={() =>
                        row.type === "worker"
                          ? onOpenWorker(row.partyId)
                          : onOpenExternalCounterparty(row.partyId)
                      }
                    >
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
                          onClick={(event) => {
                            event.stopPropagation()
                            if (row.type === "worker") {
                              onOpenWorker(row.partyId)
                            } else {
                              onOpenExternalCounterparty(row.partyId)
                            }
                          }}
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
                    {filter === "all" ? "لا توجد حسابات ديون بعد." : "لا توجد نتائج للفلتر المحدد."}
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
