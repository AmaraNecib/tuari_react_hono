import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { ApplicationClient } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Surface } from "@/features/shared/page-primitives"
import { ProjectsSection, type ProjectRow } from "./projects-section"
import { WarehousesSection, type WarehouseRow } from "./warehouses-section"
import { ProjectCreatePage } from "@/features/projects/project-create-page"
import { ProjectEditPage } from "@/features/projects/project-edit-page"
import { ProjectDetailsPage } from "@/features/projects/project-details-page"
import { WarehouseCreatePage } from "@/features/warehouses/warehouse-create-page"
import { WarehouseEditPage } from "@/features/warehouses/warehouse-edit-page"
import { WarehouseDetailsPage } from "@/features/warehouses/warehouse-details-page"
import { useHomeViewNavigation } from "./home-view-navigation"
import { invalidateExactWorkspace } from "./exact-workspace-refresh"

const queryKey = (workspaceId: string, userId: string, name: string) => ["application", workspaceId, userId, name] as const

export function ExactProjectWarehousePages({ client, workspaceId, userId, page, projectId, warehouseId, detailTab, onProjectTab, onWarehouseTab }: {
  client: ApplicationClient
  workspaceId: string
  userId: string
  page: string
  projectId?: string
  warehouseId?: string
  detailTab?: string
  onProjectTab: (id: string, tab: string) => void
  onWarehouseTab: (id: string, tab: string) => void
}) {
  const { t } = useTranslation()
  const navigation = useHomeViewNavigation()
  const workforceClient = useMemo(() => ({
    approveMonthlyEarnings: (input: Parameters<typeof client.workforceExact.approveMonthlyEarnings>[0]) => client.workforceExact.approveMonthlyEarnings(input),
    listEmployeeEarnings: (input: Parameters<typeof client.workforceExact.listEmployeeEarnings>[0]) => client.workforceExact.listEmployeeEarnings(input),
    getProjectSalaryCost: (input: Parameters<typeof client.workforceExact.getProjectSalaryCost>[0]) => client.workforceExact.getProjectSalaryCost(input),
  }), [client])
  const queryClient = useQueryClient()
  const projectsQuery = useQuery({ queryKey: queryKey(workspaceId, userId, "projects"), queryFn: () => client.projectsList({}), enabled: page.startsWith("project") || page === "projects" })
  const warehousesQuery = useQuery({ queryKey: queryKey(workspaceId, userId, "warehouses"), queryFn: () => client.warehousesList({}), enabled: page.startsWith("warehouse") || page === "warehouses" })
  const employeesQuery = useQuery({ queryKey: queryKey(workspaceId, userId, "employees"), queryFn: () => client.employeesList({}), enabled: page === "projects" || page.startsWith("project") || page === "warehouses" || page.startsWith("warehouse") })
  const rolesQuery = useQuery({ queryKey: queryKey(workspaceId, userId, "roles"), queryFn: () => client.rolesList({}), enabled: page === "project-create" || page === "project-edit" || page === "warehouse-create" || page === "warehouse-edit" })
  const project = projectsQuery.data?.items.find(row => row.id === projectId)
  const warehouse = warehousesQuery.data?.items.find(row => row.id === warehouseId)
  const people = employeesQuery.data?.items ?? []
  const roleRows = rolesQuery.data?.items ?? []
  const managerName = (id: string | null) => {
    const person = people.find(row => row.id === id)
    return person ? `${person.firstName} ${person.lastName}` : t("shell.noManager")
  }
  const projectManagers = people.filter(person => person.status === "ACTIVE" && roleRows.some(role => role.id === person.roleId && role.key === "project_manager"))
  const warehouseManagers = people.filter(person => person.status === "ACTIVE" && roleRows.some(role => role.id === person.roleId && role.key === "warehouse_manager"))
  const projectManagerRoleId = roleRows.find(role => role.key === "project_manager")?.id ?? ""
  const warehouseManagerRoleId = roleRows.find(role => role.key === "warehouse_manager")?.id ?? ""
  const allAssignments = useQuery({ queryKey: queryKey(workspaceId, userId, `project-assignments:${page}:${projectId ?? "all"}`), queryFn: () => client.projectAssignmentsList(page === "projects" ? {} : { projectId }), enabled: page === "projects" || ((page === "project-details" || page === "project-edit") && Boolean(projectId)) })
  const allWarehouseAssignments = useQuery({ queryKey: queryKey(workspaceId, userId, `warehouse-assignments:${warehouseId}`), queryFn: () => client.warehouseAssignmentsList({ warehouseId }), enabled: page === "warehouse-details" && Boolean(warehouseId) })
  const projectHistory = useQuery({ queryKey: queryKey(workspaceId, userId, `project-history:${projectId}`), queryFn: () => client.projectManagerOwnershipHistoryList({ projectId }), enabled: page === "project-details" && Boolean(projectId) })
  const warehouseHistory = useQuery({ queryKey: queryKey(workspaceId, userId, `warehouse-history:${warehouseId}`), queryFn: () => client.warehouseManagerOwnershipHistoryList({ warehouseId }), enabled: page === "warehouse-details" && Boolean(warehouseId) })
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const projectPage = page.startsWith("project")
  const needsRoles = page.endsWith("create") || page.endsWith("edit")
  const activeQueries = [projectPage ? projectsQuery : warehousesQuery, employeesQuery, ...(needsRoles ? [rolesQuery] : []), ...(page === "projects" || page === "project-edit" ? [allAssignments] : [])]
  if (activeQueries.some(query => query.isPending)) return <p role="status">{t("common.loading")}</p>
  const failed = activeQueries.some(query => query.isError)
  if (failed) return <Surface role="alert" variant="panel" className="p-5"><p>{t("shell.loadWorkspaceError")}</p><Button onClick={() => { void Promise.all(activeQueries.map(query => query.refetch())) }}>{t("common.retry")}</Button></Surface>

  const refresh = () => invalidateExactWorkspace(queryClient, workspaceId, userId)
  if (page === "projects") {
    if (allAssignments.isPending) return <p role="status">{t("common.loading")}</p>
    const assignments = allAssignments.data?.items ?? []
    const rows: ProjectRow[] = (projectsQuery.data?.items ?? []).map(row => ({
      ...row,
      managerName: managerName(row.managerId),
      activeWorkers: new Set(assignments.filter(item => item.projectId === row.id && item.status === "ACTIVE").map(item => item.employeeId)).size,
      canArchive: row.status !== "ARCHIVED",
      archiveDisabledReason: null,
    }))
    return <><ProjectsSection title={t("sections.projects.label")} rows={rows} columns={{ name: t("columns.name"), manager: t("columns.manager"), location: t("columns.location"), workers: t("columns.workers"), status: t("columns.status"), actions: t("common.actions") }} emptyLabel={t("shell.empty")} noLocationLabel={t("shell.noLocation")} addLabel={t("shell.addProject")} archiveLabel={t("common.archive")} viewLabel={t("common.view")} editLabel={t("common.edit")} onAdd={() => void navigation.goToProjectCreate()} onView={row => void navigation.goToProjectDetails(row.id)} onEdit={row => void navigation.goToProjectEdit(row.id)} onArchive={row => { void client.projectsUpdate({ id: row.id, status: "ARCHIVED" }).then(result => { if (!result.success) throw new Error(result.error.message); return refresh() }).catch(error => setArchiveError(error instanceof Error ? error.message : t("shell.loadWorkspaceError"))) }} />{archiveError && <p role="alert">{archiveError}</p>}</>
  }
  if (page === "project-create") return <ProjectCreatePage managerOptions={projectManagers.map(row => ({ id: row.id, label: `${row.firstName} ${row.lastName}` }))} projectManagerRoleId={projectManagerRoleId} allowInlineManagerCreate={false} onSaved={() => refresh()} />
  if (page === "project-edit" && project && allAssignments.isPending) return <p role="status">{t("common.loading")}</p>
  if (page === "project-edit" && project) return <ProjectEditPage managerOptions={projectManagers.map(row => ({ id: row.id, label: `${row.firstName} ${row.lastName}` }))} project={{ ...project, managerName: managerName(project.managerId), activeWorkers: new Set((allAssignments.data?.items ?? []).filter(item => item.status === "ACTIVE").map(item => item.employeeId)).size }} projectManagerRoleId={projectManagerRoleId} allowInlineManagerCreate={false} onSaved={() => refresh()} />
  if (page === "project-details" && projectId) {
    const assignments = allAssignments.data?.items ?? []
    if (allAssignments.isPending || projectHistory.isPending) return <p role="status">{t("common.loading")}</p>
    if (allAssignments.isError || projectHistory.isError) return <Surface role="alert" variant="panel" className="p-5"><p>{t("shell.loadWorkspaceError")}</p></Surface>
    const workerRows = assignments.map(item => { const person = people.find(row => row.id === item.employeeId); return { id: item.id, typeLabel: t("detailPages.project.workersRole"), title: person ? `${person.firstName} ${person.lastName}` : item.employeeId, detail: item.notes, periodLabel: `${item.startDate} – ${item.endDate ?? "—"}`, statusLabel: item.status } })
    const managementHistoryRows = (projectHistory.data?.items ?? []).map(item => ({ id: item.id, typeLabel: t("detailPages.project.manager"), title: people.find(person => person.id === item.managerId) ? managerName(item.managerId) : item.managerId, detail: item.notes, periodLabel: `${item.startDate} – ${item.endDate ?? "—"}`, statusLabel: item.status }))
    if (!project) return <p role="alert">{t("detailPages.shared.missingRecordDescription")}</p>
    return <ProjectDetailsPage activeTab={detailTab ?? "overview"} project={{ ...project, managerName: managerName(project.managerId), activeWorkers: new Set(assignments.filter(item => item.status === "ACTIVE").map(item => item.employeeId)).size }} workerRows={workerRows} managementHistoryRows={managementHistoryRows} capabilityMode workforceClient={workforceClient} workforceScope={{ workspaceId, userId }} onTabChange={tab => onProjectTab(project.id, tab)} />
  }
  if (page === "warehouses") {
    const rows: WarehouseRow[] = (warehousesQuery.data?.items ?? []).map(row => ({ ...row, managerName: managerName(row.managerId), canArchive: row.status !== "ARCHIVED", archiveDisabledReason: null }))
    return <><WarehousesSection title={t("sections.warehouses.label")} rows={rows} columns={{ name: t("columns.name"), manager: t("columns.manager"), address: t("columns.address"), status: t("columns.status"), actions: t("common.actions") }} emptyLabel={t("shell.empty")} noAddressLabel={t("shell.noAddress")} addLabel={t("shell.addWarehouse")} archiveLabel={t("common.archive")} viewLabel={t("common.view")} editLabel={t("common.edit")} onAdd={() => void navigation.goToWarehouseCreate()} onView={row => void navigation.goToWarehouseDetails(row.id)} onEdit={row => void navigation.goToWarehouseEdit(row.id)} onArchive={row => { void client.warehousesUpdate({ id: row.id, status: "ARCHIVED" }).then(result => { if (!result.success) throw new Error(result.error.message); return refresh() }).catch(error => setArchiveError(error instanceof Error ? error.message : t("shell.loadWorkspaceError"))) }} />{archiveError && <p role="alert">{archiveError}</p>}</>
  }
  if (page === "warehouse-create") return <WarehouseCreatePage managerOptions={warehouseManagers.map(row => ({ id: row.id, label: `${row.firstName} ${row.lastName}` }))} warehouseManagerRoleId={warehouseManagerRoleId} allowInlineManagerCreate={false} onSaved={() => refresh()} />
  if (page === "warehouse-edit" && warehouse) return <WarehouseEditPage managerOptions={warehouseManagers.map(row => ({ id: row.id, label: `${row.firstName} ${row.lastName}` }))} warehouse={{ ...warehouse, managerName: managerName(warehouse.managerId) }} warehouseManagerRoleId={warehouseManagerRoleId} allowInlineManagerCreate={false} onSaved={() => refresh()} />
  if (page === "warehouse-details" && warehouseId) {
    const assignments = allWarehouseAssignments.data?.items ?? []
    if (allWarehouseAssignments.isPending || warehouseHistory.isPending) return <p role="status">{t("common.loading")}</p>
    if (allWarehouseAssignments.isError || warehouseHistory.isError) return <Surface role="alert" variant="panel" className="p-5"><p>{t("shell.loadWorkspaceError")}</p></Surface>
    const teamRows = assignments.map(item => { const person = people.find(row => row.id === item.employeeId); return { id: item.id, typeLabel: t("detailPages.warehouse.teamRole"), title: person ? `${person.firstName} ${person.lastName}` : item.employeeId, detail: item.notes, periodLabel: `${item.startDate} – ${item.endDate ?? "—"}`, statusLabel: item.status } })
    const managementHistoryRows = (warehouseHistory.data?.items ?? []).map(item => ({ id: item.id, typeLabel: t("detailPages.warehouse.manager"), title: people.find(person => person.id === item.managerId) ? managerName(item.managerId) : item.managerId, detail: item.notes, periodLabel: `${item.startDate} – ${item.endDate ?? "—"}`, statusLabel: item.status }))
    if (!warehouse) return <p role="alert">{t("detailPages.shared.missingRecordDescription")}</p>
    return <WarehouseDetailsPage activeTab={detailTab ?? "overview"} warehouse={{ ...warehouse, managerName: managerName(warehouse.managerId), activeWorkers: new Set(assignments.filter(item => item.status === "ACTIVE").map(item => item.employeeId)).size }} teamRows={teamRows} managementHistoryRows={managementHistoryRows} capabilityMode onTabChange={tab => onWarehouseTab(warehouse.id, tab)} />
  }
  return <p role="alert">{t("application.unavailable")}</p>
}
