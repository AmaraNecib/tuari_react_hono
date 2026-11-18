import { AppDate } from "@/components/app-date"
import { CurrencyRun } from "@/features/shared/money-value"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { formatExactMoney } from "@/features/shared/exact-money-display"
import { parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { TablePaginationControls } from "@/features/shared/table-pagination-controls"
import type { SalaryPeriodType, SalaryProjectAssignmentWindow } from "@tuari/contracts"

import {
  AppShellActionGroup,
  AppShellEmptyStateRow,
  AppShellFilterShell,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "@/features/shared/table-primitives"

import { useSalaryRoutePagination, type SalaryRoutePagination } from "./salary-route-pagination"
import {
  SalaryPeriodFilterField,
  SalaryProjectFilterField,
  SalarySearchField,
  getSalaryPeriodLabelKey,
  sortProjectsByName,
  type SalaryPeriodFilterValue,
} from "./salary-table-primitives"

/** One row of the salaried-workers list. */
export type SalariedWorkerRow = {
  employeeId: string
  employeeName: string
  employeePhone: string
  employeeRole: string
  salaryReference: { period: SalaryPeriodType; amount: string } | null
  lastPaymentDate: string | null
  projectAssignments: SalaryProjectAssignmentWindow[]
}

function formatSalaryReferenceAmount(
  reference: NonNullable<SalariedWorkerRow["salaryReference"]>,
  grouped: boolean,
): string {
  if (reference.period !== "DAILY") {
    return formatExactMoney(reference.amount, { grouped }).text
  }

  const formatted = parseLocalizedUnitPriceInput(reference.amount).format()
  if (!grouped) return formatted
  const [whole = "", fraction] = formatted.split(".")
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`
}

/**
 * The salaried-workers tab: search, project/period filters, pagination and its
 * own empty states, over the shared table primitives.
 */
export function SalariedWorkersTable({
  workers,
  projects,
  onAddPayment,
  onEditSalary,
  routePagination,
  onFilterChange,
}: {
  workers: SalariedWorkerRow[]
  projects: Array<{ id: string; name: string }>
  onAddPayment: (employeeId: string, employeeName: string) => void
  onEditSalary: (employeeId: string) => void
  routePagination?: SalaryRoutePagination
  onFilterChange?: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [projectFilter, setProjectFilter] = useState("ALL")
  const [periodFilter, setPeriodFilter] = useState<SalaryPeriodFilterValue>("ALL")

  const currencyLabel = t("detailPages.salary.currency")
  const useGrouping = useMoneyGrouping()
  const sortedWorkers = useMemo(
    () => [...workers].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ar")),
    [workers],
  )
  const projectOptions = useMemo(() => sortProjectsByName(projects), [projects])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkers = useMemo(
    () =>
      sortedWorkers.filter((worker) => {
        if (normalizedQuery) {
          const haystack = `${worker.employeeName} ${worker.employeeRole}`.toLowerCase()
          if (!haystack.includes(normalizedQuery)) return false
        }
        if (periodFilter !== "ALL" && worker.salaryReference?.period !== periodFilter) {
          return false
        }
        if (
          projectFilter !== "ALL" &&
          !worker.projectAssignments.some((assignment) => assignment.projectId === projectFilter)
        ) {
          return false
        }
        return true
      }),
    [sortedWorkers, normalizedQuery, projectFilter, periodFilter],
  )

  const rows = useSalaryRoutePagination(filteredWorkers, routePagination, true, [normalizedQuery, projectFilter, periodFilter])

  return (
    <div className="space-y-4">
      {workers.length > 0 ? (
        <AppShellFilterShell>
          <SalarySearchField value={query} onChange={(value) => { setQuery(value); onFilterChange?.() }} />
          <SalaryProjectFilterField
            value={projectFilter}
            options={projectOptions}
            onChange={(value) => { setProjectFilter(value); onFilterChange?.() }}
          />
          <SalaryPeriodFilterField value={periodFilter} onChange={(value) => { setPeriodFilter(value); onFilterChange?.() }} />
        </AppShellFilterShell>
      ) : null}

      <AppShellTableFrame>
        <table className="min-w-full">
          <AppShellTableHead>
            <tr>
              <AppShellTableHeaderCell>{t("columns.name")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{t("salaries.currentSalary")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{t("salaries.lastPaymentDate")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell className="text-end">{t("common.actions")}</AppShellTableHeaderCell>
            </tr>
          </AppShellTableHead>
          <tbody>
            {rows.pagedRows.length > 0 ? (
              rows.pagedRows.map((worker) => (
                <AppShellTableRow key={worker.employeeId}>
                  <td className="px-4 py-3 text-start">
                    <p className="text-[13px] font-medium text-ink" dir="auto">{worker.employeeName}</p>
                    <p className="text-[11px] text-ink-3" dir="auto">{worker.employeeRole}</p>
                  </td>
                  <td className="px-4 py-3 text-start">
                    {worker.salaryReference ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        <CurrencyRun
                          amount={formatSalaryReferenceAmount(worker.salaryReference, useGrouping)}
                          currencyLabel={currencyLabel}
                          className="font-mono tabular-nums text-ink"
                        />
                        <span className="text-[11px] text-ink-3">/ {t(getSalaryPeriodLabelKey(worker.salaryReference.period))}</span>
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-ink-4">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-start text-[13px] text-ink-3">
                    {worker.lastPaymentDate
                      ? <AppDate value={worker.lastPaymentDate} />
                      : <span className="text-ink-4">—</span>}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <AppShellActionGroup className="justify-end">
                      <Button size="xs" onClick={() => onAddPayment(worker.employeeId, worker.employeeName)}>
                        {t("earnings.approve")}
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => onEditSalary(worker.employeeId)}>
                        {t("salaries.editSalary")}
                      </Button>
                    </AppShellActionGroup>
                  </td>
                </AppShellTableRow>
              ))
            ) : (
              <AppShellEmptyStateRow colSpan={4}>
                {workers.length === 0 ? t("salaries.workersEmpty") : t("search.noResults")}
              </AppShellEmptyStateRow>
            )}
          </tbody>
        </table>
      </AppShellTableFrame>

      {filteredWorkers.length > 0 ? (
        <TablePaginationControls
          page={rows.page}
          pageSize={rows.pageSize}
          totalCount={filteredWorkers.length}
          onPageChange={rows.setPage}
          onPageSizeChange={rows.setPageSize}
        />
      ) : null}
    </div>
  )
}
