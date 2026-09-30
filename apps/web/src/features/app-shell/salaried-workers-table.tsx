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
  usePaginatedRows,
} from "@/features/shared/table-primitives"

import {
  MoneyCell,
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
  salaryAmountDzd: number | null
  salaryPeriod: SalaryPeriodType | null
  lastPaymentDate: string | null
  projectAssignments: SalaryProjectAssignmentWindow[]
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
}: {
  workers: SalariedWorkerRow[]
  projects: Array<{ id: string; name: string }>
  onAddPayment: (employeeId: string, employeeName: string) => void
  onEditSalary: (employeeId: string) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [projectFilter, setProjectFilter] = useState("ALL")
  const [periodFilter, setPeriodFilter] = useState<SalaryPeriodFilterValue>("ALL")

  const currencyLabel = t("detailPages.salary.currency")
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
        if (periodFilter !== "ALL" && worker.salaryPeriod !== periodFilter) {
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

  const rows = usePaginatedRows({
    rows: filteredWorkers,
    resetPageDeps: [normalizedQuery, projectFilter, periodFilter],
  })

  return (
    <div className="space-y-4">
      {workers.length > 0 ? (
        <AppShellFilterShell>
          <SalarySearchField value={query} onChange={setQuery} />
          <SalaryProjectFilterField
            value={projectFilter}
            options={projectOptions}
            onChange={setProjectFilter}
          />
          <SalaryPeriodFilterField value={periodFilter} onChange={setPeriodFilter} />
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
                    {worker.salaryAmountDzd !== null ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        <MoneyCell value={worker.salaryAmountDzd} currencyLabel={currencyLabel} />
                        <span className="text-[11px] text-ink-3">/ {t(getSalaryPeriodLabelKey(worker.salaryPeriod))}</span>
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-ink-4">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-start text-[13px] text-ink-3">
                    {worker.lastPaymentDate
                      ? new Intl.DateTimeFormat("ar-DZ").format(new Date(worker.lastPaymentDate))
                      : <span className="text-ink-4">—</span>}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <AppShellActionGroup className="justify-end">
                      <Button size="xs" onClick={() => onAddPayment(worker.employeeId, worker.employeeName)}>
                        {t("salaries.addPayment")}
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
          onPageSizeChange={(nextPageSize) => {
            rows.setPage(1)
            rows.setPageSize(nextPageSize)
          }}
        />
      ) : null}
    </div>
  )
}
