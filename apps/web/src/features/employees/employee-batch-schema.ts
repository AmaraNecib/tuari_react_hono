import { i18n as featureI18n } from "@/i18n"
/** Employee batch creation schema validation. */
import {
  employeeBatchCreateInputSchema,
  employeeBatchCreateRowInputSchema,
  employeeBatchLimit,
  type Employee,
  type EmployeeBatchCreateInput,
} from "@tuari/contracts"

import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "@/features/shared/exact-money-input"

export const duplicatePhoneInBatchMessage = featureI18n.t("featureCopy.employeeBatchSchema.duplicatePhone")

type SalaryPeriod = NonNullable<Employee["salaryReference"]>["period"]
export type EmployeeDraft = {
  firstName: string
  lastName: string
  phone: string
  occupation: string
  roleId: string
  salaryReferenceAmount: string
  salaryReferencePeriod: SalaryPeriod | ""
  managerId: string
  projectId: string
  notes: string
}
export type EmployeeDraftErrors = Partial<Record<keyof EmployeeDraft, string>>

export function createEmptyEmployeeDraft(defaultRoleId = ""): EmployeeDraft {
  return {
    firstName: "", lastName: "", phone: "", occupation: "", roleId: defaultRoleId,
    salaryReferenceAmount: "", salaryReferencePeriod: "", managerId: "", projectId: "", notes: "",
  }
}

function parseSalaryReferenceAmount(amount: string, period: SalaryPeriod) {
  return period === "DAILY" ? parseLocalizedUnitPriceInput(amount) : parseLocalizedMoneyInput(amount)
}

function salaryReferenceFromDraft(draft: EmployeeDraft) {
  const amount = draft.salaryReferenceAmount.trim()
  const period = draft.salaryReferencePeriod
  if (!amount && !period) return null
  if (!amount || !period) return null
  try {
    const wire = parseSalaryReferenceAmount(amount, period).toWire()
    return { period, amount: wire.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") }
  } catch {
    return { period, amount }
  }
}

export function normalizeEmployeeDraft(draft: EmployeeDraft) {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    phone: draft.phone.trim(),
    occupation: draft.occupation.trim() || undefined,
    roleId: draft.roleId,
    status: "ACTIVE" as const,
    salaryReference: salaryReferenceFromDraft(draft),
    managerId: draft.managerId.trim() || null,
    projectId: draft.projectId.trim() || null,
    notes: draft.notes.trim() || undefined,
  }
}

export function validateEmployeeDraft(draft: EmployeeDraft) {
  const errors: EmployeeDraftErrors = {}
  const amount = draft.salaryReferenceAmount.trim()
  const period = draft.salaryReferencePeriod
  if (Boolean(amount) !== Boolean(period)) {
    if (!amount) errors.salaryReferenceAmount = "required"
    if (!period) errors.salaryReferencePeriod = "required"
  }
  if (amount && period) {
    try {
      parseSalaryReferenceAmount(amount, period)
    } catch {
      errors.salaryReferenceAmount = "invalid"
    }
  }

  const result = employeeBatchCreateRowInputSchema.safeParse(normalizeEmployeeDraft(draft))
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0]
      if (field === "firstName" || field === "lastName" || field === "phone" || field === "occupation" || field === "roleId" || field === "managerId" || field === "projectId" || field === "notes") {
        errors[field] = issue.message
      }
      if (field === "salaryReference") {
        const nested = issue.path[1]
        if (nested === "period") errors.salaryReferencePeriod ??= issue.message
        else errors.salaryReferenceAmount ??= issue.message
      }
    }
  }
  return errors
}

export function validateEmployeeBatch(drafts: EmployeeDraft[]) {
  const rowErrors = drafts.map(validateEmployeeDraft)
  const result = employeeBatchCreateInputSchema.safeParse({ employees: drafts.map(normalizeEmployeeDraft) } satisfies EmployeeBatchCreateInput)
  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] !== "employees") continue
      const rowIndex = Number(issue.path[1])
      const field = issue.path[2]
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowErrors.length) continue
      if (field === "phone" || field === "managerId" || field === "projectId") {
        rowErrors[rowIndex] = { ...rowErrors[rowIndex], [field]: issue.message }
      }
    }
  }
  return {
    rowErrors,
    isValid: result.success && rowErrors.every(rowError => Object.values(rowError).every(message => message === undefined)),
  }
}

export { employeeBatchLimit }
