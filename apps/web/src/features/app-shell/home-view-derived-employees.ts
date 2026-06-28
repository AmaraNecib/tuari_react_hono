import { getArabicRoleLabel } from "@/features/shared/status-meta"

import type { HomeViewCopy, HomeViewDetailCopy } from "./home-view-copy"
import { formatName } from "./home-view-derived-formatters"
import { collectIds, groupItemsBy } from "./home-view-derived-grouping"
import { buildEmployeeHistoryCollections } from "./home-view-derived-employee-history"
import { buildEmployeeSalaryCollections } from "./home-view-derived-employee-salary"
import type { HomeViewDerivedLookups } from "./home-view-derived-lookups"
import type { DemoWorkspace } from "./workspace-queries"

type Translate = (key: string, options?: Record<string, unknown>) => string

type EmployeeDeleteFacts = {
  hasManagedProjectHistory: boolean
  hasManagedWarehouseHistory: boolean
  hasManagerHistory: boolean
  hasProjectHistory: boolean
  hasSalaryPayments: boolean
  hasWarehouseHistory: boolean
  managesAnyProject: boolean
  managesAnyWarehouse: boolean
}

type EmployeeLeaveFacts = {
  employeeStatus: DemoWorkspace["employees"][number]["status"]
  hasActiveProjectManagerProject: boolean
  hasActiveProjectManagerReports: boolean
  hasActiveWarehouseManagerWarehouse: boolean
  hasManagerAssignment: boolean
  hasProjectAssignment: boolean
  hasWarehouseAssignment: boolean
  roleKey: string | null
}

const employeeRolePriority: Record<string, number> = {
  project_manager: 0,
  warehouse_manager: 1,
  worker: 2,
}

export type EmployeeRelationshipFacts = {
  employeeIdsWithManagedProjectHistory: Set<string>
  employeeIdsWithManagedWarehouseHistory: Set<string>
  employeeIdsWithManagerHistory: Set<string>
  employeeIdsWithProjectHistory: Set<string>
  employeeIdsWithSalaryPayments: Set<string>
  employeeIdsWithWarehouseHistory: Set<string>
  activeReportsByManagerId: Map<string, DemoWorkspace["managerAssignments"]>
  activeProjectsByManagerId: Map<string, DemoWorkspace["projects"]>
  activeWarehousesByManagerId: Map<string, DemoWorkspace["warehouses"]>
  projectsByManagerId: Map<string, DemoWorkspace["projects"]>
  warehousesByManagerId: Map<string, DemoWorkspace["warehouses"]>
}

/** Derives employee list data from workspace. */
export function buildEmployeeRelationshipFacts(workspace: DemoWorkspace): EmployeeRelationshipFacts {
  const employeeIdsWithManagerHistory = new Set<string>()

  for (const assignment of workspace.managerAssignments) {
    employeeIdsWithManagerHistory.add(assignment.workerId)
    employeeIdsWithManagerHistory.add(assignment.managerId)
  }

  return {
    employeeIdsWithManagedProjectHistory: collectIds(workspace.projectManagerOwnershipHistory, (entry) => entry.managerId),
    employeeIdsWithManagedWarehouseHistory: collectIds(workspace.warehouseManagerOwnershipHistory, (entry) => entry.managerId),
    employeeIdsWithManagerHistory,
    employeeIdsWithProjectHistory: collectIds(workspace.projectAssignments, (assignment) => assignment.employeeId),
    employeeIdsWithSalaryPayments: collectIds(workspace.salaryPayments, (payment) => payment.employeeId),
    employeeIdsWithWarehouseHistory: collectIds(workspace.warehouseAssignments, (assignment) => assignment.employeeId),
    activeReportsByManagerId: groupItemsBy(
      workspace.managerAssignments,
      (assignment) => (assignment.status === "ACTIVE" ? assignment.managerId : null),
    ),
    activeProjectsByManagerId: groupItemsBy(
      workspace.projects,
      (project) => (project.status === "ACTIVE" && project.managerId ? project.managerId : null),
    ),
    activeWarehousesByManagerId: groupItemsBy(
      workspace.warehouses,
      (warehouse) => (warehouse.status === "ACTIVE" && warehouse.managerId ? warehouse.managerId : null),
    ),
    projectsByManagerId: groupItemsBy(workspace.projects, (project) => project.managerId),
    warehousesByManagerId: groupItemsBy(workspace.warehouses, (warehouse) => warehouse.managerId),
  }
}

/**
 * deriveEmployeeDeleteState(facts component.
 */
export function deriveEmployeeDeleteState(facts: EmployeeDeleteFacts, t: Translate) {
  const canDelete =
    !facts.hasManagerHistory &&
    !facts.hasProjectHistory &&
    !facts.hasWarehouseHistory &&
    !facts.hasManagedProjectHistory &&
    !facts.hasManagedWarehouseHistory &&
    !facts.hasSalaryPayments &&
    !facts.managesAnyProject &&
    !facts.managesAnyWarehouse

  return {
    canDelete,
    deleteDisabledReason: canDelete
      ? null
      : facts.hasManagerHistory
        ? t("detailPages.employee.deleteReasonManagementHistory")
        : facts.hasProjectHistory || facts.hasWarehouseHistory
          ? t("detailPages.employee.deleteReasonWorkHistory")
          : facts.hasManagedProjectHistory || facts.hasManagedWarehouseHistory || facts.hasSalaryPayments
            ? t("detailPages.employee.deleteReasonHistoryOrPayments")
            : facts.managesAnyProject || facts.managesAnyWarehouse
              ? t("detailPages.employee.deleteReasonManagedScope")
              : t("detailPages.employee.deleteReasonFallback"),
/**
 * deriveEmployeeLeaveState(facts component.
 */
  }
}

export function deriveEmployeeLeaveState(facts: EmployeeLeaveFacts, t: Translate) {
  const workerStillLinked = facts.roleKey === "worker" && (facts.hasManagerAssignment || facts.hasProjectAssignment || facts.hasWarehouseAssignment)
  const projectManagerStillLinked =
    facts.roleKey === "project_manager" &&
    (facts.hasActiveProjectManagerProject ||
      facts.hasProjectAssignment ||
      facts.hasWarehouseAssignment ||
      facts.hasActiveProjectManagerReports)
  const warehouseManagerStillLinked =
    facts.roleKey === "warehouse_manager" &&
    (facts.hasActiveWarehouseManagerWarehouse || facts.hasProjectAssignment || facts.hasWarehouseAssignment)

  const canLeave = facts.employeeStatus === "ACTIVE" && !workerStillLinked && !projectManagerStillLinked && !warehouseManagerStillLinked

  return {
    canLeave,
    leaveDisabledReason: canLeave
      ? null
      : facts.employeeStatus !== "ACTIVE"
        ? t("detailPages.employee.leaveReasonInactive")
        : workerStillLinked
          ? t("detailPages.employee.leaveReasonWorkerLinked")
          : projectManagerStillLinked
            ? t("detailPages.employee.leaveReasonProjectManagerLinked")
/**
 * buildEmployeeRow({ component.
 */
            : warehouseManagerStillLinked
              ? t("detailPages.employee.leaveReasonWarehouseManagerLinked")
              : t("detailPages.employee.leaveReasonFallback"),
  }
}

export function buildEmployeeRow({
  copy,
  employee,
  lookups,
  relationshipFacts,
  t,
}: {
  copy: { shell: { noManager: string; noProject: string } }
  employee: DemoWorkspace["employees"][number]
  lookups: HomeViewDerivedLookups
  relationshipFacts: EmployeeRelationshipFacts
  t: Translate
}) {
  const role = lookups.roleById.get(employee.roleId)
  const managerAssignment = lookups.activeManagerByWorker.get(employee.id) ?? null
  const manager = managerAssignment ? lookups.employeeById.get(managerAssignment.managerId) : null
  const projectAssignment = lookups.activeProjectByEmployee.get(employee.id) ?? null
  const project = projectAssignment ? lookups.projectById.get(projectAssignment.projectId) : null
  const warehouseAssignment = lookups.activeWarehouseByEmployee.get(employee.id) ?? null
  const warehouse = warehouseAssignment ? lookups.warehouseById.get(warehouseAssignment.warehouseId) ?? null : null

  const deleteState = deriveEmployeeDeleteState(
    {
      hasManagedProjectHistory: relationshipFacts.employeeIdsWithManagedProjectHistory.has(employee.id),
      hasManagedWarehouseHistory: relationshipFacts.employeeIdsWithManagedWarehouseHistory.has(employee.id),
      hasManagerHistory: relationshipFacts.employeeIdsWithManagerHistory.has(employee.id),
      hasProjectHistory: relationshipFacts.employeeIdsWithProjectHistory.has(employee.id),
      hasSalaryPayments: relationshipFacts.employeeIdsWithSalaryPayments.has(employee.id),
      hasWarehouseHistory: relationshipFacts.employeeIdsWithWarehouseHistory.has(employee.id),
      managesAnyProject: (relationshipFacts.projectsByManagerId.get(employee.id) ?? []).length > 0,
      managesAnyWarehouse: (relationshipFacts.warehousesByManagerId.get(employee.id) ?? []).length > 0,
    },
    t,
  )

  const leaveState = deriveEmployeeLeaveState(
    {
      employeeStatus: employee.status,
      hasActiveProjectManagerProject: (relationshipFacts.activeProjectsByManagerId.get(employee.id) ?? []).length > 0,
      hasActiveProjectManagerReports: (relationshipFacts.activeReportsByManagerId.get(employee.id) ?? []).length > 0,
      hasActiveWarehouseManagerWarehouse: (relationshipFacts.activeWarehousesByManagerId.get(employee.id) ?? []).length > 0,
      hasManagerAssignment: Boolean(managerAssignment),
      hasProjectAssignment: Boolean(projectAssignment),
      hasWarehouseAssignment: Boolean(warehouseAssignment),
      roleKey: role?.key ?? null,
    },
    t,
  )

  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    name: formatName(employee),
    roleId: employee.roleId,
    roleKey: role?.key ?? "",
    role: role ? getArabicRoleLabel(role) : copy.shell.noManager,
    phone: employee.phone,
    status: employee.status,
    salaryAmountDzd: employee.salaryAmountDzd,
    salaryPeriod: employee.salaryPeriod,
    managerName: manager ? formatName(manager) : copy.shell.noManager,
    managerAssignmentId: managerAssignment?.id ?? null,
    currentManagerId: manager?.id ?? null,
    currentProjectId: project?.id ?? null,
    currentProjectAssignmentId: projectAssignment?.id ?? null,
    currentWarehouseId: warehouse?.id ?? null,
    currentWarehouseAssignmentId: warehouseAssignment?.id ?? null,
    currentWorkplace: project?.name ?? warehouse?.name ?? copy.shell.noProject,
/**
 * buildEmployeeRows({ component.
 */
    notes: employee.notes,
    isWorker: role?.key === "worker",
    ...deleteState,
    ...leaveState,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  }
}

export function buildEmployeeRows({
  copy,
  lookups,
  t,
  workspace,
}: {
  copy: Pick<HomeViewCopy, "shell">
  lookups: HomeViewDerivedLookups
  t: Translate
/**
 * buildManagerOptions({ component.
 */
  workspace: DemoWorkspace
}) {
  const relationshipFacts = buildEmployeeRelationshipFacts(workspace)

  return workspace.employees
    .map((employee) => buildEmployeeRow({ copy, employee, lookups, relationshipFacts, t }))
    .sort((left, right) => {
      const priorityDifference = (employeeRolePriority[left.roleKey] ?? 99) - (employeeRolePriority[right.roleKey] ?? 99)
      return priorityDifference !== 0 ? priorityDifference : left.name.localeCompare(right.name, "ar")
    })
}

export function buildManagerOptions({
  lookups,
  workspace,
}: {
  lookups: HomeViewDerivedLookups
  workspace: DemoWorkspace
}) {
  const activeProjectsByManagerId = groupItemsBy(
    workspace.projects,
/**
 * buildWarehouseManagerOptions({ component.
 */
    (project) => (project.status === "ACTIVE" && project.managerId ? project.managerId : null),
  )

  return workspace.employees
    .filter((employee) => employee.status === "ACTIVE" && lookups.roleById.get(employee.roleId)?.key === "project_manager")
    .map((employee) => ({
      id: employee.id,
      label: `${formatName(employee)} - ${employee.phone}`,
      projectOptions: (activeProjectsByManagerId.get(employee.id) ?? [])
        .map((project) => ({ id: project.id, label: project.name }))
        .sort((left, right) => left.label.localeCompare(right.label, "ar")),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "ar"))
/**
 * buildEmployeeDerivedCollections({ component.
 */
}

export function buildWarehouseManagerOptions({
  lookups,
  workspace,
}: {
  lookups: HomeViewDerivedLookups
  workspace: DemoWorkspace
}) {
  return workspace.employees
    .filter((employee) => employee.status === "ACTIVE" && lookups.roleById.get(employee.roleId)?.key === "warehouse_manager")
    .map((employee) => ({
      id: employee.id,
      label: `${formatName(employee)} - ${employee.phone}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "ar"))
}

export function buildEmployeeDerivedCollections({
  copy,
  detailCopy,
  employeeRows,
  lookups,
  workspace,
}: {
  copy: Pick<HomeViewCopy, "shell">
  detailCopy: HomeViewDetailCopy
  employeeRows: ReturnType<typeof buildEmployeeRows>
  lookups: HomeViewDerivedLookups
  workspace: DemoWorkspace
}) {
  return {
    ...buildEmployeeHistoryCollections({
      copy,
      detailCopy,
      lookups,
      workspace,
    }),
    ...buildEmployeeSalaryCollections({
      copy,
      detailCopy,
      employeeRows,
      lookups,
      workspace,
    }),
  }
}
