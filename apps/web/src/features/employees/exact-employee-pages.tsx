import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { i18n } from "@/i18n"
import type { EmployeeManagerAssignment, EmployeeProjectAssignment, EmployeeWarehouseAssignment, ExactEmployee, ExactEmployeeClient, ExactEmployeeSaveInput, ExactEmployeeStateHistory, ExactSalaryReference, Project, Role, Warehouse } from "@tuari/contracts"
import { SalaryReference } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { EmployeeEditForm } from "./employee-edit-form"
import type { EmployeeEditFormProps } from "./employee-edit-form"
import type { FormState } from "./employee-edit-form"
import { AppDate } from "@/components/app-date"
import { ExactSalaryReferenceValue } from "./exact-salary-reference-value"
import { AdvancedSearchBar } from "@/features/shared/advanced-search-bar"
import { RecordDeleteConfirmation } from "@/features/shared/record-delete-confirmation"
import { RecordInfoCard, RecordInfoGrid, RecordPageFrame } from "@/features/shared/record-page-frame"
import { EmployeeDetailsView } from "./employee-details-view"
import { WorkspaceLink, workspaceRoutes } from "@/router/navigation"
import { EmployeeTable, type EmployeeTableRow } from "./employee-table"
import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"

type Choice = { id: string; label: string }
export type ExactEmployeeAssignmentReferences = {
  people: ExactEmployee[]
  projects: Array<Pick<Project, "id" | "name" | "managerId" | "status">>
  warehouses: Array<Pick<Warehouse, "id" | "name" | "managerId" | "status">>
  managerAssignments: EmployeeManagerAssignment[]
  projectAssignments: EmployeeProjectAssignment[]
  warehouseAssignments: EmployeeWarehouseAssignment[]
}
export type ExactEmployeeUiContext = {
  client: ExactEmployeeClient
  roles: Role[]
  managerOptions: Array<Choice & { projectOptions: Choice[] }>
  projectOptions: Choice[]
  warehouseOptions: Choice[]
  managedProjectOptions: Choice[]
  managedWarehouseOptions: Choice[]
  currentManagedProjectIds?: string[]
  currentManagedWarehouseIds?: string[]
  currentPlacement?: { nextType: "NONE" | "PROJECT" | "WAREHOUSE"; managerId?: string; projectId?: string; warehouseId?: string }
}
export type ExactEmployeePageProps = ExactEmployeeUiContext & { employeeId: string; onDone: () => void; onCancel: () => void; onBackToEmployees?: () => void; workHistory?: Array<{ id: string; title: string; detail?: string | null; typeLabel: string; periodLabel: ReactNode; statusLabel: string; sortValue?: string }> }
export type ExactEmployeeBatchProps = ExactEmployeeUiContext & { onDone: () => void; onCancel: () => void }

function serverError(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed"
}
function requireSuccess<T>(result: { success: boolean; item?: T; error?: { message: string } }): T {
  if (!result.success || result.item === undefined) throw new Error(result.error?.message ?? "Request failed")
  return result.item
}
export function salaryReference(period: string, amount: string): ExactSalaryReference | null {
  if (!amount.trim() && !period) return null
  if (!amount.trim() || !period) throw new Error(i18n.t("employeeForm.exactPeriodRequired"))
  const value = period === "DAILY" ? parseLocalizedUnitPriceInput(amount).toWire() : parseLocalizedMoneyInput(amount).toWire()
  return SalaryReference.parse(period as "DAILY" | "WEEKLY" | "MONTHLY", value).toWire()
}
function FormFields({ roles, initial, onSubmit, busy, serverFailure, managers, projects, warehouses, managedProjects, managedWarehouses, currentManagedProjectIds, currentManagedWarehouseIds, currentPlacement, onCancel, onBackToEmployees }: {
  onCancel?: () => void; onBackToEmployees?: () => void
  roles: Role[]; initial: ExactEmployee; onSubmit: (value: Record<string, unknown>) => Promise<void>; busy?: boolean; serverFailure: string | null
  managers: ExactEmployeeUiContext["managerOptions"]; projects: Choice[]; warehouses: Choice[]; managedProjects: Choice[]; managedWarehouses: Choice[]
  currentManagedProjectIds?: string[]; currentManagedWarehouseIds?: string[]; currentPlacement?: ExactEmployeeUiContext["currentPlacement"]
}) {
  const { t } = useTranslation()
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [phone, setPhone] = useState(initial.phone)
  const [roleId, setRoleId] = useState(initial.roleId)
  const [status, setStatus] = useState<ExactEmployee["status"]>(initial.status)
  const [period, setPeriod] = useState(initial.salaryReference?.period ?? "")
  const [amount, setAmount] = useState(initial.salaryReference?.amount ?? "")
  const [occupation, setOccupation] = useState(initial.occupation ?? "")
  const [notes, setNotes] = useState(initial.notes ?? "")
  const [managerId, setManagerId] = useState(currentPlacement?.managerId ?? "")
  const [projectId, setProjectId] = useState(currentPlacement?.projectId ?? "")
  const [warehouseId, setWarehouseId] = useState(currentPlacement?.warehouseId ?? "")
  const [workplaceType, setWorkplaceType] = useState<"NONE" | "PROJECT" | "WAREHOUSE">(currentPlacement?.nextType ?? "NONE")
  const [managedProjectIds, setManagedProjectIds] = useState<string[]>(currentManagedProjectIds ?? [])
  const [managedWarehouseIds, setManagedWarehouseIds] = useState<string[]>(currentManagedWarehouseIds ?? [])
  const [failure, setFailure] = useState<string | null>(null)
  const submitting = useRef(false)
  const selectedManager = managers.find(manager => manager.id === managerId)
  const selectedRole = roles.find(role => role.id === roleId)
  const worker = selectedRole?.key === "worker"
  const managerRole = selectedRole?.key === "project_manager"
  const warehouseManagerRole = selectedRole?.key === "warehouse_manager"
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || busy) return
    submitting.current = true
    setFailure(null)
    try {
      const reference = salaryReference(period, amount)
      if (!firstName.trim() || !lastName.trim() || !/^0[5-7]\d{8}$/.test(phone.trim()) || !roleId || occupation.trim().length > 120) throw new Error(i18n.t("employeeForm.exactProfileInvalid"))
      if (worker && status === "ACTIVE" && workplaceType === "PROJECT" && (!managerId || !projectId)) throw new Error(i18n.t("employeeForm.exactManagerRequired"))
      if (worker && status === "ACTIVE" && workplaceType === "WAREHOUSE" && !warehouseId) throw new Error(i18n.t("employeeForm.exactWarehouseRequired"))
      const profile = { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), roleId, status, occupation: occupation.trim() || null, notes: notes.trim() || null, salaryReference: reference }
      await onSubmit({ ...profile,
        ...(worker && status === "ACTIVE" && (workplaceType !== (currentPlacement?.nextType ?? "NONE") || workplaceType === "PROJECT" && (managerId !== (currentPlacement?.managerId ?? "") || projectId !== (currentPlacement?.projectId ?? "")) || workplaceType === "WAREHOUSE" && warehouseId !== (currentPlacement?.warehouseId ?? "")) ? { placement: workplaceType === "NONE" ? { nextType: "NONE" } : workplaceType === "PROJECT" ? { nextType: "PROJECT", managerId: managerId || null, projectId: projectId || null } : { nextType: "WAREHOUSE", warehouseId: warehouseId || null } } : {}),
        ...(managerRole && status === "ACTIVE" && managedProjectIds.join("|") !== (currentManagedProjectIds ?? []).join("|") ? { managedProjectIds } : {}),
        ...(warehouseManagerRole && status === "ACTIVE" && managedWarehouseIds.join("|") !== (currentManagedWarehouseIds ?? []).join("|") ? { managedWarehouseIds } : {}),
      })
    } catch (error) { setFailure(serverError(error)) }
    finally { submitting.current = false }
  }
  const state: FormState = { firstName, lastName, phone, roleId, status, salaryPeriod: period as FormState["salaryPeriod"], salaryAmountDzd: amount, occupation, notes }
    const update: EmployeeEditFormProps["setState"] = action => {
      const next = typeof action === "function" ? action(state) : action
      setFirstName(next.firstName); setLastName(next.lastName); setPhone(next.phone)
      setRoleId(next.roleId); setStatus(next.status); setPeriod(next.salaryPeriod)
      setAmount(next.salaryAmountDzd); setOccupation(next.occupation); setNotes(next.notes)
    }
    return <EmployeeEditForm
      employee={{ id: initial.id, name: `${initial.firstName} ${initial.lastName}` }}
      state={state} setState={update} errors={{}} saveError={failure ?? serverFailure}
      isSaving={Boolean(busy)} onSubmit={submit}
      onBackToRecord={onCancel ?? (() => {})} onBackToEmployees={onBackToEmployees ?? onCancel ?? (() => {})}
      roles={roles.filter(role => role.isSystem)} currentRoleKey={roles.find(role => role.id === initial.roleId)?.key ?? ""} updateRole={setRoleId}
      selectableRole={key => ["admin", "worker", "project_manager", "warehouse_manager"].includes(key)} allowWorkerRoleChange
      isWorker={worker && status === "ACTIVE"} isProjectManager={managerRole && status === "ACTIVE"} isWarehouseManager={warehouseManagerRole && status === "ACTIVE"}
      statusOptions={[{ value: "ACTIVE", label: t("status.active") }, { value: "INACTIVE", label: t("status.inactive") }, { value: "LEFT", label: t("status.left") }]}
      salaryPeriodOptions={[{ value: "DAILY", label: t("detailPages.salary.daily") }, { value: "WEEKLY", label: t("detailPages.salary.weekly") }, { value: "MONTHLY", label: t("detailPages.salary.monthly") }]}
      workplaceType={workplaceType} setWorkplaceType={setWorkplaceType}
      workerManagerId={managerId} setWorkerManagerId={setManagerId}
      workerProjectId={projectId} setWorkerProjectId={setProjectId}
      workerWarehouseId={warehouseId} setWorkerWarehouseId={setWarehouseId}
      setPlacementDirty={() => {}} managerOptions={managers} workerProjectOptions={selectedManager?.projectOptions ?? projects}
      warehouseOptions={warehouses}
      managedProjectOptions={managedProjects.map(row => ({ ...row, secondary: null }))}
      managedWarehouseOptions={managedWarehouses.map(row => ({ ...row, secondary: null }))}
      selectedManagedProjectIds={managedProjectIds} setSelectedManagedProjectIds={setManagedProjectIds}
      selectedManagedWarehouseIds={managedWarehouseIds} setSelectedManagedWarehouseIds={setManagedWarehouseIds}
      setManagedProjectsDirty={() => {}} setManagedWarehousesDirty={() => {}}
    />
}

export function ExactEmployeeEditPage(props: ExactEmployeePageProps) {
  const { client, employeeId, onDone } = props
  const { t } = useTranslation()
  const [employee, setEmployee] = useState<ExactEmployee | null>(null)
  const [loading, setLoading] = useState(true)
  const [readFailure, setReadFailure] = useState<string | null>(null)
  const [saveFailure, setSaveFailure] = useState<string | null>(null)
  const [completionFailure, setCompletionFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const mutationLocked = useRef(false)
  const [saved, setSaved] = useState(false)
  const load = useCallback(() => {
    setLoading(true); setReadFailure(null)
    void client.employeesGet({ id: employeeId }).then(result => { setEmployee(requireSuccess(result)) }).catch(error => { setReadFailure(serverError(error)) }).finally(() => setLoading(false))
  }, [client, employeeId])
  useEffect(() => { load() }, [load])
  if (loading) return <p role="status">{t("common.loading")}</p>
  if (readFailure) return <section><p role="alert">{readFailure}</p><Button onClick={load}>{t("common.retry")}</Button></section>
  if (!employee) return <p>{t("common.none")}</p>
  return <FormFields roles={props.roles} managers={props.managerOptions} projects={props.projectOptions} warehouses={props.warehouseOptions} managedProjects={props.managedProjectOptions} managedWarehouses={props.managedWarehouseOptions} currentManagedProjectIds={props.currentManagedProjectIds} currentManagedWarehouseIds={props.currentManagedWarehouseIds} currentPlacement={props.currentPlacement} initial={employee} onCancel={props.onCancel} onBackToEmployees={props.onBackToEmployees} busy={saving || saved} serverFailure={completionFailure ?? saveFailure} onSubmit={async data => {
      if (mutationLocked.current || saved) return
      mutationLocked.current = true
      setSaving(true); setSaveFailure(null); setCompletionFailure(null)
      let committed = false
      try { const item = requireSuccess(await client.employeesSave({ id: employee.id, ...data } as ExactEmployeeSaveInput)); setEmployee(item); setSaved(true); committed = true }
      catch (error) { mutationLocked.current = false; setSaveFailure(serverError(error)); setSaving(false); return }
      if (committed) {
        setSaving(false)
        try { onDone() } catch (error) { setCompletionFailure(t("employeeForm.exactCompletionFailed", { error: serverError(error) })) }
      }
    }} />
}

export function ExactEmployeeDetailsPage(props: ExactEmployeePageProps) {
  const { client, employeeId } = props
  const { t } = useTranslation()
  const [employee, setEmployee] = useState<ExactEmployee | null>(null)
  const [history, setHistory] = useState<ExactEmployeeStateHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState("personal")
  const load = useCallback(async () => {
    setLoading(true); setFailure(null)
    try { const [person, records] = await Promise.all([client.employeesGet({ id: employeeId }), client.employeeStateHistoryList({ employeeId })]); setEmployee(requireSuccess(person)); setHistory(records.items) }
    catch (error) { setFailure(serverError(error)) } finally { setLoading(false) }
  }, [client, employeeId])
  useEffect(() => { void load() }, [load])
  if (loading) return <p role="status">{t("common.loading")}</p>
  if (failure || !employee) return <section><p role="alert">{failure ?? t("common.none")}</p><Button onClick={() => void load()}>{t("common.retry")}</Button></section>
  const role = props.roles.find(value => value.id === employee.roleId)
  const worker = role?.key === "worker"
  const managedProjects = (props.currentManagedProjectIds ?? []).map(id => props.managedProjectOptions.find(option => option.id === id)?.label ?? id)
  const managedWarehouses = (props.currentManagedWarehouseIds ?? []).map(id => props.managedWarehouseOptions.find(option => option.id === id)?.label ?? id)
  const historyRows = [...(props.workHistory ?? []), ...history.map(entry => ({
    id: entry.id,
    typeLabel: entry.eventType === "CREATED" ? t("common.create") : entry.eventType === "UPDATED" ? t("common.edit") : entry.eventType,
    title: props.roles.find(value => value.id === entry.roleId)?.name ?? entry.roleId,
    detail: entry.notes,
    detailContent: <ExactSalaryReferenceValue reference={entry.salaryReference} />,
    periodLabel: <AppDate value={entry.startDate} includeTime />,
    statusLabel: entry.status === "ACTIVE" ? t("status.active") : entry.status === "LEFT" ? t("status.left") : t("status.inactive"),
    sortValue: entry.startDate,
  }))].sort((left, right) => (right.sortValue ?? "").localeCompare(left.sortValue ?? "")).map(row => {
    const { sortValue, ...historyRow } = row
    void sortValue
    return historyRow
  })
  const managerId = props.currentPlacement?.managerId
  const currentManager = props.managerOptions.find(option => option.id === managerId)
  const currentProject = props.projectOptions.find(option => option.id === props.currentPlacement?.projectId)
  const currentWarehouse = props.warehouseOptions.find(option => option.id === props.currentPlacement?.warehouseId)
  const employeeName = `${employee.firstName} ${employee.lastName}`
  const display = {
    id: employee.id,
    name: employeeName,
    role: role?.name ?? employee.roleId,
    occupation: employee.occupation,
    phone: employee.phone,
    status: employee.status === "ACTIVE" ? t("status.active") : employee.status === "LEFT" ? t("status.left") : t("status.inactive"),
    notes: employee.notes,
    managerName: currentManager?.label ?? managerId ?? t("detailPages.employee.noCurrentManager"),
    currentWorkplace: currentProject?.label ?? currentWarehouse?.label ?? props.currentPlacement?.projectId ?? props.currentPlacement?.warehouseId ?? t("detailPages.employee.noCurrentWorkplace"),
    isWorker: worker,
    isProjectManager: role?.key === "project_manager",
    isWarehouseManager: role?.key === "warehouse_manager",
    managedProjectsCount: managedProjects.length ? `${managedProjects.length} ${t("detailPages.employee.projectUnit")}` : t("detailPages.employee.noManagedProjects"),
    managedProjectsNames: managedProjects.length ? managedProjects.join("، ") : t("detailPages.employee.noManagedProjectNames"),
    managedWarehousesCount: managedWarehouses.length ? `${managedWarehouses.length} ${t("detailPages.employee.warehouseUnit")}` : t("detailPages.employee.noManagedWarehouses"),
    managedWarehousesNames: managedWarehouses.length ? managedWarehouses.join("، ") : t("detailPages.employee.noManagedWarehouseNames"),
    notesWide: (employee.notes?.trim().length ?? 0) > 90,
  }
  const action = <><RecordDeleteConfirmation pendingLabel={confirmDelete ? employeeName : null} pending={deleting} title={t("shell.destructiveTitle")} description={t("shell.destructiveDescription")} cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")} onDismiss={() => setConfirmDelete(false)} onConfirm={async () => { setConfirmDelete(false); setDeleting(true); setDeleteError(null); try { const result = await client.employeesDelete({ id: employee.id }); if (!result.success) throw new Error(result.error.message); props.onDone() } catch (error) { setDeleteError(serverError(error)) } finally { setDeleting(false) } }} /><Button variant="destructive" disabled={deleting} onClick={() => setConfirmDelete(true)}>{t("common.delete")}</Button></>
  return <EmployeeDetailsView
    employee={display}
    activeTab={activeTab}
    onTabChange={setActiveTab}
    workHistory={historyRows}
    canAssignWorkplace={worker && employee.status === "ACTIVE"}
    beforeTabs={deleteError ? <p role="alert">{deleteError}</p> : null}
    action={action}
    financeContent={<div className="space-y-5">
      <RecordInfoGrid><RecordInfoCard label={t("detailPages.employee.financeCurrentSalary")} value={<ExactSalaryReferenceValue reference={employee.salaryReference} />} /><RecordInfoCard label={t("detailPages.employee.financeSalaryPeriod")} value={employee.salaryReference ? t(({ DAILY: "detailPages.salary.daily", WEEKLY: "detailPages.salary.weekly", MONTHLY: "detailPages.salary.monthly" } as const)[employee.salaryReference.period]) : t("detailPages.salary.notSpecified")} /></RecordInfoGrid>
      <section className="space-y-2 rounded-xl border border-border/70 bg-sidebar p-5 dark:bg-surface"><h2 className="text-lg font-semibold">{t("salaryEarnings.title")}</h2><p className="text-sm leading-6 text-muted-foreground">{t("salaryEarnings.cashUnavailable")}</p><WorkspaceLink target={workspaceRoutes.salaries()}>{t("salaryEarnings.approvalSection")}</WorkspaceLink></section>
    </div>}
    debtsContent={<p role="status">{t("application.unavailable")}</p>}
  />
}

export function mapExactEmployeeTableRow(employee: ExactEmployee, roles: Role[], references: ExactEmployeeAssignmentReferences, copy: {
  noManager: string
  noWorkplace: string
  leaveReasonInactive: string
  leaveReasonWorkerLinked: string
  leaveReasonProjectManagerLinked: string
  leaveReasonWarehouseManagerLinked: string
  leaveReasonFallback: string
}): EmployeeTableRow {
  const role = roles.find(item => item.id === employee.roleId)
  const latest = <T extends { status: string; startDate: string }>(rows: T[]) => rows.filter(row => row.status === "ACTIVE").sort((left, right) => right.startDate.localeCompare(left.startDate))[0]
  const managerAssignment = latest(references.managerAssignments.filter(item => item.workerId === employee.id))
  const projectAssignment = latest(references.projectAssignments.filter(item => item.employeeId === employee.id))
  const warehouseAssignment = latest(references.warehouseAssignments.filter(item => item.employeeId === employee.id))
  const project = projectAssignment ? references.projects.find(item => item.id === projectAssignment.projectId) : undefined
  const warehouse = warehouseAssignment ? references.warehouses.find(item => item.id === warehouseAssignment.warehouseId) : undefined
  const managerId = managerAssignment?.managerId ?? project?.managerId ?? null
  const manager = managerId ? references.people.find(item => item.id === managerId) : undefined
  const hasActiveManagerAssignment = references.managerAssignments.some(item => item.workerId === employee.id && item.status === "ACTIVE")
  const hasActiveProjectAssignment = references.projectAssignments.some(item => item.employeeId === employee.id && item.status === "ACTIVE")
  const hasActiveWarehouseAssignment = references.warehouseAssignments.some(item => item.employeeId === employee.id && item.status === "ACTIVE")
  const projectManagerStillLinked = role?.key === "project_manager" && (
    references.projects.some(item => item.managerId === employee.id && item.status === "ACTIVE") ||
    references.managerAssignments.some(item => item.managerId === employee.id && item.status === "ACTIVE") ||
    hasActiveProjectAssignment || hasActiveWarehouseAssignment
  )
  const warehouseManagerStillLinked = role?.key === "warehouse_manager" && (
    references.warehouses.some(item => item.managerId === employee.id && item.status === "ACTIVE") ||
    hasActiveProjectAssignment || hasActiveWarehouseAssignment
  )
  const workerStillLinked = role?.key === "worker" && (hasActiveManagerAssignment || hasActiveProjectAssignment || hasActiveWarehouseAssignment)
  const canLeave = employee.status === "ACTIVE" && !workerStillLinked && !projectManagerStillLinked && !warehouseManagerStillLinked
  const leaveDisabledReason = canLeave ? null
    : employee.status !== "ACTIVE" ? copy.leaveReasonInactive
      : workerStillLinked ? copy.leaveReasonWorkerLinked
        : projectManagerStillLinked ? copy.leaveReasonProjectManagerLinked
          : warehouseManagerStillLinked ? copy.leaveReasonWarehouseManagerLinked
            : copy.leaveReasonFallback
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    name: `${employee.firstName} ${employee.lastName}`,
    roleId: employee.roleId,
    roleKey: role?.key ?? "",
    role: role?.name ?? employee.roleId,
    phone: employee.phone,
    status: employee.status,
    salaryAmountDzd: null,
    salaryPeriod: null,
    managerName: manager ? `${manager.firstName} ${manager.lastName}` : managerId ?? copy.noManager,
    managerAssignmentId: managerAssignment?.id ?? null,
    currentManagerId: managerId,
    currentProjectId: projectAssignment?.projectId ?? null,
    currentProjectAssignmentId: projectAssignment?.id ?? null,
    currentWarehouseId: warehouseAssignment?.warehouseId ?? null,
    currentWarehouseAssignmentId: warehouseAssignment?.id ?? null,
    currentWorkplace: project?.name ?? projectAssignment?.projectId ?? warehouse?.name ?? warehouseAssignment?.warehouseId ?? copy.noWorkplace,
    notes: employee.notes,
    occupation: employee.occupation,
    isWorker: role?.key === "worker",
    canDelete: true,
    canLeave,
    deleteDisabledReason: null,
    leaveDisabledReason,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  }
}

export function ExactEmployeeTable({ client, roles, assignmentReferences, onView, onEdit, onAdd, onDeleted }: ExactEmployeeUiContext & { assignmentReferences: ExactEmployeeAssignmentReferences; onView: (id: string) => void; onEdit: (id: string) => void; onAdd?: () => void; onDeleted?: () => Promise<void> | void }) {
  const { t } = useTranslation()
  const [employees, setEmployees] = useState<ExactEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ExactEmployee | null>(null)
  const [pendingLeave, setPendingLeave] = useState<ExactEmployee | null>(null)
  const [leavePending, setLeavePending] = useState(false)
  const [search, setSearch] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([])
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let live = true
    setLoading(true)
    void client.employeesListPaged({ limit: 50, search: search.trim() || undefined, cursor }).then(result => {
      if (!live) return
      setEmployees(result.items); setNextCursor(result.nextCursor); setFailure(null)
    }).catch(error => { if (live) setFailure(serverError(error)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [client, cursor, refreshKey, search])
  const rows = useMemo<EmployeeTableRow[]>(() => employees.map(employee => mapExactEmployeeTableRow(employee, roles, assignmentReferences, {
    noManager: t("shell.noManager"),
    noWorkplace: t("detailPages.employee.noCurrentWorkplace"),
    leaveReasonInactive: t("detailPages.employee.leaveReasonInactive"),
    leaveReasonWorkerLinked: t("detailPages.employee.leaveReasonWorkerLinked"),
    leaveReasonProjectManagerLinked: t("detailPages.employee.leaveReasonProjectManagerLinked"),
    leaveReasonWarehouseManagerLinked: t("detailPages.employee.leaveReasonWarehouseManagerLinked"),
    leaveReasonFallback: t("detailPages.employee.leaveReasonFallback"),
  })), [assignmentReferences, employees, roles, t])
  function changeSearch(query: string) { setSearch(query); setCursor(undefined); setCursorHistory([]) }
  function nextPage() { if (!nextCursor) return; setCursorHistory(history => [...history, cursor]); setCursor(nextCursor) }
  function previousPage() { const history = [...cursorHistory]; const previous = history.pop(); setCursorHistory(history); setCursor(previous) }
  async function remove(id: string) { setDeletingId(id); setDeleteFailure(null); try { const result = await client.employeesDelete({ id }); if (!result.success) throw new Error(result.error.message); setRefreshKey(value => value + 1); await onDeleted?.() } catch (error) { setDeleteFailure(serverError(error)) } finally { setDeletingId(null) } }
  async function confirmLeave() {
    if (!pendingLeave || leavePending) return
    setLeavePending(true)
    setDeleteFailure(null)
    try {
      const current = requireSuccess(await client.employeesGet({ id: pendingLeave.id }))
      requireSuccess(await client.employeesSave({ id: current.id, status: "LEFT" }))
      setPendingLeave(null)
      setRefreshKey(value => value + 1)
      await onDeleted?.()
    } catch (error) {
      setDeleteFailure(serverError(error))
    } finally { setLeavePending(false) }
  }
  return <RecordPageFrame title={t("sections.employees.label")} action={onAdd ? <Button onClick={onAdd}>{t("shell.addWorker")}</Button> : undefined}>
    <RecordDeleteConfirmation pendingLabel={pendingDelete ? `${pendingDelete.firstName} ${pendingDelete.lastName}` : null} pending={deletingId !== null} title={t("shell.destructiveTitle")} description={t("shell.destructiveDescription")} cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")} onDismiss={() => setPendingDelete(null)} onConfirm={() => { if (pendingDelete) { const target = pendingDelete.id; setPendingDelete(null); void remove(target) } }} />
    <AlertDialog open={pendingLeave !== null} onOpenChange={open => { if (!open && !leavePending) setPendingLeave(null) }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("shell.leaveTitle")}</AlertDialogTitle><AlertDialogDescription>{t("shell.leaveDescription")} {pendingLeave ? `${pendingLeave.firstName} ${pendingLeave.lastName}` : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={leavePending}>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction disabled={leavePending} onClick={event => { event.preventDefault(); void confirmLeave() }}>{t("common.confirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <AdvancedSearchBar onSearch={query => changeSearch(query)} storageKey="employees-search-filters" />
    {deleteFailure ? <p role="alert">{deleteFailure}</p> : null}
    {loading ? <p role="status">{t("common.loading")}</p> : failure ? <section><p role="alert">{failure}</p><Button onClick={() => setRefreshKey(value => value + 1)}>{t("common.retry")}</Button></section> : <EmployeeTable allowLegacySalaryPayments={false} copy={{ name: t("columns.name"), role: t("columns.role"), manager: t("columns.manager"), project: t("columns.project"), phone: t("columns.phone"), status: t("columns.status"), actions: t("common.actions"), empty: t("shell.empty"), addWorker: t("shell.addWorker"), view: t("common.view"), edit: t("common.edit"), leave: t("common.leave"), delete: t("common.delete") }} rows={rows} onAdd={onAdd} onDelete={row => setPendingDelete(employees.find(item => item.id === row.id) ?? null)} onEdit={row => onEdit(row.id)} onLeave={row => setPendingLeave(employees.find(item => item.id === row.id) ?? null)} onView={row => onView(row.id)} />}
    <nav aria-label={t("sections.employees.label")} className="flex justify-between gap-2 pt-4"><Button variant="outline" disabled={!cursorHistory.length || loading} onClick={previousPage}>{t("common.previous")}</Button><Button variant="outline" disabled={!nextCursor || loading} onClick={nextPage}>{t("common.next")}</Button></nav>
  </RecordPageFrame>
}
