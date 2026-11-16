import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { i18n } from "@/i18n"
import type { ExactEmployee, ExactEmployeeBatchCreateInput, ExactEmployeeClient, ExactEmployeeCreateInput, ExactEmployeeSaveInput, ExactEmployeeStateHistory, ExactSalaryReference, Role } from "@tuari/contracts"
import { SalaryReference } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { AppDate } from "@/components/app-date"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { ExactSalaryReferenceValue } from "./exact-salary-reference-value"
import { RecordHistoryTable, RecordInfoCard, RecordInfoGrid, RecordPageFrame } from "@/features/shared/record-page-frame"
import { AppShellTableFrame, AppShellTableHead, AppShellTableHeaderCell, AppShellTableRow } from "@/features/shared/table-primitives"
import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"

type Choice = { id: string; label: string }
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
export type ExactEmployeePageProps = ExactEmployeeUiContext & { employeeId: string; onDone: () => void; onCancel: () => void }
export type ExactEmployeeBatchProps = ExactEmployeeUiContext & { onDone: () => void; onCancel: () => void }

function serverError(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed"
}
function requireSuccess<T>(result: { success: boolean; item?: T; error?: { message: string } }): T {
  if (!result.success || result.item === undefined) throw new Error(result.error?.message ?? "Request failed")
  return result.item
}
function salaryReference(period: string, amount: string): ExactSalaryReference | null {
  if (!amount.trim() && !period) return null
  if (!amount.trim() || !period) throw new Error(i18n.t("employeeForm.exactPeriodRequired"))
  const value = period === "DAILY" ? parseLocalizedUnitPriceInput(amount).toWire() : parseLocalizedMoneyInput(amount).toWire()
  return SalaryReference.parse(period as "DAILY" | "WEEKLY" | "MONTHLY", value).toWire()
}
function FormFields({ roles, initial, onSubmit, busy, serverFailure, managers, projects, warehouses, managedProjects, managedWarehouses, editing = false, currentManagedProjectIds, currentManagedWarehouseIds, currentPlacement }: {
  roles: Role[]; initial?: ExactEmployee; onSubmit: (value: Record<string, unknown>) => Promise<void>; busy?: boolean; serverFailure: string | null
  managers: ExactEmployeeUiContext["managerOptions"]; projects: Choice[]; warehouses: Choice[]; managedProjects: Choice[]; managedWarehouses: Choice[]; editing?: boolean
  currentManagedProjectIds?: string[]; currentManagedWarehouseIds?: string[]; currentPlacement?: ExactEmployeeUiContext["currentPlacement"]
}) {
  const { t } = useTranslation()
  const [firstName, setFirstName] = useState(initial?.firstName ?? "")
  const [lastName, setLastName] = useState(initial?.lastName ?? "")
  const [phone, setPhone] = useState(initial?.phone ?? "")
  const [roleId, setRoleId] = useState(initial?.roleId ?? roles.find(role => role.key === "worker")?.id ?? "")
  const [status, setStatus] = useState<ExactEmployee["status"]>(initial?.status ?? "ACTIVE")
  const [period, setPeriod] = useState(initial?.salaryReference?.period ?? "")
  const [amount, setAmount] = useState(initial?.salaryReference?.amount ?? "")
  const [occupation, setOccupation] = useState(initial?.occupation ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
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
      if (!editing && worker && status === "ACTIVE" && (!managerId || !projectId)) throw new Error(i18n.t("employeeForm.exactManagerRequired"))
      const profile = { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), roleId, status, occupation: occupation.trim() || null, notes: notes.trim() || null, salaryReference: reference }
      if (!editing) {
        await onSubmit({ ...profile, ...(worker && status === "ACTIVE" ? { managerId: managerId || null, projectId: projectId || null } : {}) })
        return
      }
      await onSubmit({ ...profile,
        ...(worker && status === "ACTIVE" && (workplaceType !== (currentPlacement?.nextType ?? "NONE") || workplaceType === "PROJECT" && (managerId !== (currentPlacement?.managerId ?? "") || projectId !== (currentPlacement?.projectId ?? "")) || workplaceType === "WAREHOUSE" && warehouseId !== (currentPlacement?.warehouseId ?? "")) ? { placement: workplaceType === "NONE" ? { nextType: "NONE" } : workplaceType === "PROJECT" ? { nextType: "PROJECT", managerId: managerId || null, projectId: projectId || null } : { nextType: "WAREHOUSE", warehouseId: warehouseId || null } } : {}),
        ...(managerRole && status === "ACTIVE" && managedProjectIds.join("|") !== (currentManagedProjectIds ?? []).join("|") ? { managedProjectIds } : {}),
        ...(warehouseManagerRole && status === "ACTIVE" && managedWarehouseIds.join("|") !== (currentManagedWarehouseIds ?? []).join("|") ? { managedWarehouseIds } : {}),
      })
    } catch (error) { setFailure(serverError(error)) }
    finally { submitting.current = false }
  }
  return <form className="space-y-4" onSubmit={submit} aria-busy={busy}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1">{t("employeeForm.firstNameLabel")}<Input required value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
      <label className="grid gap-1">{t("employeeForm.lastNameLabel")}<Input required value={lastName} onChange={event => setLastName(event.target.value)} /></label>
      <label className="grid gap-1">{t("auth.phoneLabel")}<Input required inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
      <label className="grid gap-1">{t("employeeForm.roleLabel")}<NativeSelect value={roleId} onChange={event => setRoleId(event.target.value)}>{roles.filter(role => role.isSystem && ["admin", "worker", "project_manager", "warehouse_manager"].includes(role.key)).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</NativeSelect></label>
      <label className="grid gap-1">{t("status.active")}<NativeSelect value={status} onChange={event => setStatus(event.target.value as ExactEmployee["status"])}><option value="ACTIVE">{t("status.active")}</option><option value="INACTIVE">{t("status.inactive")}</option><option value="LEFT">{t("status.left")}</option></NativeSelect></label>
      <label className="grid gap-1">{t("employeeForm.salaryPeriodLabel")}<NativeSelect value={period} onChange={event => setPeriod(event.target.value)}><option value="">{t("common.none")}</option><option value="DAILY">{t("detailPages.salary.daily")}</option><option value="WEEKLY">{t("detailPages.salary.weekly")}</option><option value="MONTHLY">{t("detailPages.salary.monthly")}</option></NativeSelect></label>
      <label className="grid gap-1">{t("employeeForm.salaryAmountLabel")}<Input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder={period === "DAILY" ? "0.0000" : "0.00"} /></label>
      <label className="grid gap-1">{t("employeeForm.occupationLabel")}<Input maxLength={120} value={occupation} onChange={event => setOccupation(event.target.value)} /></label>
      <label className="grid gap-1 sm:col-span-2">{t("employeeForm.notesLabel")}<Input value={notes} onChange={event => setNotes(event.target.value)} /></label>
    </div>
    {worker && status === "ACTIVE" ? <fieldset className="space-y-3 rounded-md border p-3"><legend>{t("detailPages.employee.editPage.workTitle")}</legend>
      <label className="grid gap-1">{t("employeeForm.managerLabel")}<NativeSelect value={managerId} onChange={event => { setManagerId(event.target.value); setProjectId("") }}><option value="">{t("employeeForm.managerPlaceholder")}</option>{managers.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label>
      <label className="grid gap-1">{t("employeeForm.projectLabel")}<NativeSelect value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">{t("employeeForm.projectPlaceholder")}</option>{(selectedManager?.projectOptions ?? projects).map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label>
      {editing ? <label className="grid gap-1">{t("detailPages.employee.editPage.workplaceType")}<NativeSelect value={workplaceType} onChange={event => setWorkplaceType(event.target.value as typeof workplaceType)}><option value="NONE">{t("common.none")}</option><option value="PROJECT">{t("detailPages.employee.editPage.projectPlacement")}</option><option value="WAREHOUSE">{t("detailPages.employee.editPage.warehouse")}</option></NativeSelect></label> : null}
      {editing && workplaceType === "WAREHOUSE" ? <label className="grid gap-1">{t("detailPages.employee.editPage.warehouse")}<NativeSelect value={warehouseId} onChange={event => setWarehouseId(event.target.value)}><option value="" />{warehouses.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</NativeSelect></label> : null}
    </fieldset> : null}
    {managerRole && status === "ACTIVE" ? <fieldset className="space-y-2 rounded-md border p-3"><legend>{t("detailPages.employee.editPage.managedProjectsTitle")}</legend>{managedProjects.map(row => <label className="flex gap-2" key={row.id}><input type="checkbox" checked={managedProjectIds.includes(row.id)} onChange={event => setManagedProjectIds(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))} />{row.label}</label>)}</fieldset> : null}
    {warehouseManagerRole && status === "ACTIVE" ? <fieldset className="space-y-2 rounded-md border p-3"><legend>{t("detailPages.employee.editPage.managedWarehousesTitle")}</legend>{managedWarehouses.map(row => <label className="flex gap-2" key={row.id}><input type="checkbox" checked={managedWarehouseIds.includes(row.id)} onChange={event => setManagedWarehouseIds(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))} />{row.label}</label>)}</fieldset> : null}
    {failure || serverFailure ? <p role="alert" className="text-destructive">{failure ?? serverFailure}</p> : null}
    <Button type="submit" disabled={busy}>{busy ? t("common.loading") : editing ? t("common.save") : t("common.create")}</Button>
  </form>
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
  return <section className="space-y-4"><h1 className="text-xl font-semibold">{t("detailPages.employee.editTitle")}</h1>
    {completionFailure ? <p role="alert">{completionFailure}</p> : null}
    <FormFields roles={props.roles} managers={props.managerOptions} projects={props.projectOptions} warehouses={props.warehouseOptions} managedProjects={props.managedProjectOptions} managedWarehouses={props.managedWarehouseOptions} currentManagedProjectIds={props.currentManagedProjectIds} currentManagedWarehouseIds={props.currentManagedWarehouseIds} currentPlacement={props.currentPlacement} initial={employee} editing busy={saving || saved} serverFailure={saveFailure} onSubmit={async data => {
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
    <Button type="button" variant="outline" disabled={saving || saved} onClick={props.onCancel}>{t("common.cancel")}</Button>
  </section>
}

export function ExactEmployeeCreatePage(props: ExactEmployeeBatchProps) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [completionFailure, setCompletionFailure] = useState<string | null>(null)
  const mutationLocked = useRef(false)
  const [saved, setSaved] = useState(false)
  const { client, onDone } = props
  return <section className="space-y-4"><h1 className="text-xl font-semibold">{t("employeeForm.pageTitle")}</h1>
    {completionFailure ? <p role="alert">{completionFailure}</p> : null}
    <FormFields roles={props.roles} managers={props.managerOptions} projects={props.projectOptions} warehouses={props.warehouseOptions} managedProjects={props.managedProjectOptions} managedWarehouses={props.managedWarehouseOptions} busy={saving || saved} serverFailure={failure} onSubmit={async data => {
      if (mutationLocked.current || saved) return
      mutationLocked.current = true
      setSaving(true); setFailure(null); setCompletionFailure(null)
      try { requireSuccess(await client.employeesCreate(data as ExactEmployeeCreateInput)); setSaved(true) }
      catch (error) { mutationLocked.current = false; setFailure(serverError(error)); setSaving(false); return }
      setSaving(false)
      try { onDone() } catch (error) { setCompletionFailure(t("employeeForm.exactCompletionFailed", { error: serverError(error) })) }
    }} />
    <Button type="button" variant="outline" disabled={saving || saved} onClick={props.onCancel}>{t("common.cancel")}</Button>
  </section>
}

type BatchDraft = { firstName: string; lastName: string; phone: string; roleId: string; salaryPeriod: string; salaryAmount: string; occupation: string; notes: string; managerId: string; projectId: string }
const periodLabelKeys = { DAILY: "detailPages.salary.daily", WEEKLY: "detailPages.salary.weekly", MONTHLY: "detailPages.salary.monthly" } as const
const emptyDraft = (roleId: string): BatchDraft => ({ firstName: "", lastName: "", phone: "", roleId, salaryPeriod: "", salaryAmount: "", occupation: "", notes: "", managerId: "", projectId: "" })
export function ExactEmployeeBatchCreatePage(props: ExactEmployeeBatchProps) {
  const { client, roles, managerOptions, onDone } = props
  const { t } = useTranslation()
  const defaultRole = roles.find(role => role.key === "worker")?.id ?? ""
  const [rows, setRows] = useState<BatchDraft[]>([emptyDraft(defaultRole)])
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mutationLocked = useRef(false)
  const [saved, setSaved] = useState(false)
  const [completionFailure, setCompletionFailure] = useState<string | null>(null)
  function patch(index: number, patchValue: Partial<BatchDraft>) { setRows(current => current.map((row, i) => i === index ? { ...row, ...patchValue } : row)) }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (mutationLocked.current || busy || saved) return
    mutationLocked.current = true
    setBusy(true); setFailure(null); setCompletionFailure(null); setErrors({})
    try {
      const employees = rows.map((row, index) => {
        if (!row.firstName.trim() || !row.lastName.trim() || !/^0[5-7]\d{8}$/.test(row.phone.trim())) throw new Error(i18n.t("employeeForm.exactBatchRowError", { count: index + 1 }))
        const salary = salaryReference(row.salaryPeriod, row.salaryAmount)
        return { firstName: row.firstName, lastName: row.lastName, phone: row.phone, roleId: row.roleId, status: "ACTIVE" as const, occupation: row.occupation.trim() || null, notes: row.notes.trim() || null, salaryReference: salary, ...(roles.find(role => role.id === row.roleId)?.key === "worker" ? { managerId: row.managerId || null, projectId: row.projectId || null } : {}) }
      })
      const result = await client.employeesBatchCreate({ employees } as ExactEmployeeBatchCreateInput)
      if (!result.success) {
        for (const fieldError of result.error.fieldErrors) {
          const match = /^employees\.(\d+)\./.exec(fieldError.field)
          if (match) setErrors(current => ({ ...current, [Number(match[1])]: fieldError.message }))
        }
        throw new Error(result.error.message)
      }
      setSaved(true)
    } catch (error) {
      mutationLocked.current = false
      const message = serverError(error)
      const rowMatch = /^employees\.(\d+)\./.exec(message)
      if (rowMatch) setErrors(current => ({ ...current, [Number(rowMatch[1])]: message }))
      setFailure(message)
      setBusy(false)
      return
    }
    setBusy(false)
    try { onDone() } catch (error) { setCompletionFailure(t("employeeForm.exactCompletionFailed", { error: serverError(error) })) }
  }
  return <form className="space-y-4" onSubmit={submit}><h1 className="text-xl font-semibold">{t("employeeForm.pageTitle")}</h1>
    {rows.map((row, index) => <fieldset key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2"><legend>{t("employeeForm.rowTitle", { count: index + 1 })}</legend>
      {(["firstName", "lastName", "phone"] as const).map(field => <label key={field} className="grid gap-1">{field === "firstName" ? t("employeeForm.firstNameLabel") : field === "lastName" ? t("employeeForm.lastNameLabel") : t("auth.phoneLabel")}<Input value={row[field]} onChange={event => patch(index, { [field]: event.target.value })} /></label>)}
      <label className="grid gap-1">{t("employeeForm.roleLabel")}<NativeSelect value={row.roleId} onChange={event => patch(index, { roleId: event.target.value })}>{roles.filter(role => role.isSystem && ["admin", "worker", "project_manager", "warehouse_manager"].includes(role.key)).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</NativeSelect></label>
      <label className="grid gap-1">{t("employeeForm.salaryPeriodLabel")}<NativeSelect value={row.salaryPeriod} onChange={event => patch(index, { salaryPeriod: event.target.value })}><option value="" />{(["DAILY", "WEEKLY", "MONTHLY"] as const).map(value => <option key={value} value={value}>{t(periodLabelKeys[value])}</option>)}</NativeSelect></label>
      <label className="grid gap-1">{t("employeeForm.salaryAmountLabel")}<Input value={row.salaryAmount} onChange={event => patch(index, { salaryAmount: event.target.value })} /></label>
      <label className="grid gap-1">{t("employeeForm.occupationLabel")}<Input maxLength={120} value={row.occupation} onChange={event => patch(index, { occupation: event.target.value })} /></label>
      <label className="grid gap-1">{t("employeeForm.notesLabel")}<Input maxLength={1000} value={row.notes} onChange={event => patch(index, { notes: event.target.value })} /></label>
      {roles.find(role => role.id === row.roleId)?.key === "worker" ? <><label className="grid gap-1">{t("employeeForm.managerLabel")}<NativeSelect value={row.managerId} onChange={event => patch(index, { managerId: event.target.value, projectId: "" })}><option value="" />{managerOptions.map(manager => <option key={manager.id} value={manager.id}>{manager.label}</option>)}</NativeSelect></label><label className="grid gap-1">{t("employeeForm.projectLabel")}<NativeSelect value={row.projectId} onChange={event => patch(index, { projectId: event.target.value })}><option value="" />{managerOptions.find(manager => manager.id === row.managerId)?.projectOptions.map(project => <option key={project.id} value={project.id}>{project.label}</option>)}</NativeSelect></label></> : null}
      {errors[index] ? <p role="alert" className="sm:col-span-2">{errors[index]}</p> : null}
      {rows.length > 1 ? <Button type="button" variant="outline" onClick={() => setRows(current => current.filter((_, i) => i !== index))}>{t("employeeForm.remove")}</Button> : null}
    </fieldset>)}
    {failure ? <p role="alert">{failure}</p> : null}{completionFailure ? <p role="alert">{completionFailure}</p> : null}<div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || saved} onClick={() => setRows(current => [...current, emptyDraft(defaultRole)])}>{t("employeeForm.addAnother")}</Button><Button type="submit" disabled={busy || saved}>{t("employeeForm.submitBatch")}</Button><Button type="button" variant="outline" disabled={busy || saved} onClick={props.onCancel}>{t("common.cancel")}</Button></div>
  </form>
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
  const load = useCallback(async () => {
    setLoading(true); setFailure(null)
    try { const [person, records] = await Promise.all([client.employeesGet({ id: employeeId }), client.employeeStateHistoryList({ employeeId })]); setEmployee(requireSuccess(person)); setHistory(records.items) }
    catch (error) { setFailure(serverError(error)) } finally { setLoading(false) }
  }, [client, employeeId])
  useEffect(() => { void load() }, [load])
  if (loading) return <p role="status">{t("common.loading")}</p>
  if (failure || !employee) return <section><p role="alert">{failure ?? t("common.none")}</p><Button onClick={() => void load()}>{t("common.retry")}</Button></section>
  const role = props.roles.find(value => value.id === employee.roleId)
  const statusLabel = employee.status === "ACTIVE" ? t("status.active") : employee.status === "LEFT" ? t("status.left") : t("status.inactive")
  const historyRows = history.map(entry => ({
    id: entry.id,
    typeLabel: entry.eventType,
    title: props.roles.find(value => value.id === entry.roleId)?.name ?? entry.roleId,
    detail: entry.notes,
    periodLabel: <AppDate value={entry.startDate} includeTime />,
    statusLabel: entry.status === "ACTIVE" ? t("status.active") : entry.status === "LEFT" ? t("status.left") : t("status.inactive"),
  }))
  return <RecordPageFrame title={`${employee.firstName} ${employee.lastName}`} editLabel={t("detailPages.employee.edit")} action={<Button variant="destructive" disabled={deleting} onClick={async () => { setDeleting(true); setDeleteError(null); try { const result = await client.employeesDelete({ id: employee.id }); if (!result.success) throw new Error(result.error.message); props.onDone() } catch (error) { setDeleteError(serverError(error)) } finally { setDeleting(false) } }}>{t("common.delete")}</Button>}>
    {deleteError ? <p role="alert">{deleteError}</p> : null}
    <RecordInfoGrid>
      <RecordInfoCard label={t("detailPages.employee.fullName")} value={`${employee.firstName} ${employee.lastName}`} />
      <RecordInfoCard label={t("employeeForm.roleLabel")} value={role?.name ?? employee.roleId} />
      <RecordInfoCard label={t("auth.phoneLabel")} value={<bdi dir="ltr">{employee.phone}</bdi>} valueClassName="font-mono" />
      <RecordInfoCard label={t("status.active")} value={statusLabel} />
      <RecordInfoCard label={t("employeeForm.salaryAmountLabel")} value={<ExactSalaryReferenceValue reference={employee.salaryReference} />} />
      <RecordInfoCard label={t("detailPages.employee.notes")} value={employee.notes?.trim() || t("common.noNotes")} wide />
    </RecordInfoGrid>
    <section className="space-y-3"><h2 className="text-lg font-semibold">{t("detailPages.employee.historyTab")}</h2>
      <RecordHistoryTable emptyLabel={t("detailPages.employee.noWorkHistory")} rows={historyRows} />
    </section>
  </RecordPageFrame>
}

export function ExactEmployeeTable({ client, roles, onView, onEdit, onAdd }: ExactEmployeeUiContext & { onView: (id: string) => void; onEdit: (id: string) => void; onAdd?: () => void }) {
  const [employees, setEmployees] = useState<ExactEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => { let live = true; setLoading(true); client.employeesList().then(result => { if (live) { setEmployees(result.items); setFailure(null) } }).catch(error => { if (live) setFailure(serverError(error)) }).finally(() => { if (live) setLoading(false) }); return () => { live = false } }, [client, refreshKey])
  async function remove(id: string) { setDeletingId(id); setDeleteFailure(null); try { const result = await client.employeesDelete({ id }); if (!result.success) throw new Error(result.error.message); setRefreshKey(value => value + 1) } catch (error) { setDeleteFailure(serverError(error)) } finally { setDeletingId(null) } }
  const { t } = useTranslation()
  if (loading) return <p role="status">{t("common.loading")}</p>
  if (failure) return <section><p role="alert">{failure}</p><Button onClick={() => setRefreshKey(value => value + 1)}>{t("common.retry")}</Button></section>
  if (!employees.length) return <section className="space-y-3"><p>{t("employeeForm.exactEmpty")}</p>{onAdd ? <Button onClick={onAdd}>{t("employeeForm.submitSingle")}</Button> : null}</section>
  return <RecordPageFrame title={t("employeeForm.pageTitle")} action={onAdd ? <Button onClick={onAdd}>{t("employeeForm.submitSingle")}</Button> : undefined}>
    {deleteFailure ? <p role="alert">{deleteFailure}</p> : null}
    <AppShellTableFrame><table className="min-w-full text-sm"><AppShellTableHead><tr>
      <AppShellTableHeaderCell>{t("employeeForm.firstNameLabel")}</AppShellTableHeaderCell><AppShellTableHeaderCell>{t("employeeForm.roleLabel")}</AppShellTableHeaderCell><AppShellTableHeaderCell>{t("auth.phoneLabel")}</AppShellTableHeaderCell><AppShellTableHeaderCell>{t("status.active")}</AppShellTableHeaderCell><AppShellTableHeaderCell>{t("employeeForm.salaryAmountLabel")}</AppShellTableHeaderCell><AppShellTableHeaderCell>{t("common.actions")}</AppShellTableHeaderCell>
    </tr></AppShellTableHead><tbody>{employees.map(employee => <AppShellTableRow key={employee.id}>
      <td className="px-4 py-3 font-medium">{employee.firstName} {employee.lastName}</td><td className="px-4 py-3">{roles.find(role => role.id === employee.roleId)?.name ?? employee.roleId}</td><td className="px-4 py-3"><bdi dir="ltr">{employee.phone}</bdi></td><td className="px-4 py-3">{employee.status === "ACTIVE" ? t("status.active") : employee.status === "LEFT" ? t("status.left") : t("status.inactive")}</td><td className="px-4 py-3"><ExactSalaryReferenceValue reference={employee.salaryReference} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button size="xs" onClick={() => onView(employee.id)}>{t("common.view")}</Button><Button size="xs" variant="outline" onClick={() => onEdit(employee.id)}>{t("detailPages.employee.edit")}</Button><Button size="xs" variant="destructive" disabled={deletingId === employee.id} onClick={() => void remove(employee.id)}>{t("common.delete")}</Button></div></td>
    </AppShellTableRow>)}</tbody></table></AppShellTableFrame>
  </RecordPageFrame>
}
