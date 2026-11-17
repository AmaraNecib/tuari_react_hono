import { useRef, useState, type FormEvent } from "react"
import type { Role } from "@tuari/contracts"
import { employeeBatchLimit } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { showErrorToast, showSuccessToast } from "@/lib/toast"
import { i18n } from "@/i18n"
import { salaryReference } from "./exact-employee-pages"
import type { ExactEmployeeBatchProps } from "./exact-employee-pages"
import { EmployeeBatchRowCard } from "./employee-batch-row-card"
import { createEmptyEmployeeDraft, duplicatePhoneInBatchMessage, type EmployeeDraft, type EmployeeDraftErrors } from "./employee-batch-schema"
import { isEmployeeRoleSelectable } from "./role-classification"

type Props = ExactEmployeeBatchProps & { single: boolean }

function validateRow(row: EmployeeDraft, roles: Role[], workerRoleId: string | null): EmployeeDraftErrors {
  const errors: EmployeeDraftErrors = {}
  if (!row.firstName.trim()) errors.firstName = i18n.t("employeeForm.validation.firstName")
  if (!row.lastName.trim()) errors.lastName = i18n.t("employeeForm.validation.lastName")
  if (!/^0[5-7]\d{8}$/.test(row.phone.trim())) errors.phone = i18n.t("auth.validation.phoneFormat")
  if (!roles.some(role => role.id === row.roleId && isEmployeeRoleSelectable(role.key))) errors.roleId = i18n.t("employeeForm.validation.roleId")
  if (row.occupation.trim().length > 120) errors.occupation = i18n.t("employeeForm.validation.occupation")
  try { salaryReference(row.salaryPeriod, row.salaryAmountDzd) }
  catch (error) {
    if (!row.salaryAmountDzd.trim() && row.salaryPeriod) errors.salaryAmountDzd = i18n.t("employeeForm.validation.salaryAmountRequired")
    else if (row.salaryAmountDzd.trim() && !row.salaryPeriod) errors.salaryPeriod = i18n.t("employeeForm.validation.salaryPeriodRequired")
    else errors.salaryAmountDzd = error instanceof Error ? error.message : i18n.t("employeeForm.validation.salaryAmountInvalid")
  }
  if (row.notes.length > 1000) errors.notes = i18n.t("employeeForm.validation.notes")
  if (workerRoleId !== null && row.roleId === workerRoleId) {
    if (!row.managerId) errors.managerId = i18n.t("employeeForm.validation.managerId")
    if (!row.projectId) errors.projectId = i18n.t("employeeForm.validation.projectId")
  }
  return errors
}

export function ExactEmployeeCreateForm({ client, roles, managerOptions, onCancel, onDone, single }: Props) {
  const { t } = useTranslation()
  const defaultRoleId = roles.find(role => role.key === "worker")?.id ?? roles[0]?.id ?? ""
  const workerRoleId = roles.find(role => role.key === "worker")?.id ?? null
  const [rows, setRows] = useState<EmployeeDraft[]>([createEmptyEmployeeDraft(defaultRoleId)])
  const [rowErrors, setRowErrors] = useState<EmployeeDraftErrors[]>([{}])
  const [failure, setFailure] = useState<string | null>(null)
  const [completionFailure, setCompletionFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const lock = useRef(false)

  function change(index: number, field: keyof EmployeeDraft, value: string) {
    setRows(current => current.map((row, at) => {
      if (at !== index) return row
      if (field === "roleId") return { ...row, roleId: value, managerId: value === workerRoleId ? row.managerId : "", projectId: value === workerRoleId ? row.projectId : "" }
      if (field === "managerId") return { ...row, managerId: value, projectId: "" }
      return { ...row, [field]: value }
    }))
    setRowErrors(current => current.map((errors, at) => at === index ? { ...errors, [field]: undefined } : errors))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current || saved) return
    const errors = rows.map(row => validateRow(row, roles, workerRoleId))
    const firstByPhone = new Map<string, number>()
    rows.forEach((row, index) => {
      const phone = row.phone.trim()
      const first = firstByPhone.get(phone)
      if (phone && first !== undefined) {
        errors[index] = { ...errors[index], phone: duplicatePhoneInBatchMessage }
        errors[first] = { ...errors[first], phone: duplicatePhoneInBatchMessage }
      } else if (phone) firstByPhone.set(phone, index)
    })
    setRowErrors(errors)
    if (errors.some(row => Object.values(row).some(Boolean))) {
      showErrorToast(t("toasts.employeeBatchValidation"))
      return
    }

    lock.current = true
    setSaving(true)
    setFailure(null)
    setCompletionFailure(null)
    try {
      const employees = rows.map(row => ({
        firstName: row.firstName.trim(), lastName: row.lastName.trim(), phone: row.phone.trim(), roleId: row.roleId,
        status: "ACTIVE" as const, occupation: row.occupation.trim() || null, notes: row.notes.trim() || null,
        salaryReference: salaryReference(row.salaryPeriod, row.salaryAmountDzd),
        ...(row.roleId === workerRoleId ? { managerId: row.managerId || null, projectId: row.projectId || null } : {}),
      }))
      const result = await client.employeesBatchCreate({ employees })
      if (!result.success) {
        const mapped = [...errors]
        for (const fieldError of result.error.fieldErrors) {
          const match = /^employees\.(\d+)\.(firstName|lastName|phone|roleId|occupation|salaryReference|managerId|projectId|notes)$/.exec(fieldError.field)
          if (!match) continue
          const rowIndex = Number(match[1])
          if (rowIndex >= 0 && rowIndex < mapped.length) {
            const field: keyof EmployeeDraftErrors = match[2] === "salaryReference" ? "salaryAmountDzd" : match[2] as keyof EmployeeDraftErrors
            mapped[rowIndex] = { ...mapped[rowIndex], [field]: fieldError.message }
          }
        }
        setRowErrors(mapped)
        throw new Error(result.error.message)
      }
      setSaved(true)
      showSuccessToast(t("toasts.employeeBatchSuccess", { count: result.item.employees.length }))
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t("toasts.addWorkerError"))
      lock.current = false
      setSaving(false)
      return
    }
    setSaving(false)
    try { onDone() }
    catch (error) { setCompletionFailure(t("employeeForm.exactCompletionFailed", { error: error instanceof Error ? error.message : "Request failed" })) }
  }

  const maxRows = single ? 1 : employeeBatchLimit
  const copy = {
    firstNameLabel: t("employeeForm.firstNameLabel"), lastNameLabel: t("employeeForm.lastNameLabel"),
    phoneLabel: t("auth.phoneLabel"), roleLabel: t("employeeForm.roleLabel"), occupationLabel: t("employeeForm.occupationLabel"),
    salaryAmountLabel: t("employeeForm.salaryAmountLabel"), salaryPeriodLabel: t("employeeForm.salaryPeriodLabel"),
    salaryAmountPlaceholder: "10000", salaryPeriodPlaceholder: t("employeeForm.selectSalaryPeriod"),
    salaryPeriodOptions: ["DAILY", "WEEKLY", "MONTHLY"].map(value => ({ value: value as "DAILY" | "WEEKLY" | "MONTHLY", label: t(`detailPages.salary.${value.toLowerCase()}`) })),
    managerLabel: t("employeeForm.managerLabel"), managerPlaceholder: t("employeeForm.managerPlaceholder"),
    managerDisabledHint: t("employeeForm.managerDisabledHint"), projectLabel: t("employeeForm.projectLabel"),
    projectPlaceholder: t("employeeForm.projectPlaceholder"), projectDisabledHint: t("employeeForm.projectDisabledHint"),
    notesLabel: t("employeeForm.notesLabel"), firstNamePlaceholder: t("employeeForm.firstNamePlaceholder"),
    lastNamePlaceholder: t("employeeForm.lastNamePlaceholder"), phonePlaceholder: t("auth.phonePlaceholder"),
    rolePlaceholder: t("employeeForm.rolePlaceholder"), occupationPlaceholder: t("employeeForm.occupationPlaceholder"),
    notesPlaceholder: t("employeeForm.notesPlaceholder"), remove: t("employeeForm.remove"),
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-end xl:justify-between" dir="rtl">
      <div className="space-y-2 text-start"><h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("employeeForm.pageTitle")}</h2><p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("employeeForm.description")}</p></div>
      <div className="flex flex-wrap items-center gap-3" dir="rtl">
        <Button type="button" variant="outline" disabled={saving || saved} onClick={onCancel}>{t("employeeForm.backToEmployees")}</Button>
        {!single ? <Button type="button" disabled={rows.length >= maxRows || saving || saved} onClick={() => { setRows(current => [...current, createEmptyEmployeeDraft(defaultRoleId)]); setRowErrors(current => [...current, {}]) }}>{t("employeeForm.addAnother")}</Button> : null}
      </div>
    </div>
    {!single && rows.length >= maxRows ? <p className="text-sm text-muted-foreground">{t("employeeForm.batchLimit", { count: maxRows })}</p> : null}
    <form className="space-y-4" onSubmit={submit} aria-busy={saving}>
      {rows.map((row, index) => <EmployeeBatchRowCard key={`exact-employee-draft-${index}`} copy={{ ...copy, title: t("employeeForm.rowTitle", { count: index + 1 }) }} draft={row} errors={rowErrors[index] ?? {}} index={index} managerOptions={managerOptions} roles={roles} workerRoleId={workerRoleId} canRemove={!single && rows.length > 1} onChange={change} onRemove={at => { setRows(current => current.filter((_, rowIndex) => rowIndex !== at)); setRowErrors(current => current.filter((_, rowIndex) => rowIndex !== at)) }} />)}
      {failure ? <p role="alert">{failure}</p> : null}{completionFailure ? <p role="alert">{completionFailure}</p> : null}
      <div className="flex items-center justify-end gap-3"><Button className="min-w-44" disabled={saving || saved} type="submit">{saving ? t("common.loading") : single ? t("common.create") : t("employeeForm.submitBatch")}</Button><Button type="button" variant="outline" disabled={saving || saved} onClick={onCancel}>{t("employeeForm.backToEmployees")}</Button></div>
    </form>
  </div>
}
