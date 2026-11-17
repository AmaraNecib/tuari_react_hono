import type { ReactNode } from "react"
import { AppDate } from "@/components/app-date"
import { Button } from "@/components/ui/button"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { CurrencyRun, MoneyValue } from "@/features/shared/money-value"
import { formatExactMoney } from "@/features/shared/exact-money-display"
import { parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { DebtAccount, DebtEntry, SalaryProjectAssignmentWindow } from "@tuari/contracts"

import { getSalaryPeriodLabelKey } from "@/features/app-shell/salary-table-primitives"
import { AddSalaryPaymentDialog, type SalaryProjectOption } from "./add-salary-payment-dialog"
import { EmployeeEarningsHistory } from "./employee-earnings-history"
import { DebtCasesPanel } from "@/features/debts/debt-cases-panel"
import { getArabicStatusLabel } from "@/features/shared/status-meta"
import { classifyWorkforceRole } from "./role-classification"
import { workspaceRoutes } from "@/router/navigation"
import {
  RecordHistoryTable,
  RecordInfoCard,
  RecordInfoGrid,
  RecordPageFrame,
  RecordTabPanel,
  RecordTabs,
} from "@/features/shared/record-page-frame"

import type { EmployeeTableRow } from "./employee-table"

type EmployeeWorkHistoryRow = {
  id: string
  title: string
  detail?: string | null
  typeLabel: string
  periodLabel: ReactNode
  statusLabel: string
}

function formatSalaryReferenceAmount(
  reference: NonNullable<EmployeeTableRow["salaryReference"]>,
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

function getSalaryDifferenceMeta(expectedAmountDzd: number, actualAmountDzd: number) {
  const difference = actualAmountDzd - expectedAmountDzd

  if (difference > 0) {
    return {
      className: "text-emerald-700 dark:text-emerald-300",
      value: difference,
    }
  }

  if (difference < 0) {
    return {
      className: "text-rose-700 dark:text-rose-300",
      value: difference,
    }
  }

  return {
    className: "text-muted-foreground",
    value: difference,
  }
}

/** Employee detail page with tabs for personal, work, and finance. */
/**
 * @description Component
 */
export function EmployeeDetailsPage({
  activeTab,
  debtAccounts,
  debtEntriesByAccountId,
  employee,
  managedProjects,
  managedWarehouses,
  projects = [],
  onTabChange,
  salaryPayments,
  workHistory,
}: {
  activeTab: string
  debtAccounts: DebtAccount[]
  debtEntriesByAccountId: Record<string, DebtEntry[]>
  employee: EmployeeTableRow
  managedProjects: string[]
  managedWarehouses: string[]
  /** Kept for existing detail-route callers; earnings are no longer calculated from assignment windows. */
  projectAssignments?: SalaryProjectAssignmentWindow[]
  /** Projects the payment dialog can attribute a split to. */
  projects?: SalaryProjectOption[]
  onTabChange: (tabId: string) => void
  salaryPayments: Array<{
    id: string
    paymentDate: string
    days: number
    expectedAmountDzd: number
    actualAmountDzd: number
    periodType: "DAILY" | "WEEKLY" | "MONTHLY"
    note: string | null
  }>
  workHistory: EmployeeWorkHistoryRow[]
}) {
  const { t } = useTranslation()
  const { isProjectManager, isWarehouseManager, isWorker } = classifyWorkforceRole(employee.roleKey)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const availableTabs = isWorker ? ["personal", "history", "finance", "debts"] : ["personal", "history", "finance"]
  const resolvedTab = availableTabs.includes(activeTab) ? activeTab : "personal"
  const sortedSalaryPayments = useMemo(
    () => [...salaryPayments].sort((left, right) => right.paymentDate.localeCompare(left.paymentDate)),
    [salaryPayments],
  )
  const totalExpectedAmount = sortedSalaryPayments.reduce((sum, payment) => sum + payment.expectedAmountDzd, 0)
  const totalActualAmount = sortedSalaryPayments.reduce((sum, payment) => sum + payment.actualAmountDzd, 0)
  const totalDifferenceMeta = getSalaryDifferenceMeta(totalExpectedAmount, totalActualAmount)
  const currencyLabel = t("detailPages.salary.currency")
  const useGrouping = useMoneyGrouping()
  const salaryReference = employee.salaryReference ?? null
  const salaryPeriodLabel = (value: NonNullable<EmployeeTableRow["salaryReference"]>["period"] | null) =>
    value ? t(getSalaryPeriodLabelKey(value)) : t("detailPages.salary.notSpecified")
  const formattedSalaryReference = salaryReference
    ? formatSalaryReferenceAmount(salaryReference, useGrouping)
    : null
  const noNotesLabel = t("common.noNotes")
  // The #20 workplace placement flow persists only for ACTIVE workers, so
  // non-active workers must not get an edit-workplace CTA that would be
  // silently ignored.
  const canAssignWorkplace = isWorker && employee.status === "ACTIVE"
  const managedProjectCountLabel = managedProjects.length > 0 ? `${managedProjects.length} ${t("detailPages.employee.projectUnit")}` : t("detailPages.employee.noManagedProjects")
  const managedWarehouseCountLabel = managedWarehouses.length > 0 ? `${managedWarehouses.length} ${t("detailPages.employee.warehouseUnit")}` : t("detailPages.employee.noManagedWarehouses")
  const managedProjectNamesLabel = managedProjects.length > 0 ? managedProjects.join("، ") : t("detailPages.employee.noManagedProjectNames")
  const managedWarehouseNamesLabel = managedWarehouses.length > 0 ? managedWarehouses.join("، ") : t("detailPages.employee.noManagedWarehouseNames")
  const hasExpandedNotes = (employee.notes?.trim().length ?? 0) > 90
  const tabsBaseId = `employee-record-${employee.id}`

  return (
    <RecordPageFrame
      backHref="/employees"
      backLabel={t("detailPages.employee.back")}
      description=""
      editHref={`/employees/${encodeURIComponent(employee.id)}/edit`}
      editLabel={t("detailPages.employee.edit")}
      title={employee.name}
      action={
        isWorker && employee.status === "ACTIVE" ? (
          <>
            <AddSalaryPaymentDialog
              employeeId={employee.id}
              employeeName={employee.name}
              salaryReference={salaryReference}
              projects={projects}
              open={paymentDialogOpen}
              onOpenChange={setPaymentDialogOpen}
            />
            <Button size="lg" onClick={() => setPaymentDialogOpen(true)}>
              {t("salaries.addPayment")}
            </Button>
          </>
        ) : undefined
      }
    >
      <RecordTabs
        activeTab={resolvedTab}
        baseId={tabsBaseId}
        tabs={[
          { id: "personal", label: t("detailPages.employee.personalTab") },
          { id: "history", label: t("detailPages.employee.historyTab") },
          { id: "finance", label: t("detailPages.employee.financeTab") },
          ...(isWorker ? [{ id: "debts", label: "الديون" }] : []),
        ]}
        onChange={onTabChange}
      />

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="personal">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RecordInfoCard label={t("detailPages.employee.fullName")} value={employee.name} />
          <RecordInfoCard label={t("detailPages.employee.role")} value={employee.role} />
          <RecordInfoCard label={t("detailPages.employee.occupation")} value={employee.occupation?.trim() || t("detailPages.employee.noOccupation")} />
          <RecordInfoCard label={t("detailPages.employee.phone")} value={employee.phone} valueClassName="text-right font-mono" />
          <RecordInfoCard label={t("detailPages.employee.status")} value={getArabicStatusLabel(employee.status)} />
          {isWorker ? <RecordInfoCard label={t("detailPages.employee.currentManager")} value={employee.managerName || t("detailPages.employee.noCurrentManager")} /> : null}
          {isWorker ? <RecordInfoCard label={t("detailPages.employee.currentWorkplace")} value={employee.currentWorkplace || t("detailPages.employee.noCurrentWorkplace")} /> : null}
          {isProjectManager ? <RecordInfoCard label={t("detailPages.employee.managedProjectsCount")} value={managedProjectCountLabel} /> : null}
          {isProjectManager ? (
            <RecordInfoCard label={t("detailPages.employee.managedProjectsNames")} value={managedProjectNamesLabel} valueClassName="text-sm leading-7" />
          ) : null}
          {isWarehouseManager ? <RecordInfoCard label={t("detailPages.employee.managedWarehousesCount")} value={managedWarehouseCountLabel} /> : null}
          {isWarehouseManager ? (
            <RecordInfoCard label={t("detailPages.employee.managedWarehousesNames")} value={managedWarehouseNamesLabel} valueClassName="text-sm leading-7" />
          ) : null}
          <div className={hasExpandedNotes ? "md:col-span-2 xl:col-span-3" : undefined}>
            <RecordInfoCard label={t("detailPages.employee.notes")} value={employee.notes ?? noNotesLabel} wide={hasExpandedNotes} />
          </div>
        </div>
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="history">
        <RecordHistoryTable
          emptyAction={
            canAssignWorkplace
              ? { label: t("detailPages.employee.noWorkHistoryAction"), target: workspaceRoutes.employeeEdit(employee.id) }
              : undefined
          }
          emptyHint={canAssignWorkplace ? t("detailPages.employee.noWorkHistoryHint") : undefined}
          emptyLabel={t("detailPages.employee.noWorkHistory")}
          rows={workHistory}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="finance">
        <div className="space-y-6">
          <RecordInfoGrid>
            <RecordInfoCard
              label={t("detailPages.employee.financeCurrentSalary")}
              value={salaryReference && formattedSalaryReference !== null ? (
                <span className="inline-flex items-baseline gap-1.5">
                  <CurrencyRun amount={formattedSalaryReference} currencyLabel={currencyLabel} className="font-mono tabular-nums" />
                  <span className="text-sm text-muted-foreground">/ {salaryPeriodLabel(salaryReference.period)}</span>
                </span>
              ) : t("detailPages.salary.notSpecified")}
            />
            <RecordInfoCard
              label={t("detailPages.employee.financeSalaryPeriod")}
              value={salaryPeriodLabel(salaryReference?.period ?? null)}
            />
            <RecordInfoCard label={t("detailPages.employee.financePaymentCount")} value={String(salaryPayments.length)} />
            <RecordInfoCard label={t("detailPages.employee.financeTotalExpected")} value={<MoneyValue value={totalExpectedAmount} currencyLabel={currencyLabel} variant="detail" />} />
            <RecordInfoCard label={t("detailPages.employee.financeTotalPaid")} value={<MoneyValue value={totalActualAmount} currencyLabel={currencyLabel} variant="detail" />} />
            <RecordInfoCard
              label={t("detailPages.employee.financeCumulativeDifference")}
              value={<MoneyValue value={totalDifferenceMeta.value} currencyLabel={currencyLabel} variant="detail" signed toneClassName={totalDifferenceMeta.className} zeroAsDash />}
            />
          </RecordInfoGrid>

          <div className="rounded-xl border border-border/70 bg-sidebar p-5 dark:bg-surface" dir="rtl">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" dir="rtl">
              <div className="space-y-1 text-start">
                <h3 className="text-lg font-semibold text-foreground">{t("detailPages.employee.financeSectionTitle")}</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("detailPages.employee.financeSectionDescription")}
                </p>
              </div>
              {isWorker && employee.status === "ACTIVE" ? (
                <Button size="lg" onClick={() => setPaymentDialogOpen(true)}>
                  {t("salaries.addPayment")}
                </Button>
              ) : null}
            </div>


          </div>

          <section className="space-y-3 rounded-xl border border-border/70 bg-sidebar p-5 dark:bg-surface" aria-labelledby="employee-earnings-history-title">
            <h3 id="employee-earnings-history-title" className="text-lg font-semibold text-foreground">
              {t("earnings.historyTitle")}
            </h3>
            <EmployeeEarningsHistory employeeId={employee.id} />
          </section>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-sidebar dark:bg-surface" dir="rtl">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" aria-label={t("detailPages.employee.financeSectionTitle")}>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableDate")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableDays")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableExpected")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableActual")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableDifference")}</th>
                    <th className="px-4 py-3 text-start font-medium" scope="col">{t("detailPages.employee.financeTableNotes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSalaryPayments.length > 0 ? (
                    sortedSalaryPayments.map((payment) => {
                      const difference = getSalaryDifferenceMeta(payment.expectedAmountDzd, payment.actualAmountDzd)

                      return (
                        <tr key={payment.id} className="border-t border-border/60 bg-sidebar dark:bg-background">
                          <td className="px-4 py-4 text-start text-foreground">{<AppDate value={payment.paymentDate} />}</td>
                          <td className="px-4 py-4 text-start font-mono tabular-nums text-foreground" dir="ltr">{payment.days}</td>
                          <td className="px-4 py-4 text-start text-foreground"><MoneyValue value={payment.expectedAmountDzd} currencyLabel={currencyLabel} variant="detail" /></td>
                          <td className="px-4 py-4 text-start text-foreground"><MoneyValue value={payment.actualAmountDzd} currencyLabel={currencyLabel} variant="detail" /></td>
                          <td className="px-4 py-4 text-start font-medium">
                            <MoneyValue value={difference.value} currencyLabel={currencyLabel} variant="detail" signed toneClassName={difference.className} zeroAsDash />
                          </td>
                          <td className="px-4 py-4 text-start text-muted-foreground">{payment.note?.trim() ? payment.note : noNotesLabel}</td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                        {t("detailPages.employee.financeEmpty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </RecordTabPanel>

      {isWorker ? (
        <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="debts">
          <DebtCasesPanel
            accounts={debtAccounts}
            debtEntriesByAccountId={debtEntriesByAccountId}
            title="ديون العامل"
            workerId={employee.id}
          />
        </RecordTabPanel>
      ) : null}
    </RecordPageFrame>
  )
}
