import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useMoneyGrouping } from "@/features/preferences/money-format-preference"
import { CurrencyRun } from "@/features/shared/money-value"
import { formatSalaryReferenceAmount } from "@/features/shared/exact-salary-reference-display"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { ExactDebtsClient, SalaryProjectAssignmentWindow } from "@tuari/contracts"

import { getSalaryPeriodLabelKey } from "@/features/app-shell/salary-table-primitives"
import type { SalaryProjectOption } from "./employee-earning-approval-form"
import { EmployeeEarningsHistory } from "./employee-earnings-history"
import { EmployeePayrollPanel } from "./employee-payroll-panel"
import { ExactDebtsPage } from "@/features/debts/debts-exact-page"
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

/** Employee detail page with tabs for personal, work, and finance. */
/**
 * @description Component
 */
export function EmployeeDetailsPage({
  activeTab,
  debtClient,
  employee,
  managedProjects,
  managedWarehouses,
  projects = [],
  onTabChange,
  onApproveEarning,
  workHistory,
}: {
  activeTab: string
  debtClient: ExactDebtsClient
  employee: EmployeeTableRow
  managedProjects: string[]
  managedWarehouses: string[]
  /** Kept for existing detail-route callers; earnings are no longer calculated from assignment windows. */
  projectAssignments?: SalaryProjectAssignmentWindow[]
  /** Projects the payment dialog can attribute a split to. */
  projects?: SalaryProjectOption[]
  onTabChange: (tabId: string) => void
  onApproveEarning?: (employeeId: string) => void
  workHistory: EmployeeWorkHistoryRow[]
}) {
  const { t } = useTranslation()
  const { isProjectManager, isWarehouseManager, isWorker } = classifyWorkforceRole(employee.roleKey)
  const availableTabs = isWorker ? ["personal", "history", "finance", "debts"] : ["personal", "history", "finance"]
  const resolvedTab = availableTabs.includes(activeTab) ? activeTab : "personal"
  const currencyLabel = t("detailPages.salary.currency")
  const useGrouping = useMoneyGrouping()
  const salaryReference = employee.salaryReference ?? null
  const employeeNames = useMemo(() => ({ [employee.id]: employee.name }), [employee.id, employee.name])
  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects],
  )
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
        employee.status === "ACTIVE" ? (
          <Button size="lg" onClick={() => onApproveEarning?.(employee.id)}>
            {t("earnings.approve")}
          </Button>
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
          </RecordInfoGrid>

          <div className="rounded-xl border border-border/70 bg-sidebar p-5 dark:bg-surface" dir="rtl">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" dir="rtl">
              <div className="space-y-1 text-start">
                <h3 className="text-lg font-semibold text-foreground">{t("detailPages.employee.financeSectionTitle")}</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("detailPages.employee.financeSectionDescription")}
                </p>
              </div>
              {employee.status === "ACTIVE" ? (
                <Button size="lg" onClick={() => onApproveEarning?.(employee.id)}>
                  {t("earnings.approve")}
                </Button>
              ) : null}
            </div>


          </div>

          <section className="space-y-3 rounded-xl border border-border/70 bg-sidebar p-5 dark:bg-surface" aria-labelledby="employee-earnings-history-title">
            <h3 id="employee-earnings-history-title" className="text-lg font-semibold text-foreground">
              {t("earnings.historyTitle")}
            </h3>
            <EmployeeEarningsHistory employeeId={employee.id} employeeNames={employeeNames} projectNames={projectNames} />
            <EmployeePayrollPanel employeeId={employee.id} />
          </section>

        </div>
      </RecordTabPanel>

      {isWorker ? (
        <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="debts">
          <ExactDebtsPage client={debtClient} scopedParty={{ id: employee.id, label: employee.name, partyType: "INTERNAL_WORKER" }} parties={[{ id: employee.id, label: employee.name, partyType: "INTERNAL_WORKER" }]} />
        </RecordTabPanel>
      ) : null}
    </RecordPageFrame>
  )
}
