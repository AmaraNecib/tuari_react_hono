/**
 * Employee batch creation schema validation.
 */
import {
  employeeBatchCreateInputSchema,
  employeeBatchCreateRowInputSchema,
  employeeBatchLimit,
  type Employee,
  type EmployeeBatchCreateInput,
} from "@tuari/contracts"

/**
 * duplicatePhoneInBatchMessage = "تم تكرار رقم الهاتف داخل نفس الدفعة." component.
 */
export const duplicatePhoneInBatchMessage = "تم تكرار رقم الهاتف داخل نفس الدفعة."

export type EmployeeDraft = {
  firstName: string
  lastName: string
  phone: string
  occupation: string
  roleId: string
  salaryAmountDzd: string
  salaryPeriod: NonNullable<Employee["salaryPeriod"]> | ""
  managerId: string
  projectId: string
  notes: string
}
/**
 * createEmptyEmployeeDraft(defaultRoleId = "") component.
 */

export type EmployeeDraftErrors = Partial<Record<keyof EmployeeDraft, string>>

export function createEmptyEmployeeDraft(defaultRoleId = ""): EmployeeDraft {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    occupation: "",
    roleId: defaultRoleId,
    salaryAmountDzd: "",
    salaryPeriod: "",
/**
 * parseSalaryAmount(value component.
 */
    managerId: "",
    projectId: "",
    notes: "",
  }
}

export function parseSalaryAmount(value: string) {
  const trimmed = value.trim()
/**
 * normalizeEmployeeDraft(draft component.
 */

  if (trimmed.length === 0) {
    return null
  }

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : Number.NaN
}

export function normalizeEmployeeDraft(draft: EmployeeDraft) {
  return {
    firstName: draft.firstName.trim(),
/**
 * validateEmployeeDraft(draft component.
 */
    lastName: draft.lastName.trim(),
    phone: draft.phone.trim(),
    occupation: draft.occupation.trim() || undefined,
    roleId: draft.roleId,
    status: "ACTIVE" as const,
    salaryAmountDzd: parseSalaryAmount(draft.salaryAmountDzd),
    salaryPeriod: draft.salaryPeriod || null,
    managerId: draft.managerId.trim() || null,
    projectId: draft.projectId.trim() || null,
    notes: draft.notes.trim() || undefined,
  }
}

export function validateEmployeeDraft(draft: EmployeeDraft) {
  const errors: EmployeeDraftErrors = {}
  const salaryAmount = parseSalaryAmount(draft.salaryAmountDzd)
  const result = employeeBatchCreateRowInputSchema.safeParse(normalizeEmployeeDraft(draft))

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0]

      if (field === "firstName") {
        errors.firstName = issue.message
      }

      if (field === "lastName") {
        errors.lastName = issue.message
      }

      if (field === "phone") {
        errors.phone = issue.message
      }

      if (field === "occupation") {
        errors.occupation = issue.message
      }

      if (field === "roleId") {
        errors.roleId = issue.message
      }

      if (field === "salaryAmountDzd") {
        errors.salaryAmountDzd = issue.message
      }

      if (field === "salaryPeriod") {
        errors.salaryPeriod = issue.message
      }

      if (field === "managerId") {
        errors.managerId = issue.message
      }

      if (field === "projectId") {
        errors.projectId = issue.message
      }

      if (field === "notes") {
        errors.notes = issue.message
      }
    }
  }

/**
 * validateEmployeeBatch(drafts component.
 */
  if (Number.isNaN(salaryAmount)) {
    errors.salaryAmountDzd = errors.salaryAmountDzd ?? "invalid"
  }

  if (salaryAmount !== null && !draft.salaryPeriod) {
    errors.salaryPeriod = errors.salaryPeriod ?? "required"
  }

  if (salaryAmount === null && draft.salaryPeriod) {
    errors.salaryAmountDzd = errors.salaryAmountDzd ?? "required"
  }

  return errors
}

export function validateEmployeeBatch(drafts: EmployeeDraft[]) {
  const rowErrors = drafts.map(validateEmployeeDraft)

  const result = employeeBatchCreateInputSchema.safeParse({
    employees: drafts.map(normalizeEmployeeDraft),
  } satisfies EmployeeBatchCreateInput)

  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] !== "employees") {
        continue
      }

      const rowIndex = Number(issue.path[1])
      const field = issue.path[2]

      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowErrors.length) {
        continue
      }

      if (field === "phone") {
        rowErrors[rowIndex] = {
          ...rowErrors[rowIndex],
          phone: issue.message,
        }
      }

      if (field === "managerId") {
        rowErrors[rowIndex] = {
          ...rowErrors[rowIndex],
          managerId: issue.message,
        }
      }

      if (field === "projectId") {
        rowErrors[rowIndex] = {
          ...rowErrors[rowIndex],
          projectId: issue.message,
        }
      }
    }
  }

  return {
    rowErrors,
    isValid:
      result.success &&
      rowErrors.every((rowError) => Object.values(rowError).every((message) => message === undefined)),
  }
}

export { employeeBatchLimit }
