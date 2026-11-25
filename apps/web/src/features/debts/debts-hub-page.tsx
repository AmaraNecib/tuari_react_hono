import { i18n as featureI18n } from "@/i18n"
import { CurrencyRun } from "@/features/shared/money-value"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { DEBT_BALANCE_STATE_PHRASE } from "@tuari/contracts"
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
import { TablePaginationControls } from "@/features/shared/table-pagination-controls"
import {
  formatDebtAmount,
  getNetDebtBalanceDisplay,
  matchesDebtHubFilter,
  type DebtHubFilter,
} from "./debt-utils"

type FilterOption = DebtHubFilter

function HubStatCard({ label, value, valueClassName }: { label: string; value: import("react").ReactNode; valueClassName?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-xl font-semibold ${valueClassName ?? ""}`.trim()} dir="ltr">
        {value}
      </p>
    </div>
  )
}

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

  const filterOptions = useMemo<Array<{ id: FilterOption; label: string }>>(
    () => [
      { id: "all", label: t("debtsHub.filters.all") },
      { id: "owed-to-us", label: DEBT_BALANCE_STATE_PHRASE.owedToUs },
      { id: "owed-by-us", label: DEBT_BALANCE_STATE_PHRASE.owedByUs },
      { id: "settled", label: DEBT_BALANCE_STATE_PHRASE.settled },
    ],
    [t],
  )

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesDebtHubFilter(row, filter)) return false
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
          <Button size="lg" onClick={onCreateDebt}>{t("debts.terminology.buttons.recordDebt")}</Button>
        </div>
      }
      title={featureI18n.t("featureCopy.debtsHubPage.title")}
      description={featureI18n.t("featureCopy.debtsHubPage.description")}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <HubStatCard label={featureI18n.t("featureCopy.debtsHubPage.openBalances")} value={String(filter === "all" ? totals.openCount : filteredOpenCount)} />
        <HubStatCard label={DEBT_BALANCE_STATE_PHRASE.owedToUs} value={<CurrencyRun amount={formatDebtAmount(totals.owedToUsDzd)} currencyLabel={featureI18n.t("featureCopy.debtsHubPage.currency")} />} valueClassName="text-good" />
        <HubStatCard label={DEBT_BALANCE_STATE_PHRASE.owedByUs} value={<CurrencyRun amount={formatDebtAmount(totals.owedByUsDzd)} currencyLabel={featureI18n.t("featureCopy.debtsHubPage.currency")} />} valueClassName="text-bad" />
        <HubStatCard label={featureI18n.t("featureCopy.debtsHubPage.accountCount")} value={String(rows.length)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => (
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
              <TableHead>{featureI18n.t("featureCopy.debtsHubPage.party")}</TableHead>
              <TableHead>{featureI18n.t("featureCopy.debtsHubPage.type")}</TableHead>
              <TableHead>{featureI18n.t("featureCopy.debtsHubPage.phone")}</TableHead>
              <TableHead>{featureI18n.t("featureCopy.debtsHubPage.accountCount")}</TableHead>
              <TableHead>{featureI18n.t("featureCopy.debtsHubPage.balance")}</TableHead>
              <TableHead>{featureI18n.t("featureCopy.debtsHubPage.action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length > 0 ? (
              pagedRows.map((row) => {
                const balance = getNetDebtBalanceDisplay(row.balanceDzd)

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
                    <TableCell className="text-muted-foreground">{row.type === "worker" ? featureI18n.t("featureCopy.debtsHubPage.internalWorker") : featureI18n.t("featureCopy.debtsHubPage.externalParty")}</TableCell>
                    <TableCell><bdi dir="ltr">{row.phone}</bdi></TableCell>
                    <TableCell>{row.caseCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${balance.badgeClassName}`.trim()}>
                          {balance.phrase}
                        </span>
                        <span className={`font-mono text-sm ${balance.textClassName}`.trim()} dir="ltr">
                          <CurrencyRun amount={formatDebtAmount(balance.amount)} currencyLabel={featureI18n.t("featureCopy.debtsHubPage.currency")} />
                        </span>
                      </div>
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
                        {featureI18n.t("featureCopy.debtsHubPage.openDetails")}</Button>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {filter === "all" && !normalizedQuery
                    ? t("debtsHub.emptyAll")
                    : t("debtsHub.emptyFiltered")}
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
