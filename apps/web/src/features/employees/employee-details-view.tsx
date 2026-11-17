import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { RecordHistoryTable, RecordInfoCard, RecordPageFrame, RecordTabPanel, RecordTabs } from "@/features/shared/record-page-frame"
import { workspaceRoutes } from "@/router/navigation"

type EmployeeDetailsHistoryRow = {
  id: string
  title: string
  detail?: string | null
  detailContent?: ReactNode
  typeLabel: string
  periodLabel: ReactNode
  statusLabel: string
}

export type EmployeeDetailsDisplay = {
  id: string
  name: string
  role: string
  occupation: string | null
  phone: string
  status: string
  notes: string | null
  managerName: string
  currentWorkplace: string
  isWorker: boolean
  isProjectManager: boolean
  isWarehouseManager: boolean
  managedProjectsCount: string
  managedProjectsNames: string
  managedWarehousesCount: string
  managedWarehousesNames: string
  notesWide: boolean
}

/** Shared original employee detail-page composition. Data adapters provide display values and panel content. */
export function EmployeeDetailsView({
  employee,
  activeTab,
  onTabChange,
  workHistory,
  financeContent,
  debtsContent,
  beforeTabs,
  action,
  canAssignWorkplace,
}: {
  employee: EmployeeDetailsDisplay
  activeTab: string
  onTabChange: (tabId: string) => void
  workHistory: EmployeeDetailsHistoryRow[]
  financeContent: ReactNode
  debtsContent: ReactNode
  beforeTabs?: ReactNode
  action?: ReactNode
  canAssignWorkplace: boolean
}) {
  const { t } = useTranslation()
  const tabs = ["personal", "history", "finance", ...(employee.isWorker ? ["debts"] : [])]
  const resolvedTab = tabs.includes(activeTab) ? activeTab : "personal"
  const tabsBaseId = `employee-record-${employee.id}`

  return (
    <RecordPageFrame
      backHref="/employees"
      backLabel={t("detailPages.employee.back")}
      description=""
      editHref={`/employees/${encodeURIComponent(employee.id)}/edit`}
      editLabel={t("detailPages.employee.edit")}
      title={employee.name}
      action={action}
    >
      {beforeTabs}
      <RecordTabs
        activeTab={resolvedTab}
        baseId={tabsBaseId}
        tabs={[
          { id: "personal", label: t("detailPages.employee.personalTab") },
          { id: "history", label: t("detailPages.employee.historyTab") },
          { id: "finance", label: t("detailPages.employee.financeTab") },
          ...(employee.isWorker ? [{ id: "debts", label: "الديون" }] : []),
        ]}
        onChange={onTabChange}
      />
      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="personal">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RecordInfoCard label={t("detailPages.employee.fullName")} value={employee.name} />
          <RecordInfoCard label={t("detailPages.employee.role")} value={employee.role} />
          <RecordInfoCard label={t("detailPages.employee.occupation")} value={employee.occupation?.trim() || t("detailPages.employee.noOccupation")} />
          <RecordInfoCard label={t("detailPages.employee.phone")} value={<bdi dir="ltr">{employee.phone}</bdi>} valueClassName="font-mono" />
          <RecordInfoCard label={t("detailPages.employee.status")} value={employee.status} />
          {employee.isWorker ? <RecordInfoCard label={t("detailPages.employee.currentManager")} value={employee.managerName} /> : null}
          {employee.isWorker ? <RecordInfoCard label={t("detailPages.employee.currentWorkplace")} value={employee.currentWorkplace} /> : null}
          {employee.isProjectManager ? <RecordInfoCard label={t("detailPages.employee.managedProjectsCount")} value={employee.managedProjectsCount} /> : null}
          {employee.isProjectManager ? <RecordInfoCard label={t("detailPages.employee.managedProjectsNames")} value={employee.managedProjectsNames} valueClassName="text-sm leading-7" /> : null}
          {employee.isWarehouseManager ? <RecordInfoCard label={t("detailPages.employee.managedWarehousesCount")} value={employee.managedWarehousesCount} /> : null}
          {employee.isWarehouseManager ? <RecordInfoCard label={t("detailPages.employee.managedWarehousesNames")} value={employee.managedWarehousesNames} valueClassName="text-sm leading-7" /> : null}
          <RecordInfoCard label={t("detailPages.employee.notes")} value={employee.notes?.trim() || t("common.noNotes")} wide={employee.notesWide} />
        </div>
      </RecordTabPanel>
      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="history">
        <RecordHistoryTable
          emptyAction={canAssignWorkplace ? { label: t("detailPages.employee.noWorkHistoryAction"), target: workspaceRoutes.employeeEdit(employee.id) } : undefined}
          emptyHint={canAssignWorkplace ? t("detailPages.employee.noWorkHistoryHint") : undefined}
          emptyLabel={t("detailPages.employee.noWorkHistory")}
          rows={workHistory}
        />
      </RecordTabPanel>
      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="finance">
        {financeContent}
      </RecordTabPanel>
      {employee.isWorker ? (
        <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="debts">
          {debtsContent}
        </RecordTabPanel>
      ) : null}
    </RecordPageFrame>
  )
}
