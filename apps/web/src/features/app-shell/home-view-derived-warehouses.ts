import { getArabicRoleLabel, getArabicStatusLabel } from "@/features/shared/status-meta"

import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import { formatDateRange, formatName } from "./home-view-derived-formatters"
import { collectIds, groupItemsBy } from "./home-view-derived-grouping"
import type { HomeViewDerivedLookups } from "./home-view-derived-lookups"
import type { DemoWorkspace } from "./workspace-queries"

type Translate = (key: string, options?: Record<string, unknown>) => string

/** Derives warehouse list data from workspace. */
export function deriveWarehouseArchiveState({
  hasActiveManagerRelation,
  hasActiveWarehouseWorkers,
  t,
}: {
  hasActiveManagerRelation: boolean
  hasActiveWarehouseWorkers: boolean
  t: Translate
}) {
  const canArchive = !hasActiveWarehouseWorkers && !hasActiveManagerRelation

  return {
    canArchive,
    archiveDisabledReason: canArchive
      ? null
      : hasActiveWarehouseWorkers && hasActiveManagerRelation
        ? t("detailPages.warehouse.archiveReasonManagerAndWorkers")
        : hasActiveWarehouseWorkers
          ? t("detailPages.warehouse.archiveReasonWorkers")
          : t("detailPages.warehouse.archiveReasonManager"),
  }
}

/**
 * buildWarehouseRows({ component.
 */
export function buildWarehouseRows({
  copy,
  lookups,
  t,
  workspace,
}: {
  copy: Pick<HomeViewCopy, "shell">
  lookups: HomeViewDerivedLookups
  t: Translate
  workspace: DemoWorkspace
}) {
  const warehouseIdsWithActiveWorkers = collectIds(
    workspace.warehouseAssignments,
    (assignment) => (assignment.status === "ACTIVE" ? assignment.warehouseId : null),
  )

  return workspace.warehouses.map((warehouse) => {
    const manager = warehouse.managerId ? lookups.employeeById.get(warehouse.managerId) : null
    const hasActiveWarehouseWorkers = warehouseIdsWithActiveWorkers.has(warehouse.id)
    const hasActiveManagerRelation = warehouse.managerId !== null

    return {
      ...warehouse,
      managerName: manager ? formatName(manager) : copy.shell.noManager,
      ...deriveWarehouseArchiveState({ hasActiveManagerRelation, hasActiveWarehouseWorkers, t }),
    }
/**
 * buildWarehouseDerivedCollections({ component.
 */
  })
}

export function buildWarehouseDerivedCollections({
  copy,
  detailCopy,
  lookups,
  workspace,
}: {
  copy: Pick<HomeViewCopy, "shell">
  detailCopy: HomeViewDetailCopy
  lookups: HomeViewDerivedLookups
  workspace: DemoWorkspace
}) {
  const managementHistoryByWarehouseId = groupItemsBy(workspace.warehouseManagerOwnershipHistory, (entry) => entry.warehouseId)
  const activeAssignmentsByWarehouseId = groupItemsBy(
    workspace.warehouseAssignments,
    (assignment) => (assignment.status === "ACTIVE" ? assignment.warehouseId : null),
  )

  const warehouseManagementHistoryByWarehouseId = Object.fromEntries(
    workspace.warehouses.map((warehouse) => [
      warehouse.id,
      [...(managementHistoryByWarehouseId.get(warehouse.id) ?? [])]
        .sort((left, right) => right.startDate.localeCompare(left.startDate))
        .map((entry) => ({
          id: entry.id,
          typeLabel: detailCopy.warehouse.managerLabel,
          title: lookups.employeeById.get(entry.managerId)
            ? formatName(lookups.employeeById.get(entry.managerId)!)
            : copy.shell.noManager,
          detail: entry.notes,
          periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
          statusLabel: getArabicStatusLabel(entry.status),
        })),
    ]),
  )

  const warehouseWorkersByWarehouseId = Object.fromEntries(
    workspace.warehouses.map((warehouse) => [
      warehouse.id,
      (activeAssignmentsByWarehouseId.get(warehouse.id) ?? [])
        .map((assignment) => {
          const worker = lookups.employeeById.get(assignment.employeeId)
          const workerRole = worker ? lookups.roleById.get(worker.roleId) : null

          return {
            id: assignment.id,
            typeLabel: getArabicRoleLabel(workerRole ?? null),
            title: worker ? formatName(worker) : detailCopy.shared.activeWorkerMissing,
            detail: assignment.notes,
            periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
            statusLabel: detailCopy.shared.currentAssignment,
          }
        }),
    ]),
  )

/**
 * buildWarehouseOptions(workspace component.
 */
  return {
    warehouseManagementHistoryByWarehouseId,
    warehouseWorkersByWarehouseId,
  }
}

export function buildWarehouseOptions(workspace: DemoWorkspace) {
  return workspace.warehouses
    .filter((warehouse) => warehouse.status === "ACTIVE")
    .map((warehouse) => ({ id: warehouse.id, label: warehouse.name }))
    .sort((left, right) => left.label.localeCompare(right.label, "ar"))
}
