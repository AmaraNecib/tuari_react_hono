import { useTranslation } from "react-i18next"

import { getArabicStatusLabel } from "@/features/shared/status-meta"
import { InventoryLocationContentsSection } from "@/features/inventory/inventory-location-contents-section"
import { LocationTransferHistory } from "@/features/inventory/location-transfer-history"
import { workspaceRoutes } from "@/router/navigation"
import {
  RecordHistoryTable,
  RecordInfoCard,
  RecordInfoGrid,
  RecordPageFrame,
  RecordTabPanel,
  RecordTabs,
} from "@/features/shared/record-page-frame"

export type ProjectPageRecord = {
  id: string
  name: string
  location: string | null
  managerId: string | null
  managerName: string
  activeWorkers: number
  status: string
  notes: string | null
}

/** Project detail page with overview and worker assignments. */
/**
 * @description Component
 */
export function ProjectDetailsPage({
  activeTab,
  managementHistoryRows,
  onTabChange,
  project,
  workerRows,
}: {
  activeTab: string
  managementHistoryRows: Array<{
    id: string
    typeLabel: string
    title: string
    detail?: string | null
    periodLabel: string
    statusLabel: string
  }>
  onTabChange: (tabId: string) => void
  project: ProjectPageRecord
  workerRows: Array<{
    id: string
    typeLabel: string
    title: string
    detail?: string | null
    periodLabel: string
    statusLabel: string
  }>
}) {
  const { t } = useTranslation()
  const resolvedTab = ["overview", "history", "workers", "items", "transfers"].includes(activeTab) ? activeTab : "overview"
  const hasExpandedNotes = (project.notes?.trim().length ?? 0) > 90
  const tabsBaseId = `project-record-${project.id}`

  return (
    <RecordPageFrame
      backHref="/projects"
      backLabel={t("detailPages.project.back")}
      description={undefined}
      editHref={`/projects/${encodeURIComponent(project.id)}/edit`}
      editLabel={t("detailPages.project.edit")}
      title={project.name}
    >
      <RecordTabs
        activeTab={resolvedTab}
        baseId={tabsBaseId}
        tabs={[
          { id: "overview", label: t("detailPages.project.overviewTab") },
          { id: "history", label: t("detailPages.project.historyTab") },
          { id: "workers", label: t("detailPages.project.workersTab") },
          { id: "items", label: "العناصر" },
          { id: "transfers", label: "سجل التحويلات" },
        ]}
        onChange={onTabChange}
      />

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="overview">
        <RecordInfoGrid>
          <RecordInfoCard label={t("detailPages.project.name")} value={project.name} />
          <RecordInfoCard label={t("detailPages.project.status")} value={getArabicStatusLabel(project.status)} />
          <RecordInfoCard label={t("detailPages.project.manager")} value={project.managerName} />
          <RecordInfoCard label={t("detailPages.project.location")} value={project.location ?? t("shell.noLocation")} />
          <RecordInfoCard label={t("detailPages.project.workerCount")} value={String(project.activeWorkers)} />
          <RecordInfoCard label={t("detailPages.project.notes")} value={project.notes ?? t("common.noNotes")} wide={hasExpandedNotes} />
        </RecordInfoGrid>
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="workers">
        <RecordHistoryTable
          columns={{
            type: t("detailPages.project.workersRole"),
            details: t("detailPages.project.workersDetails"),
            period: t("detailPages.project.workersPeriod"),
            status: t("detailPages.project.workersStatus"),
          }}
          emptyAction={{
            label: t("detailPages.project.workersEmptyAction"),
            target: workspaceRoutes.employees(),
          }}
          emptyHint={t("detailPages.project.workersEmptyHint")}
          emptyLabel={t("detailPages.project.workersEmpty")}
          rows={workerRows}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="history">
        <RecordHistoryTable
          emptyLabel={t("detailPages.project.historyEmpty")}
          rows={managementHistoryRows}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="items">
        <InventoryLocationContentsSection projectId={project.id} />
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="transfers">
        <LocationTransferHistory locationId={project.id} locationType="PROJECT" />
      </RecordTabPanel>
    </RecordPageFrame>
  )
}
