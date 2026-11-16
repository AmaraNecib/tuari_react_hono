import { useMemo, useState, type FormEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { ApplicationCapabilities, ApplicationClient, ExactWorkforceEarningsClient } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Surface } from "@/features/shared/page-primitives"
import { EmployeeTable } from "@/features/employees/employee-table"
import { EmployeeBatchCreatePage } from "@/features/employees/employee-batch-create-page"
import { EmployeeDetailsPage } from "@/features/employees/employee-details-page"
import { EmployeeEditPage } from "@/features/employees/employee-edit-page"
import type { ExactEmployeeBatchProps } from "@/features/employees/exact-employee-pages"
import { ExactSalaryEarningsSection } from "@/features/employees/exact-salary-earnings-section"
import { WorkspaceLink, workspaceRoutes } from "@/router/navigation"
import type { DemoSession } from "./workspace-mutations"
import type { HomeViewCopy } from "./home-view-copy"
import type { HomeViewPage } from "./home-view-types"
import { SettingsSection } from "./settings-section"

const idKey = (workspaceId: string, userId: string, resource: string) => ["application", workspaceId, userId, resource] as const

export function WorkspaceShell({ client, capabilities, copy, employeeId, page, session, theme, resetWorkspacePending, updateAccountPending, onResetWorkspace, onSaveAccount, onThemeToggle, onUpdateApplied, onPendingCommandChange }: {
  client: ApplicationClient
  capabilities: ApplicationCapabilities
  copy: HomeViewCopy
  employeeId?: string
  page: HomeViewPage
  session: NonNullable<DemoSession>
  theme: "light" | "dark"
  resetWorkspacePending: boolean
  updateAccountPending: boolean
  onResetWorkspace: () => void
  onSaveAccount: (payload: { currentPassword?: string; name?: string; newPassword?: string; phone?: string }) => Promise<void>
  onThemeToggle: () => void
  onUpdateApplied: () => void
  onPendingCommandChange: (pending: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userId = session.id
  const workspaceId = capabilities.workspaceId
  const workforceClient = useMemo<ExactWorkforceEarningsClient>(() => ({
    approveMonthlyEarnings: input => client.workforceExact.approveMonthlyEarnings(input),
    listEmployeeEarnings: input => client.workforceExact.listEmployeeEarnings(input),
    getProjectSalaryCost: input => client.workforceExact.getProjectSalaryCost(input),
  }), [client])
  const needsWorkspaceReferences = page === "employees" || page === "employees-create" || page === "employee-details" || page === "employee-edit" || page === "salaries" || page === "projects" || page === "project-create" || page === "warehouses" || page === "warehouse-create"
  const employees = useQuery({ queryKey: idKey(workspaceId, userId, "employees"), queryFn: () => client.employeesList(), enabled: needsWorkspaceReferences })
  const roles = useQuery({ queryKey: idKey(workspaceId, userId, "roles"), queryFn: () => client.rolesList(), enabled: needsWorkspaceReferences })
  const projects = useQuery({ queryKey: idKey(workspaceId, userId, "projects"), queryFn: () => client.projectsList(), enabled: needsWorkspaceReferences })
  const warehouses = useQuery({ queryKey: idKey(workspaceId, userId, "warehouses"), queryFn: () => client.warehousesList(), enabled: needsWorkspaceReferences })
  const people = employees.data?.items ?? []
  const roleRows = roles.data?.items ?? []
  const projectRows = projects.data?.items ?? []
  const warehouseRows = warehouses.data?.items ?? []
  const managerRows = people.filter(person => person.status === "ACTIVE" && roleRows.find(role => role.id === person.roleId)?.key === "project_manager")
  const managerOptions = managerRows.map(manager => ({ id: manager.id, label: `${manager.firstName} ${manager.lastName}`, projectOptions: projectRows.filter(project => project.managerId === manager.id && project.status === "ACTIVE").map(project => ({ id: project.id, label: project.name })) }))
  const projectOptions = projectRows.filter(project => project.status === "ACTIVE").map(project => ({ id: project.id, label: project.name }))
  const warehouseOptions = warehouseRows.filter(warehouse => warehouse.status === "ACTIVE").map(warehouse => ({ id: warehouse.id, label: warehouse.name }))
  const baseContext = {
    client,
    roles: roleRows,
    managerOptions,
    projectOptions,
    warehouseOptions,
    managedProjectOptions: projectRows.filter(project => project.managerId === employeeId || (!project.managerId && project.status === "ACTIVE")).map(project => ({ id: project.id, label: project.name })),
    managedWarehouseOptions: warehouseRows.filter(warehouse => warehouse.managerId === employeeId || (!warehouse.managerId && warehouse.status === "ACTIVE")).map(warehouse => ({ id: warehouse.id, label: warehouse.name })),
  }
  const employeeKey = idKey(workspaceId, userId, `employee:${employeeId ?? "none"}`)
  const projectAssignments = useQuery({ queryKey: [...employeeKey, "project-assignments"], queryFn: () => client.projectAssignmentsList({ employeeId, status: "ACTIVE" }), enabled: Boolean(employeeId) })
  const warehouseAssignments = useQuery({ queryKey: [...employeeKey, "warehouse-assignments"], queryFn: () => client.warehouseAssignmentsList({ employeeId, status: "ACTIVE" }), enabled: Boolean(employeeId) })
  const managerAssignments = useQuery({ queryKey: [...employeeKey, "manager-assignments"], queryFn: () => client.managerAssignmentsList({ workerId: employeeId, status: "ACTIVE" }), enabled: Boolean(employeeId) })
  const currentProject = projectAssignments.data?.items[0]
  const currentWarehouse = warehouseAssignments.data?.items[0]
  const currentManagerId = managerAssignments.data?.items[0]?.managerId ?? (currentProject ? projectRows.find(project => project.id === currentProject.projectId)?.managerId ?? undefined : undefined)
  const currentPlacement = currentProject
    ? { nextType: "PROJECT" as const, managerId: currentManagerId ?? undefined, projectId: currentProject.projectId }
    : currentWarehouse ? { nextType: "WAREHOUSE" as const, warehouseId: currentWarehouse.warehouseId } : { nextType: "NONE" as const }
  const currentManager = currentManagerId ? people.find(person => person.id === currentManagerId) : undefined
  const currentManagerOption = currentManager && roleRows.find(role => role.id === currentManager.roleId)?.key === "project_manager"
    ? [{ id: currentManager.id, label: `${currentManager.firstName} ${currentManager.lastName}`, projectOptions: projectRows.filter(project => project.managerId === currentManager.id && (project.status === "ACTIVE" || project.id === currentProject?.projectId)).map(project => ({ id: project.id, label: project.name })) }]
    : []
  const scopedContext = {
    ...baseContext,
    managerOptions: [...managerOptions.filter(manager => manager.id !== currentManager?.id), ...currentManagerOption],
    projectOptions: projectOptions.some(project => project.id === currentProject?.projectId) || !currentProject
      ? projectOptions
      : [...projectOptions, { id: currentProject.projectId, label: projectRows.find(project => project.id === currentProject.projectId)?.name ?? currentProject.projectId }],
    warehouseOptions: warehouseOptions.some(warehouse => warehouse.id === currentWarehouse?.warehouseId) || !currentWarehouse
      ? warehouseOptions
      : [...warehouseOptions, { id: currentWarehouse.warehouseId, label: warehouseRows.find(warehouse => warehouse.id === currentWarehouse.warehouseId)?.name ?? currentWarehouse.warehouseId }],
    currentPlacement,
    currentManagedProjectIds: projectRows.filter(project => project.managerId === employeeId).map(project => project.id),
    currentManagedWarehouseIds: warehouseRows.filter(warehouse => warehouse.managerId === employeeId).map(warehouse => warehouse.id),
  }
  const onDone = () => {
    void queryClient.invalidateQueries({ queryKey: idKey(workspaceId, userId, "employees") })
    void queryClient.invalidateQueries({ queryKey: idKey(workspaceId, userId, "projects") })
    void queryClient.invalidateQueries({ queryKey: idKey(workspaceId, userId, "warehouses") })
    window.location.href = "/employees"
  }
  if (needsWorkspaceReferences && [employees, roles, projects, warehouses].some(query => query.isPending)) return <p role="status">{t("common.loading")}</p>
  const failed = needsWorkspaceReferences ? [employees, roles, projects, warehouses].find(query => query.isError) : undefined
  if (failed) return <Surface role="alert" variant="panel" className="p-5"><p>{t("shell.loadWorkspaceError")}</p><Button onClick={() => { void Promise.all([employees.refetch(), roles.refetch(), projects.refetch(), warehouses.refetch()]) }}>{t("common.retry")}</Button></Surface>

  if (page === "employees-create") return <EmployeeCreateSection context={baseContext} onCancel={() => { window.location.href = "/employees" }} onDone={() => { void queryClient.invalidateQueries({ queryKey: idKey(workspaceId, userId, "employees") }); window.location.href = "/employees" }} />
  if (page === "employees") return <section className="space-y-4"><h1 className="text-xl font-semibold">{t("sections.employees.label")}</h1><EmployeeTable mode="exact" {...baseContext} onView={id => { window.location.href = `/employees/${encodeURIComponent(id)}` }} onEdit={id => { window.location.href = `/employees/${encodeURIComponent(id)}/edit` }} onAdd={() => { window.location.href = "/employees/create" }} /></section>
  if (page === "employee-details" && employeeId) return <EmployeeDetailsPage mode="exact" {...scopedContext} employeeId={employeeId} onDone={onDone} onCancel={onDone} />
  if (page === "employee-edit" && employeeId) {
    if (projectAssignments.isPending || warehouseAssignments.isPending || managerAssignments.isPending) return <p role="status">{t("common.loading")}</p>
    if (projectAssignments.isError || warehouseAssignments.isError || managerAssignments.isError) return <Surface role="alert" variant="panel" className="p-5">{t("shell.loadWorkspaceError")}</Surface>
    return <EmployeeEditPage mode="exact" {...scopedContext} employeeId={employeeId} onDone={onDone} onCancel={onDone} />
  }
  if (page === "salaries") return <ExactSalaryEarningsSection employees={people} projects={projectRows.map(project => ({ id: project.id, name: project.name }))} workforceClient={workforceClient} workspaceId={workspaceId} userId={userId} onPendingCommandChange={onPendingCommandChange} />
  if (page === "projects" || page === "project-create") return <ProjectReferencePage projects={projectRows} managers={managerRows.map(manager => ({ id: manager.id, label: `${manager.firstName} ${manager.lastName}` }))} client={client} onSaved={() => void queryClient.invalidateQueries({ queryKey: idKey(workspaceId, userId, "projects") })} />
  if (page === "warehouses" || page === "warehouse-create") return <WarehouseReferencePage warehouses={warehouseRows} managers={people.filter(person => person.status === "ACTIVE" && roleRows.find(role => role.id === person.roleId)?.key === "warehouse_manager").map(manager => ({ id: manager.id, label: `${manager.firstName} ${manager.lastName}` }))} client={client} onSaved={() => void queryClient.invalidateQueries({ queryKey: idKey(workspaceId, userId, "warehouses") })} />
  if (page === "dashboard") return <section className="space-y-5"><h1 className="text-2xl font-semibold">{t("shell.dashboard")}</h1><p>{t("salaryEarnings.title")}</p><nav className="flex flex-wrap gap-4"><WorkspaceLink target={workspaceRoutes.employees()}>{t("sections.employees.label")}</WorkspaceLink><WorkspaceLink target={workspaceRoutes.salaries()}>{t("sections.salaries.label")}</WorkspaceLink><WorkspaceLink target={workspaceRoutes.projects()}>{t("sections.projects.label")}</WorkspaceLink><WorkspaceLink target={workspaceRoutes.warehouses()}>{t("sections.warehouses.label")}</WorkspaceLink></nav><p className="text-sm">{t("application.unavailable")}</p></section>
  if (page === "settings") return <SettingsSection
    accountCurrentPasswordLabel={copy.shell.settingsAccountCurrentPassword}
    accountCurrentPasswordPlaceholder={copy.shell.settingsAccountCurrentPasswordPlaceholder}
    accountDescription={copy.shell.settingsAccountDescription}
    accountNameLabel={copy.shell.settingsAccountName}
    accountNamePlaceholder={copy.shell.settingsAccountNamePlaceholder}
    accountNewPasswordLabel={copy.shell.settingsAccountNewPassword}
    accountNewPasswordPlaceholder={copy.shell.settingsAccountNewPasswordPlaceholder}
    accountPhoneLabel={copy.shell.settingsAccountPhone}
    accountPhoneHint={copy.shell.settingsAccountPhoneHint}
    accountPhonePlaceholder={copy.shell.settingsAccountPhonePlaceholder}
    accountSaveLabel={copy.shell.settingsAccountSave}
    accountSavingLabel={copy.shell.settingsAccountSaving}
    accountTitle={copy.shell.settingsAccountTitle}
    currentName={session.name ?? ""}
    currentPhone={session.phone}
    isResetPending={resetWorkspacePending}
    isSavingAccount={updateAccountPending}
    resetDescription={copy.shell.settingsResetDescription}
    resetLabel={copy.shell.resetWorkspace}
    themeDescription={copy.shell.settingsThemeDescription}
    themeLabel={copy.shell.themeToggle}
    themeValueLabel={theme === "light" ? copy.shell.themeDark : copy.shell.themeLight}
    title={copy.sections.settings.label}
    passwordHideLabel={copy.common.hidePassword}
    passwordShowLabel={copy.common.showPassword}
    settingsCheckForUpdates={copy.shell.settingsCheckForUpdates}
    settingsChecking={copy.shell.settingsChecking}
    settingsUpToDate={copy.shell.settingsUpToDate}
    settingsUpdateAvailable={copy.shell.settingsUpdateAvailable}
    settingsUpdateError={copy.shell.settingsUpdateError}
    settingsApplyError={copy.shell.settingsApplyError}
    settingsLastChecked={copy.shell.settingsLastChecked}
    settingsUpdateCached={copy.shell.settingsUpdateCached}
    settingsAboutTitle={copy.shell.settingsAboutTitle}
    settingsAboutVersion={copy.shell.settingsAboutVersion}
    settingsAboutInstallFromFile={copy.shell.settingsAboutInstallFromFile}
    settingsAboutInstallFromFileDescription={copy.shell.settingsAboutInstallFromFileDescription}
    settingsUpdateVerifying={copy.shell.settingsUpdateVerifying}
    settingsUpdateSuccess={copy.shell.settingsUpdateSuccess}
    settingsAboutTab={copy.shell.settingsAboutTab}
    onSaveAccount={onSaveAccount}
    onReset={onResetWorkspace}
    onToggleTheme={onThemeToggle}
    onUpdateApplied={onUpdateApplied}
  />
  return <section className="space-y-3" role="status"><p>{t("application.unavailable")}</p><nav className="flex flex-wrap gap-4"><WorkspaceLink target={workspaceRoutes.employees()}>{t("sections.employees.label")}</WorkspaceLink><WorkspaceLink target={workspaceRoutes.salaries()}>{t("sections.salaries.label")}</WorkspaceLink></nav></section>
}

function EmployeeCreateSection({ context, onCancel, onDone }: { context: Omit<ExactEmployeeBatchProps, "onDone" | "onCancel">; onCancel: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [batch, setBatch] = useState(false)
  return <section className="space-y-4"><nav className="flex gap-3" aria-label={t("employeeForm.pageTitle")}><Button type="button" variant={batch ? "outline" : "default"} onClick={() => setBatch(false)}>{t("employeeForm.submitSingle")}</Button><Button type="button" variant={batch ? "default" : "outline"} onClick={() => setBatch(true)}>{t("employeeForm.submitBatch")}</Button></nav><EmployeeBatchCreatePage mode="exact" operation={batch ? "batch" : "create"} {...context} onDone={onDone} onCancel={onCancel} /></section>
}

function ProjectReferencePage({ projects, managers, client, onSaved }: { projects: Array<{ id: string; name: string; managerId: string | null; status: string }>; managers: Array<{ id: string; label: string }>; client: ApplicationClient; onSaved: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [managerId, setManagerId] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  async function submit(event: FormEvent) { event.preventDefault(); setFailure(null); try { const result = await client.projectsCreate({ name, ...(managerId ? { managerId } : {}) }); if (!result.success) throw new Error(result.error.message); setName(""); onSaved() } catch (error) { setFailure(error instanceof Error ? error.message : t("shell.loadWorkspaceError")) } }
  return <section className="space-y-4"><h1 className="text-xl font-semibold">{t("sections.projects.label")}</h1><form className="flex flex-wrap items-end gap-3" onSubmit={event => void submit(event)}><label className="grid gap-1">{t("detailPages.project.name")}<Input required value={name} onChange={event => setName(event.target.value)} /></label><label className="grid gap-1">{t("employeeForm.managerLabel")}<select className="min-h-11 rounded-md border px-3" value={managerId} onChange={event => setManagerId(event.target.value)}><option value="">{t("common.none")}</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.label}</option>)}</select></label><Button type="submit">{t("common.create")}</Button>{failure && <p role="alert">{failure}</p>}</form><ul>{projects.map(project => <li key={project.id} className="border-b py-2">{project.name}</li>)}</ul></section>
}

function WarehouseReferencePage({ warehouses, managers, client, onSaved }: { warehouses: Array<{ id: string; name: string }>; managers: Array<{ id: string; label: string }>; client: ApplicationClient; onSaved: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [managerId, setManagerId] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  async function submit(event: FormEvent) { event.preventDefault(); setFailure(null); try { const result = await client.warehousesCreate({ name, ...(managerId ? { managerId } : {}) }); if (!result.success) throw new Error(result.error.message); setName(""); onSaved() } catch (error) { setFailure(error instanceof Error ? error.message : t("shell.loadWorkspaceError")) } }
  return <section className="space-y-4"><h1 className="text-xl font-semibold">{t("sections.warehouses.label")}</h1><form className="flex flex-wrap items-end gap-3" onSubmit={event => void submit(event)}><label className="grid gap-1">{t("detailPages.warehouse.name")}<Input required value={name} onChange={event => setName(event.target.value)} /></label><label className="grid gap-1">{t("detailPages.warehouse.manager")}<select className="min-h-11 rounded-md border px-3" value={managerId} onChange={event => setManagerId(event.target.value)}><option value="">{t("common.none")}</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.label}</option>)}</select></label><Button type="submit">{t("common.create")}</Button>{failure && <p role="alert">{failure}</p>}</form><ul>{warehouses.map(warehouse => <li key={warehouse.id} className="border-b py-2">{warehouse.name}</li>)}</ul></section>
}
