import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { Role } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  AppMutationError,
  useCreateEmployeesBatchMutation,
} from "@/features/app-shell/mock-dashboard"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

import {
  createEmptyEmployeeDraft,
  duplicatePhoneInBatchMessage,
  employeeBatchLimit,
  normalizeEmployeeDraft,
  type EmployeeDraft,
  type EmployeeDraftErrors,
  validateEmployeeBatch,
} from "./employee-batch-schema"
import {
  EmployeeBatchRowCard,
  type EmployeeManagerOption,
} from "./employee-batch-row-card"

type EmployeeBatchCreatePageProps = {
  roles: Role[]
  managerOptions: EmployeeManagerOption[]
  onCancel: () => void
  onDone: () => void
}

function localizeRowErrors(
  rows: EmployeeDraft[],
  rowErrors: EmployeeDraftErrors[],
  copy: {
    firstName: string
    lastName: string
    phone: string
    phoneFormat: string
    roleId: string
    salaryAmountDzd: string
    salaryAmountInvalid: string
    salaryPeriod: string
    managerId: string
    projectId: string
    notes: string
  },
) {
  return rowErrors.map((rowError, index) => ({
    firstName: rowError.firstName ? copy.firstName : undefined,
    lastName: rowError.lastName ? copy.lastName : undefined,
    phone: rowError.phone
      ? rowError.phone === duplicatePhoneInBatchMessage
        ? rowError.phone
        : rows[index]?.phone.trim().length === 0
          ? copy.phone
          : copy.phoneFormat
      : undefined,
    roleId: rowError.roleId ? copy.roleId : undefined,
    salaryAmountDzd: rowError.salaryAmountDzd
      ? rowError.salaryAmountDzd === "invalid"
        ? copy.salaryAmountInvalid
        : copy.salaryAmountDzd
      : undefined,
    salaryPeriod: rowError.salaryPeriod ? copy.salaryPeriod : undefined,
    managerId: rowError.managerId,
    projectId: rowError.projectId,
    notes: rowError.notes ? copy.notes : undefined,
  }))
}

function createEmptyErrorRows(count: number) {
  return Array.from({ length: count }, () => ({} satisfies EmployeeDraftErrors))
}

function mapServerErrors(error: AppMutationError, rowCount: number) {
  const rowErrors = createEmptyErrorRows(rowCount)

  for (const fieldError of error.fieldErrors) {
    const match =
      /^employees\.(\d+)\.(firstName|lastName|phone|roleId|salaryAmountDzd|salaryPeriod|managerId|projectId|notes)$/.exec(
        fieldError.field,
      )

    if (!match) {
      continue
    }

    const rowIndex = Number(match[1])
    const field = match[2] as keyof EmployeeDraftErrors

    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowErrors.length) {
      continue
    }

    rowErrors[rowIndex] = {
      ...rowErrors[rowIndex],
      [field]: fieldError.message,
    }
  }

  return rowErrors
}

/** Batch employee creation page with CSV/inline input. */
export function EmployeeBatchCreatePage({
  roles,
  managerOptions,
  onCancel,
  onDone,
}: EmployeeBatchCreatePageProps) {
  const { t } = useTranslation()
  const createEmployeesBatchMutation = useCreateEmployeesBatchMutation()
  const defaultRoleId = useMemo(
    () => roles.find((role) => role.key === "worker")?.id ?? roles[0]?.id ?? "",
    [roles],
  )
  const workerRoleId = useMemo(
    () => roles.find((role) => role.key === "worker")?.id ?? null,
    [roles],
  )
  const [rows, setRows] = useState<EmployeeDraft[]>([createEmptyEmployeeDraft(defaultRoleId)])
  const [rowErrors, setRowErrors] = useState<EmployeeDraftErrors[]>([{}])

  useEffect(() => {
    if (!defaultRoleId) {
      return
    }

    setRows((current) =>
      current.map((row) => (row.roleId ? row : { ...row, roleId: defaultRoleId })),
    )
  }, [defaultRoleId])

  const copy = {
    title: t("employeeForm.pageTitle"),
    description: t("employeeForm.description"),
    addAnother: t("employeeForm.addAnother"),
    batchLimit: t("employeeForm.batchLimit", { count: employeeBatchLimit }),
    remove: t("employeeForm.remove"),
    cancel: t("employeeForm.backToEmployees"),
    submitSingle: t("employeeForm.submitSingle"),
    submitBatch: t("employeeForm.submitBatch"),
    firstNameLabel: t("employeeForm.firstNameLabel"),
    lastNameLabel: t("employeeForm.lastNameLabel"),
    phoneLabel: t("auth.phoneLabel"),
    roleLabel: t("employeeForm.roleLabel"),
    salaryAmountLabel: t("employeeForm.salaryAmountLabel"),
    salaryPeriodLabel: t("employeeForm.salaryPeriodLabel"),
    managerLabel: t("employeeForm.managerLabel"),
    managerPlaceholder: t("employeeForm.managerPlaceholder"),
    managerDisabledHint: t("employeeForm.managerDisabledHint"),
    notesLabel: t("employeeForm.notesLabel"),
    firstNamePlaceholder: t("employeeForm.firstNamePlaceholder"),
    lastNamePlaceholder: t("employeeForm.lastNamePlaceholder"),
    phonePlaceholder: t("auth.phonePlaceholder"),
    rolePlaceholder: t("employeeForm.rolePlaceholder"),
    salaryAmountPlaceholder: "10000",
    salaryPeriodPlaceholder: t("employeeForm.selectSalaryPeriod"),
    notesPlaceholder: t("employeeForm.notesPlaceholder"),
    salaryPeriodOptions: [
      { value: "DAILY" as const, label: t("detailPages.salary.daily") },
      { value: "WEEKLY" as const, label: t("detailPages.salary.weekly") },
      { value: "MONTHLY" as const, label: t("detailPages.salary.monthly") },
    ],
    validation: {
      firstName: t("employeeForm.validation.firstName"),
      lastName: t("employeeForm.validation.lastName"),
      phone: t("auth.validation.phone"),
      phoneFormat: t("auth.validation.phoneFormat"),
      roleId: t("employeeForm.validation.roleId"),
      salaryAmountDzd: t("employeeForm.validation.salaryAmountRequired"),
      salaryAmountInvalid: t("employeeForm.validation.salaryAmountInvalid"),
      salaryPeriod: t("employeeForm.validation.salaryPeriodRequired"),
      managerId: t("employeeForm.validation.managerId"),
      projectId: t("employeeForm.validation.projectId"),
      notes: t("employeeForm.validation.notes"),
    },
  }

  function handleRowChange(index: number, field: keyof EmployeeDraft, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row
        }

        if (field === "roleId") {
          return {
            ...row,
            roleId: value,
            managerId: workerRoleId !== null && value === workerRoleId ? row.managerId : "",
            projectId: workerRoleId !== null && value === workerRoleId ? row.projectId : "",
          }
        }

        if (field === "managerId") {
          return {
            ...row,
            managerId: value,
            projectId: "",
          }
        }

        return { ...row, [field]: value }
      }),
    )
    setRowErrors((current) =>
      current.map((rowError, rowIndex) => {
        if (rowIndex !== index) {
          return rowError
        }

        if (field === "roleId") {
          return {
            ...rowError,
            roleId: undefined,
            managerId: undefined,
            projectId: undefined,
          }
        }

        if (field === "managerId") {
          return {
            ...rowError,
            managerId: undefined,
            projectId: undefined,
          }
        }

        return { ...rowError, [field]: undefined }
      }),
    )
  }

  function handleAddRow() {
    setRows((current) => [...current, createEmptyEmployeeDraft(defaultRoleId)])
    setRowErrors((current) => [...current, {}])
  }

  function handleRemoveRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
    setRowErrors((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validation = validateEmployeeBatch(rows)
    const localizedErrors = localizeRowErrors(rows, validation.rowErrors, copy.validation)
    setRowErrors(localizedErrors)

    if (!validation.isValid) {
      showErrorToast(t("toasts.employeeBatchValidation"))
      return
    }

    try {
      const result = await createEmployeesBatchMutation.mutateAsync({
        employees: rows.map(normalizeEmployeeDraft),
      })

      if (result.createdCount > 0) {
        showSuccessToast(t("toasts.employeeBatchSuccess", { count: result.createdCount }))
      }

      setRows([createEmptyEmployeeDraft(defaultRoleId)])
      setRowErrors([{}])
      onDone()
    } catch (error) {
      if (error instanceof AppMutationError) {
        const serverErrors = mapServerErrors(error, rows.length)
        const hasServerErrors = serverErrors.some((rowError) =>
          Object.values(rowError).some((message) => Boolean(message)),
        )

        if (hasServerErrors) {
          setRowErrors(serverErrors)
        }

        showErrorToast(error.message)
        return
      }

      showErrorToast(error instanceof Error ? error.message : t("toasts.addWorkerError"))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-end xl:justify-between" dir="rtl">
        <div className="space-y-2 text-start">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{copy.title}</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3" dir="rtl">
          <Button type="button" variant="outline" onClick={onCancel}>
            {copy.cancel}
          </Button>
          <Button disabled={rows.length >= employeeBatchLimit} type="button" onClick={handleAddRow}>
            {copy.addAnother}
          </Button>
        </div>
      </div>

      {rows.length >= employeeBatchLimit ? (
        <p className="text-sm text-muted-foreground">{copy.batchLimit}</p>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        {rows.map((row, index) => (
          <EmployeeBatchRowCard
            key={`employee-draft-${index}`}
            canRemove={rows.length > 1}
            copy={{
              title: t("employeeForm.rowTitle", { count: index + 1 }),
              firstNameLabel: copy.firstNameLabel,
              lastNameLabel: copy.lastNameLabel,
              phoneLabel: copy.phoneLabel,
              roleLabel: copy.roleLabel,
              salaryAmountLabel: copy.salaryAmountLabel,
              salaryPeriodLabel: copy.salaryPeriodLabel,
              salaryAmountPlaceholder: copy.salaryAmountPlaceholder,
              salaryPeriodPlaceholder: copy.salaryPeriodPlaceholder,
              salaryPeriodOptions: copy.salaryPeriodOptions,
              managerLabel: copy.managerLabel,
              managerPlaceholder: copy.managerPlaceholder,
              managerDisabledHint: copy.managerDisabledHint,
              projectLabel: t("employeeForm.projectLabel"),
              projectPlaceholder: t("employeeForm.projectPlaceholder"),
              projectDisabledHint: t("employeeForm.projectDisabledHint"),
              notesLabel: copy.notesLabel,
              firstNamePlaceholder: copy.firstNamePlaceholder,
              lastNamePlaceholder: copy.lastNamePlaceholder,
              phonePlaceholder: copy.phonePlaceholder,
              rolePlaceholder: copy.rolePlaceholder,
              notesPlaceholder: copy.notesPlaceholder,
              remove: copy.remove,
            }}
            draft={row}
            errors={rowErrors[index] ?? {}}
            index={index}
            managerOptions={managerOptions}
            roles={roles}
            workerRoleId={workerRoleId}
            onChange={handleRowChange}
            onRemove={handleRemoveRow}
          />
        ))}

        <div className="flex items-center justify-end gap-3">
          <Button className="min-w-44" disabled={createEmployeesBatchMutation.isPending} type="submit">
            {rows.length === 1 ? copy.submitSingle : copy.submitBatch}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {copy.cancel}
          </Button>
        </div>
      </form>
    </div>
  )
}
