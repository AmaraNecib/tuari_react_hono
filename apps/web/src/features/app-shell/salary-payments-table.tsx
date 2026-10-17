import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { NativeSelect } from "@/components/ui/form-controls"
import { allocateSalaryAmountByDays } from "@/features/employees/salary-payment-form"
import { TablePaginationControls } from "@/features/shared/table-pagination-controls"
import { formatAlgeriaDate } from "@/lib/algeria-time"
import type { SalaryPeriodType, SalaryProjectDaySplit } from "@tuari/contracts"

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
  sortProjectsByName,
  type SalaryPeriodFilterValue,
} from "./salary-table-primitives"

/** One row of the salary payment history. */
export type SalaryPaymentRow = {
  id: string
  employeeId: string
  employeeName: string
  employeePhone: string
  employeeRole: string
  paymentDate: string
  days: number
  expectedAmountDzd: number
  actualAmountDzd: number
  /** Present on workspace rows; optional so older fixtures keep compiling. */
  periodType?: SalaryPeriodType | null
  projectSplits: SalaryProjectDaySplit[]
  note: string | null
}

/**
 * The payment history tab: search, worker/project/period filters, pagination
 * and its own empty states, over the shared table primitives.
 */
export function SalaryPaymentsTable({
  payments,
  projects,
  onAddPayment,
  onEditSalary,
}: {
  payments: SalaryPaymentRow[]
  projects: Array<{ id: string; name: string }>
  onAddPayment: (employeeId: string, employeeName: string) => void
  onEditSalary: (employeeId: string) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [workerFilter, setWorkerFilter] = useState("ALL")
  const [projectFilter, setProjectFilter] = useState("ALL")
  const [periodFilter, setPeriodFilter] = useState<SalaryPeriodFilterValue>("ALL")

  const currencyLabel = t("detailPages.salary.currency")
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  )
  const projectOptions = useMemo(() => sortProjectsByName(projects), [projects])
  // The history can hold several rows per worker, so the worker filter is a
  // distinct list rather than one option per row.
  const workerOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const payment of payments) {
      if (!byId.has(payment.employeeId)) {
        byId.set(payment.employeeId, payment.employeeName)
      }
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "ar"),
    )
  }, [payments])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredPayments = useMemo(
    () =>
      payments.filter((payment) => {
        if (normalizedQuery) {
          // The history table shows the worker's name and role, not the phone.
          const haystack = `${payment.employeeName} ${payment.employeeRole}`.toLowerCase()
          if (!haystack.includes(normalizedQuery)) return false
        }
        if (workerFilter !== "ALL" && payment.employeeId !== workerFilter) {
          return false
        }
        if (
          projectFilter !== "ALL" &&
          !payment.projectSplits.some((split) => split.projectId === projectFilter)
        ) {
          return false
        }
        if (periodFilter !== "ALL" && payment.periodType !== periodFilter) {
          return false
        }
        return true
      }),
    [payments, normalizedQuery, workerFilter, projectFilter, periodFilter],
  )

  const rows = usePaginatedRows({
    rows: filteredPayments,
    resetPageDeps: [normalizedQuery, workerFilter, projectFilter, periodFilter],
  })

  return (
    <div className="space-y-4">
      {payments.length > 0 ? (
        <AppShellFilterShell>
          <SalarySearchField value={query} onChange={setQuery} />
          <Field label={t("salaries.workerFilter")}>
            <NativeSelect
              value={workerFilter}
              onChange={(event) => setWorkerFilter(event.target.value)}
            >
              <option value="ALL">{t("salaries.allWorkers")}</option>
              {workerOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </NativeSelect>
          </Field>
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
              <AppShellTableHeaderCell>{t("salaries.paymentDate")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{t("salaries.days")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{t("salaries.expectedAmount")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{t("salaries.actualAmount")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{t("salaries.notes")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell className="text-end">{t("common.actions")}</AppShellTableHeaderCell>
            </tr>
          </AppShellTableHead>
          <tbody>
            {rows.pagedRows.length > 0 ? (
              rows.pagedRows.map((payment) => {
                // Allocate across all lines together so the displayed shares
                // reconcile: rounding each line separately loses the remainder.
                const salaryShares = allocateSalaryAmountByDays(
                  payment.actualAmountDzd,
                  payment.projectSplits.map((split) => split.days),
                  payment.days,
                )

                return (
                  <AppShellTableRow key={payment.id}>
                    <td className="px-4 py-3 text-start">
                      <p className="text-[13px] font-medium text-ink" dir="auto">{payment.employeeName}</p>
                      <p className="text-[11px] text-ink-3" dir="auto">{payment.employeeRole}</p>
                    </td>
                    <td className="px-4 py-3 text-start text-[13px] text-ink-2">
                      {formatAlgeriaDate(payment.paymentDate)}
                    </td>
                    <td className="px-4 py-3 text-start text-[13px] text-ink-2 font-mono tabular-nums" dir="ltr">
                      {payment.days}
                      {payment.projectSplits.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 font-sans text-[11px] text-ink-3" dir="rtl">
                          {payment.projectSplits.map((split, index) => (
                            <li key={split.projectId} className="flex flex-wrap items-center gap-x-1.5">
                              <span dir="auto">{projectNames.get(split.projectId) ?? split.projectId}</span>
                              <span className="text-ink-4">·</span>
                              <span className="font-mono tabular-nums" dir="ltr">{split.days} {t("salaries.daysUnit")}</span>
                              <span className="text-ink-4">·</span>
                              <MoneyCell
                                value={salaryShares[index] ?? 0}
                                currencyLabel={currencyLabel}
                                maximumFractionDigits={2}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-start">
                      <MoneyCell value={payment.expectedAmountDzd} currencyLabel={currencyLabel} maximumFractionDigits={2} />
                    </td>
                    <td className="px-4 py-3 text-start">
                      <MoneyCell value={payment.actualAmountDzd} currencyLabel={currencyLabel} maximumFractionDigits={2} />
                    </td>
                    <td className="px-4 py-3 text-start text-[12.5px] text-ink-3">
                      {payment.note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <AppShellActionGroup className="justify-end">
                        <Button size="xs" onClick={() => onAddPayment(payment.employeeId, payment.employeeName)}>
                          {t("salaries.addPayment")}
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => onEditSalary(payment.employeeId)}>
                          {t("salaries.editSalary")}
                        </Button>
                      </AppShellActionGroup>
                    </td>
                  </AppShellTableRow>
                )
              })
            ) : (
              <AppShellEmptyStateRow colSpan={7}>
                {payments.length === 0 ? t("salaries.recentEmpty") : t("search.noResults")}
              </AppShellEmptyStateRow>
            )}
          </tbody>
        </table>
      </AppShellTableFrame>

      {filteredPayments.length > 0 ? (
        <TablePaginationControls
          page={rows.page}
          pageSize={rows.pageSize}
          totalCount={filteredPayments.length}
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
