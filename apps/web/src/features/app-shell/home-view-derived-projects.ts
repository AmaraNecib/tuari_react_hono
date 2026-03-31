import { getArabicRoleLabel, getArabicStatusLabel } from "@/features/shared/status-meta"

import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import { formatDateRange, formatName } from "./home-view-derived-formatters"
import { countItemsBy, groupItemsBy } from "./home-view-derived-grouping"
import type { HomeViewDerivedLookups } from "./home-view-derived-lookups"
import type { DemoWorkspace } from "./workspace-queries"

type Translate = (key: string, options?: Record<string, unknown>) => string

export function deriveProjectArchiveState(activeWorkers: number, t: Translate) {
  const canArchive = activeWorkers === 0

  return {
    canArchive,
    archiveDisabledReason: canArchive ? null : t("detailPages.project.archiveReasonWorkers"),
  }
}

export function buildProjectRows({
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
  const activeWorkerCountByProjectId = countItemsBy(
    workspace.projectAssignments,
    (assignment) => (assignment.status === "ACTIVE" ? assignment.projectId : null),
  )

  return workspace.projects.map((project) => {
    const manager = project.managerId ? lookups.employeeById.get(project.managerId) : null
    const activeWorkers = activeWorkerCountByProjectId.get(project.id) ?? 0

    return {
      ...project,
      managerName: manager ? formatName(manager) : copy.shell.noManager,
      activeWorkers,
      ...deriveProjectArchiveState(activeWorkers, t),
    }
  })
}

export function buildProjectDerivedCollections({
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
  const activeAssignmentsByProjectId = groupItemsBy(
    workspace.projectAssignments,
    (assignment) => (assignment.status === "ACTIVE" ? assignment.projectId : null),
  )
  const managementHistoryByProjectId = groupItemsBy(workspace.projectManagerOwnershipHistory, (entry) => entry.projectId)

  const projectWorkersByProjectId = Object.fromEntries(
    workspace.projects.map((project) => [
      project.id,
      (activeAssignmentsByProjectId.get(project.id) ?? [])
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

  const projectManagementHistoryByProjectId = Object.fromEntries(
    workspace.projects.map((project) => [
      project.id,
      [...(managementHistoryByProjectId.get(project.id) ?? [])]
        .sort((left, right) => right.startDate.localeCompare(left.startDate))
        .map((entry) => ({
          id: entry.id,
          typeLabel: detailCopy.project.managerLabel,
          title: lookups.employeeById.get(entry.managerId)
            ? formatName(lookups.employeeById.get(entry.managerId)!)
            : copy.shell.noManager,
          detail: entry.notes,
          periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
          statusLabel: getArabicStatusLabel(entry.status),
        })),
    ]),
  )

  return {
    projectManagementHistoryByProjectId,
    projectWorkersByProjectId,
  }
}

export function buildProjectOptions(workspace: DemoWorkspace) {
  return workspace.projects
    .filter((project) => project.status === "ACTIVE")
    .map((project) => ({ id: project.id, label: project.name }))
    .sort((left, right) => left.label.localeCompare(right.label, "ar"))
}
