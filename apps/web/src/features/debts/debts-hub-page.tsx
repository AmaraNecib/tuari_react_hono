import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AdvancedSearchBar } from "@/features/shared/advanced-search-bar"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { Surface } from "@/features/shared/page-primitives"
import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls"
import { getDebtBalanceMeta, formatDebtMoney } from "./debt-utils"

type FilterOption = "all" | "owed-to-us" | "owed-by-us" | "settled"

function HubStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${valueClassName ?? ""}`.trim()} dir="ltr">
        {value}
      </p>
    </div>
  )
}

const FILTER_OPTIONS: Array<{ id: FilterOption; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "owed-to-us", label: "لنا عنده" },
  { id: "owed-by-us", label: "علينا له" },
  { id: "settled", label: "مغلقة" },
]

const DEFAULT_PAGE_SIZE = 25

/** Debts hub with summary cards and employee/external lists. */
/**
 * @description Component
 */
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
  const { t } = useTranslation()
  const [filter, setFilter] = useState<FilterOption>("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const normalizedQuery = query.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      switch (filter) {
        case "owed-to-us":
          if (!(row.status === "OPEN" && row.balanceDzd > 0)) return false
          break
        case "owed-by-us":
          if (!(row.status === "OPEN" && row.balanceDzd < 0)) return false
          break
        case "settled":
          if (row.status !== "SETTLED") return false
          break
        default:
          break
      }
      if (normalizedQuery) {
        const haystack = `${row.name} ${row.phone}`.toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      return true
    })
  }, [rows, filter, normalizedQuery])

  const filteredOpenCount = useMemo(
    () => filteredRows.filter((r) => r.status === "OPEN").length,
    [filteredRows],
  )

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

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
            onClick={() => {
              setFilter(option.id)
              setPage(1)
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <AdvancedSearchBar
        onSearch={(searchQuery) => {
          setQuery(searchQuery)
          setPage(1)
        }}
        storageKey="debts-hub-search-filters"
      />

      <Surface className="overflow-hidden" variant="table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الطرف</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>عدد الحسابات</TableHead>
              <TableHead>الرصيد</TableHead>
              <TableHead>الدلالة</TableHead>
              <TableHead>الإجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length > 0 ? (
              pagedRows.map((row) => {
                const balanceMeta = getDebtBalanceMeta(row.balanceDzd)

                return (
                  <TableRow
                    key={row.accountId}
                    className="cursor-pointer"
                    onClick={() =>
                      row.type === "worker"
                        ? onOpenWorker(row.partyId)
                        : onOpenExternalCounterparty(row.partyId)
                    }
                  >
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.type === "worker" ? "عامل داخلي" : "طرف خارجي"}</TableCell>
                    <TableCell><bdi dir="ltr">{row.phone}</bdi></TableCell>
                    <TableCell>{row.caseCount}</TableCell>
                    <TableCell className={balanceMeta.textClassName} dir="ltr">
                      دج {formatDebtMoney(row.balanceDzd)}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${balanceMeta.badgeClassName}`.trim()}>
                        {balanceMeta.shortLabel}
                      </span>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {filter === "all" && !normalizedQuery
                    ? t("debtHub.emptyAll")
                    : t("debtHub.emptyFiltered")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Surface>

      {filteredRows.length > 0 && (
        <TablePaginationControls
          page={page}
          pageSize={pageSize}
          totalCount={filteredRows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}
    </RecordPageFrame>
  )
}
