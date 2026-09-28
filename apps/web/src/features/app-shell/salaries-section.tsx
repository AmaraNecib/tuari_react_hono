import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/features/shared/page-primitives"
import { RecordTabs } from "@/features/shared/record-page-frame"
import { AddSalaryPaymentDialog } from "@/features/employees/add-salary-payment-dialog"
import { allocateSalaryAmountByDays } from "@/features/employees/salary-payment-form"

import {
  AppShellActionGroup,
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "@/features/shared/table-primitives"

function getSalaryPeriodLabelKey(value: "DAILY" | "WEEKLY" | "MONTHLY" | null) {
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

/** Salaries section with payment history and quick actions. */
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
    projectSplits: Array<{ projectId: string; days: number }>
    note: string | null
  }>
  workers: Array<{
    employeeId: string
    employeeName: string
    employeePhone: string
    employeeRole: string
    salaryAmountDzd: number | null
    salaryPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | null
    lastPaymentDate: string | null
    projectAssignments: Array<{ projectId: string; startDate: string; endDate: string | null }>
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
  const currencyLabel = t("detailPages.salary.currency")
  const sortedWorkers = useMemo(
    () => [...workers].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ar")),
    [workers],
  )
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  )
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
              {recentPayments.length > 0 ? (
                recentPayments.map((payment) => {
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
                        <MoneyCell value={payment.expectedAmountDzd} currencyLabel={currencyLabel} />
                      </td>
                      <td className="px-4 py-3 text-start">
                        <MoneyCell value={payment.actualAmountDzd} currencyLabel={currencyLabel} />
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
                <AppShellEmptyStateRow colSpan={7}>{t("salaries.recentEmpty")}</AppShellEmptyStateRow>
              )}
            </tbody>
          </table>
        </AppShellTableFrame>
      ) : null}

      {activeTab === "workers" ? (
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
              {sortedWorkers.length > 0 ? (
                sortedWorkers.map((worker) => (
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
                <AppShellEmptyStateRow colSpan={4}>{t("salaries.workersEmpty")}</AppShellEmptyStateRow>
              )}
            </tbody>
          </table>
        </AppShellTableFrame>
      ) : null}
    </div>
  )
}
