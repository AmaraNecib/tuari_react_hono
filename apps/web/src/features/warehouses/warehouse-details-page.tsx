/**
 * Warehouse details page for viewing and managing warehouse information.
 */
import { useTranslation } from "react-i18next"

import { getArabicStatusLabel } from "@/features/shared/status-meta"
import { InventoryLocationContentsSection } from "@/features/inventory/inventory-location-contents-section"
import {
  RecordHistoryTable,
  RecordInfoCard,
  RecordInfoGrid,
  RecordPageFrame,
  RecordTabPanel,
  RecordTabs,
} from "@/features/shared/record-page-frame"

export type WarehousePageRecord = {
  id: string
  name: string
  address: string | null
  managerId: string | null
  managerName: string
  status: string
  notes: string | null
}

export function WarehouseDetailsPage({
  activeTab,
  managementHistoryRows,
  onTabChange,
  teamRows,
  warehouse,
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
  teamRows: Array<{
    id: string
    typeLabel: string
    title: string
    detail?: string | null
    periodLabel: string
    statusLabel: string
  }>
  warehouse: WarehousePageRecord
}) {
  const { t } = useTranslation()
  const resolvedTab = ["overview", "history", "team", "items"].includes(activeTab) ? activeTab : "overview"
  const hasExpandedNotes = (warehouse.notes?.trim().length ?? 0) > 90
  const tabsBaseId = `warehouse-record-${warehouse.id}`

  return (
    <RecordPageFrame
      backHref="/warehouses"
      backLabel={t("detailPages.warehouse.back")}
      description=""
      editHref={`/warehouses/${encodeURIComponent(warehouse.id)}/edit`}
      editLabel={t("detailPages.warehouse.edit")}
      title={warehouse.name}
    >
      <RecordTabs
        activeTab={resolvedTab}
        baseId={tabsBaseId}
        tabs={[
          { id: "overview", label: t("detailPages.warehouse.overviewTab") },
          { id: "history", label: t("detailPages.warehouse.historyTab") },
          { id: "team", label: t("detailPages.warehouse.teamTab") },
          { id: "items", label: "العناصر" },
        ]}
        onChange={onTabChange}
      />

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="overview">
        <RecordInfoGrid>
          <RecordInfoCard label={t("detailPages.warehouse.name")} value={warehouse.name} />
          <RecordInfoCard label={t("detailPages.warehouse.status")} value={getArabicStatusLabel(warehouse.status)} />
          <RecordInfoCard label={t("detailPages.warehouse.manager")} value={warehouse.managerName} />
          <RecordInfoCard label={t("detailPages.warehouse.address")} value={warehouse.address ?? t("shell.noAddress")} />
          <RecordInfoCard label={t("detailPages.warehouse.teamCount")} value={String(teamRows.length)} />
          <RecordInfoCard label={t("detailPages.warehouse.notes")} value={warehouse.notes ?? t("common.noNotes")} wide={hasExpandedNotes} />
        </RecordInfoGrid>
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="history">
        <RecordHistoryTable
          emptyLabel={t("detailPages.warehouse.historyEmpty")}
          rows={managementHistoryRows}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="team">
        <RecordHistoryTable
          columns={{
            type: t("detailPages.warehouse.teamRole"),
            details: t("detailPages.warehouse.teamDetails"),
            period: t("detailPages.warehouse.teamPeriod"),
            status: t("detailPages.warehouse.teamStatus"),
          }}
          emptyLabel={t("detailPages.warehouse.teamEmpty")}
          rows={teamRows}
        />
      </RecordTabPanel>

      <RecordTabPanel activeTab={resolvedTab} baseId={tabsBaseId} tabId="items">
        <InventoryLocationContentsSection warehouseId={warehouse.id} />
      </RecordTabPanel>
    </RecordPageFrame>
  )
}
