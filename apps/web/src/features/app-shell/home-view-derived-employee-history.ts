import { getArabicHistoryEventLabel, getArabicRoleLabel, getArabicStatusLabel } from "@/features/shared/status-meta"

import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import { formatDateRange, formatName, formatSalaryPeriodLabel } from "./home-view-derived-formatters"
import type { HomeViewDerivedLookups } from "./home-view-derived-lookups"
import type { DemoWorkspace } from "./workspace-queries"

function sortEntriesByStartDate<T extends { startDate: string }>(items: T[]) {
  return [...items].sort((left, right) => right.startDate.localeCompare(left.startDate))
}

function omitSortValue<T extends { sortValue: string }>(item: T): Omit<T, "sortValue"> {
  const clone = { ...item }
  Reflect.deleteProperty(clone, "sortValue")
  return clone
}

function buildEmployeeWorkHistory({
  copy,
  detailCopy,
  employee,
  lookups,
  workspace,
}: {
  copy: Pick<HomeViewCopy, "shell">
  detailCopy: HomeViewDetailCopy
  employee: DemoWorkspace["employees"][number]
  lookups: HomeViewDerivedLookups
  workspace: DemoWorkspace
}) {
  const items = [
    ...workspace.employeeStateHistory
      .filter((entry) => entry.employeeId === employee.id)
      .map((entry) => ({
        id: `state-${entry.id}`,
        typeLabel: detailCopy.employee.employmentState,
        title: `${getArabicRoleLabel(lookups.roleById.get(entry.roleId) ?? null)} - ${getArabicStatusLabel(entry.status)}`,
        detail:
          entry.salaryAmountDzd !== null
            ? `${detailCopy.salary.activeSalaryPrefix} ${entry.salaryAmountDzd} ${detailCopy.salary.currency}${formatSalaryPeriodLabel(entry.salaryPeriod, detailCopy.salary) ? ` / ${formatSalaryPeriodLabel(entry.salaryPeriod, detailCopy.salary)}` : ""}`
            : null,
        periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
        statusLabel: getArabicHistoryEventLabel(entry.eventType),
        sortValue: entry.startDate,
      })),
    ...workspace.managerAssignments
      .filter((assignment) => assignment.workerId === employee.id)
      .map((assignment) => ({
        id: `manager-${assignment.id}`,
        typeLabel: detailCopy.employee.directManager,
        title: lookups.employeeById.get(assignment.managerId)
          ? formatName(lookups.employeeById.get(assignment.managerId)!)
          : copy.shell.noManager,
        detail: assignment.notes,
        periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
        statusLabel: getArabicStatusLabel(assignment.status),
        sortValue: assignment.startDate,
      })),
    ...workspace.projectAssignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .map((assignment) => ({
        id: `project-${assignment.id}`,
        typeLabel: detailCopy.employee.projectAssignment,
        title: lookups.projectById.get(assignment.projectId)?.name ?? copy.shell.noProject,
        detail: assignment.notes,
        periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
        statusLabel: getArabicStatusLabel(assignment.status),
        sortValue: assignment.startDate,
      })),
    ...workspace.warehouseAssignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .map((assignment) => ({
        id: `warehouse-${assignment.id}`,
        typeLabel: detailCopy.employee.warehouseAssignment,
        title: lookups.warehouseById.get(assignment.warehouseId)?.name ?? detailCopy.shared.activeWarehouseMissing,
        detail: assignment.notes,
        periodLabel: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
        statusLabel: getArabicStatusLabel(assignment.status),
        sortValue: assignment.startDate,
      })),
    ...workspace.projectManagerOwnershipHistory
      .filter((entry) => entry.managerId === employee.id)
      .map((entry) => ({
        id: `managed-project-${entry.id}`,
        typeLabel: detailCopy.employee.projectOwnership,
        title: lookups.projectById.get(entry.projectId)?.name ?? copy.shell.noProject,
        detail: entry.notes,
        periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
        statusLabel: getArabicStatusLabel(entry.status),
        sortValue: entry.startDate,
      })),
    ...workspace.warehouseManagerOwnershipHistory
      .filter((entry) => entry.managerId === employee.id)
      .map((entry) => ({
        id: `managed-warehouse-${entry.id}`,
        typeLabel: detailCopy.employee.warehouseOwnership,
        title: lookups.warehouseById.get(entry.warehouseId)?.name ?? detailCopy.shared.activeWarehouseMissing,
        detail: entry.notes,
        periodLabel: formatDateRange(entry.startDate, entry.endDate, detailCopy.shared.ongoing),
        statusLabel: getArabicStatusLabel(entry.status),
        sortValue: entry.startDate,
      })),
  ]

  return items
    .sort((left, right) => right.sortValue.localeCompare(left.sortValue))
    .map(omitSortValue)
}

export function buildEmployeeHistoryCollections({
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
  const managerHistoryByEmployeeId = Object.fromEntries(
    workspace.employees.map((employee) => [
      employee.id,
      sortEntriesByStartDate(workspace.managerAssignments.filter((assignment) => assignment.workerId === employee.id)).map(
        (assignment) => ({
          id: assignment.id,
          label: lookups.employeeById.get(assignment.managerId)
            ? formatName(lookups.employeeById.get(assignment.managerId)!)
            : copy.shell.noManager,
          secondary: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
          status: assignment.status,
        }),
      ),
    ]),
  )

  const projectHistoryByEmployeeId = Object.fromEntries(
    workspace.employees.map((employee) => [
      employee.id,
      sortEntriesByStartDate(workspace.projectAssignments.filter((assignment) => assignment.employeeId === employee.id)).map(
        (assignment) => ({
          id: assignment.id,
          label: lookups.projectById.get(assignment.projectId)?.name ?? copy.shell.noProject,
          secondary: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
          status: assignment.status,
        }),
      ),
    ]),
  )

  const warehouseHistoryByEmployeeId = Object.fromEntries(
    workspace.employees.map((employee) => [
      employee.id,
      sortEntriesByStartDate(workspace.warehouseAssignments.filter((assignment) => assignment.employeeId === employee.id)).map(
        (assignment) => ({
          id: assignment.id,
          label: lookups.warehouseById.get(assignment.warehouseId)?.name ?? detailCopy.shared.activeWarehouseMissing,
          secondary: formatDateRange(assignment.startDate, assignment.endDate, detailCopy.shared.ongoing),
          status: assignment.status,
        }),
      ),
    ]),
  )

  const managedProjectsByEmployeeId = Object.fromEntries(
    workspace.employees.map((employee) => [
      employee.id,
      workspace.projects.filter((project) => project.managerId === employee.id && project.status === "ACTIVE").map((project) => project.name),
    ]),
  )

  const managedWarehousesByEmployeeId = Object.fromEntries(
    workspace.employees.map((employee) => [
      employee.id,
      workspace.warehouses
        .filter((warehouse) => warehouse.managerId === employee.id && warehouse.status === "ACTIVE")
        .map((warehouse) => warehouse.name),
    ]),
  )

  const workHistoryByEmployeeId = Object.fromEntries(
    workspace.employees.map((employee) => [
      employee.id,
      buildEmployeeWorkHistory({ copy, detailCopy, employee, lookups, workspace }),
    ]),
  )

  return {
    managedProjectsByEmployeeId,
    managedWarehousesByEmployeeId,
    managerHistoryByEmployeeId,
    projectHistoryByEmployeeId,
    warehouseHistoryByEmployeeId,
    workHistoryByEmployeeId,
  }
}
