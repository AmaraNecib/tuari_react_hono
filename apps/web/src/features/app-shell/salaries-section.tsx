import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { PageHeader } from "@/features/shared/page-primitives"
import { RecordTabs } from "@/features/shared/record-page-frame"
import { AddSalaryPaymentDialog } from "@/features/employees/add-salary-payment-dialog"
import { allocateSalaryAmountByDays } from "@/features/employees/salary-payment-form"
import { TablePaginationControls } from "@/features/shared/table-pagination-controls"
import type {
  SalaryPeriodType,
  SalaryProjectAssignmentWindow,
  SalaryProjectDaySplit,
} from "@tuari/contracts"

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

/** The three period values the filter can select, in display order. */
const PERIOD_FILTER_VALUES: SalaryPeriodType[] = ["DAILY", "WEEKLY", "MONTHLY"]

function getSalaryPeriodLabelKey(value: SalaryPeriodType | null) {
  if (value === "DAILY") return "detailPages.salary.daily"
  if (value === "WEEKLY") return "detailPages.salary.weekly"
  if (value === "MONTHLY") return "detailPages.salary.monthly"
  return "detailPages.salary.notSpecified"
}

function MoneyCell({
  value,
  currencyLabel,
  maximumFractionDigits = 0,
}: {
  value: number
  currencyLabel: string
  /** Split shares carry cents so their sum reconciles with the paid amount. */
  maximumFractionDigits?: number
}) {
  return (
    <span className="font-mono tabular-nums text-ink" dir="ltr">
      {currencyLabel}{" "}
      {new Intl.NumberFormat("en-US", { maximumFractionDigits, useGrouping: true }).format(value)}
    </span>
  )
}

/** Salary payments + the workers eligible for a new payment, with search, filters, and pagination. */
/**
 * @description Component
 */
export function SalariesSection({
  recentPayments,
  workers,
  projects,
  onEditSalary,
}: {
  recentPayments: Array<{
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
  }>
  workers: Array<{
    employeeId: string
    employeeName: string
    employeePhone: string
    employeeRole: string
    salaryAmountDzd: number | null
    salaryPeriod: SalaryPeriodType | null
    lastPaymentDate: string | null
    projectAssignments: SalaryProjectAssignmentWindow[]
  }>
  projects: Array<{ id: string; name: string }>
  onEditSalary: (employeeId: string) => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState("recent")
  // Only the identity is snapshotted when the dialog opens; the wage, period,
  // and assignment windows are read from the live query data below so a
  // workspace refresh cannot leave a stale proposal or day default behind.
  const [paymentTarget, setPaymentTarget] = useState<{ id: string; name: string } | null>(null)

  // Payment-history controls.
  const [paymentQuery, setPaymentQuery] = useState("")
  const [paymentWorkerFilter, setPaymentWorkerFilter] = useState("ALL")
  const [paymentProjectFilter, setPaymentProjectFilter] = useState("ALL")
  const [paymentPeriodFilter, setPaymentPeriodFilter] = useState<"ALL" | SalaryPeriodType>("ALL")

  // Worker-list controls.
  const [workerQuery, setWorkerQuery] = useState("")
  const [workerProjectFilter, setWorkerProjectFilter] = useState("ALL")
  const [workerPeriodFilter, setWorkerPeriodFilter] = useState<"ALL" | SalaryPeriodType>("ALL")

  const currencyLabel = t("detailPages.salary.currency")
  const sortedWorkers = useMemo(
    () => [...workers].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ar")),
    [workers],
  )
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  )
  const projectOptions = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [projects],
  )
  // The payment history can hold several rows per worker, so the worker filter
  // is a distinct list rather than one option per row.
  const paymentWorkerOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const payment of recentPayments) {
      if (!byId.has(payment.employeeId)) {
        byId.set(payment.employeeId, payment.employeeName)
      }
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "ar"),
    )
  }, [recentPayments])

  const normalizedPaymentQuery = paymentQuery.trim().toLowerCase()
  const filteredPayments = useMemo(
    () =>
      recentPayments.filter((payment) => {
        if (normalizedPaymentQuery) {
          // The history table shows the worker's name and role, not the phone.
          const haystack = `${payment.employeeName} ${payment.employeeRole}`.toLowerCase()
          if (!haystack.includes(normalizedPaymentQuery)) return false
        }
        if (paymentWorkerFilter !== "ALL" && payment.employeeId !== paymentWorkerFilter) {
          return false
        }
        if (
          paymentProjectFilter !== "ALL" &&
          !payment.projectSplits.some((split) => split.projectId === paymentProjectFilter)
        ) {
          return false
        }
        if (paymentPeriodFilter !== "ALL" && payment.periodType !== paymentPeriodFilter) {
          return false
        }
        return true
      }),
    [
      recentPayments,
      normalizedPaymentQuery,
      paymentWorkerFilter,
      paymentProjectFilter,
      paymentPeriodFilter,
    ],
  )

  const normalizedWorkerQuery = workerQuery.trim().toLowerCase()
  const filteredWorkers = useMemo(
    () =>
      sortedWorkers.filter((worker) => {
        if (normalizedWorkerQuery) {
          const haystack = `${worker.employeeName} ${worker.employeeRole}`.toLowerCase()
          if (!haystack.includes(normalizedWorkerQuery)) return false
        }
        if (workerPeriodFilter !== "ALL" && worker.salaryPeriod !== workerPeriodFilter) {
          return false
        }
        if (
          workerProjectFilter !== "ALL" &&
          !worker.projectAssignments.some((assignment) => assignment.projectId === workerProjectFilter)
        ) {
          return false
        }
        return true
      }),
    [sortedWorkers, normalizedWorkerQuery, workerPeriodFilter, workerProjectFilter],
  )

  const payments = usePaginatedRows({
    rows: filteredPayments,
    resetPageDeps: [
      normalizedPaymentQuery,
      paymentWorkerFilter,
      paymentProjectFilter,
      paymentPeriodFilter,
    ],
  })
  const workerRows = usePaginatedRows({
    rows: filteredWorkers,
    resetPageDeps: [normalizedWorkerQuery, workerProjectFilter, workerPeriodFilter],
  })

  const paymentWorker = paymentTarget
    ? workers.find((worker) => worker.employeeId === paymentTarget.id) ?? null
    : null

  const openPaymentForm = (employeeId: string, employeeName: string) => {
    setPaymentTarget({ id: employeeId, name: employeeName })
  }

  return (
    <div className="space-y-6">
      <AddSalaryPaymentDialog
        employeeId={paymentTarget?.id ?? null}
        employeeName={paymentWorker?.employeeName ?? paymentTarget?.name}
        salaryAmountDzd={paymentWorker?.salaryAmountDzd ?? null}
        salaryPeriod={paymentWorker?.salaryPeriod ?? null}
        projectAssignments={paymentWorker?.projectAssignments ?? []}
        projects={projects}
        open={paymentTarget !== null}
        onOpenChange={(open) => { if (!open) setPaymentTarget(null) }}
      />

      <PageHeader title={t("sections.salaries.label")} />

      <RecordTabs
        activeTab={activeTab}
        tabs={[
          { id: "recent", label: t("salaries.recentTitle") },
          { id: "workers", label: t("salaries.workersTitle") },
        ]}
        onChange={setActiveTab}
      />

      {activeTab === "recent" ? (
        <div className="space-y-4">
          {recentPayments.length > 0 ? (
            <AppShellFilterShell>
              <Field
                className="min-w-[14rem] flex-1"
                label={t("salaries.searchPlaceholder")}
              >
                <Input
                  value={paymentQuery}
                  placeholder={t("salaries.searchPlaceholder")}
                  onChange={(event) => setPaymentQuery(event.target.value)}
                />
              </Field>
              <Field label={t("salaries.workerFilter")}>
                <NativeSelect
                  value={paymentWorkerFilter}
                  onChange={(event) => setPaymentWorkerFilter(event.target.value)}
                >
                  <option value="ALL">{t("salaries.allWorkers")}</option>
                  {paymentWorkerOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("salaries.projectFilter")}>
                <NativeSelect
                  value={paymentProjectFilter}
                  onChange={(event) => setPaymentProjectFilter(event.target.value)}
                >
                  <option value="ALL">{t("salaries.allProjects")}</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("salaries.periodFilter")}>
                <NativeSelect
                  value={paymentPeriodFilter}
                  onChange={(event) =>
                    setPaymentPeriodFilter(event.target.value as "ALL" | SalaryPeriodType)
                  }
                >
                  <option value="ALL">{t("salaries.allPeriods")}</option>
                  {PERIOD_FILTER_VALUES.map((value) => (
                    <option key={value} value={value}>{t(getSalaryPeriodLabelKey(value))}</option>
                  ))}
                </NativeSelect>
              </Field>
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
                {payments.pagedRows.length > 0 ? (
                  payments.pagedRows.map((payment) => {
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
                          {new Intl.DateTimeFormat("ar-DZ").format(new Date(payment.paymentDate))}
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
                            <Button size="xs" onClick={() => openPaymentForm(payment.employeeId, payment.employeeName)}>
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
                    {recentPayments.length === 0 ? t("salaries.recentEmpty") : t("search.noResults")}
                  </AppShellEmptyStateRow>
                )}
              </tbody>
            </table>
          </AppShellTableFrame>

          {filteredPayments.length > 0 ? (
            <TablePaginationControls
              page={payments.page}
              pageSize={payments.pageSize}
              totalCount={filteredPayments.length}
              onPageChange={payments.setPage}
              onPageSizeChange={(nextPageSize) => {
                payments.setPage(1)
                payments.setPageSize(nextPageSize)
              }}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "workers" ? (
        <div className="space-y-4">
          {workers.length > 0 ? (
            <AppShellFilterShell>
              <Field
                className="min-w-[14rem] flex-1"
                label={t("salaries.searchPlaceholder")}
              >
                <Input
                  value={workerQuery}
                  placeholder={t("salaries.searchPlaceholder")}
                  onChange={(event) => setWorkerQuery(event.target.value)}
                />
              </Field>
              <Field label={t("salaries.projectFilter")}>
                <NativeSelect
                  value={workerProjectFilter}
                  onChange={(event) => setWorkerProjectFilter(event.target.value)}
                >
                  <option value="ALL">{t("salaries.allProjects")}</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("salaries.periodFilter")}>
                <NativeSelect
                  value={workerPeriodFilter}
                  onChange={(event) =>
                    setWorkerPeriodFilter(event.target.value as "ALL" | SalaryPeriodType)
                  }
                >
                  <option value="ALL">{t("salaries.allPeriods")}</option>
                  {PERIOD_FILTER_VALUES.map((value) => (
                    <option key={value} value={value}>{t(getSalaryPeriodLabelKey(value))}</option>
                  ))}
                </NativeSelect>
              </Field>
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
                {workerRows.pagedRows.length > 0 ? (
                  workerRows.pagedRows.map((worker) => (
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
                          <Button size="xs" onClick={() => openPaymentForm(worker.employeeId, worker.employeeName)}>
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
              page={workerRows.page}
              pageSize={workerRows.pageSize}
              totalCount={filteredWorkers.length}
              onPageChange={workerRows.setPage}
              onPageSizeChange={(nextPageSize) => {
                workerRows.setPage(1)
                workerRows.setPageSize(nextPageSize)
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
