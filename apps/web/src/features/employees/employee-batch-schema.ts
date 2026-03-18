import {
  employeeBatchCreateInputSchema,
  employeeBatchCreateRowInputSchema,
  employeeBatchLimit,
  type EmployeeBatchCreateInput,
} from "@tuari/contracts"

export const duplicatePhoneInBatchMessage = "تم تكرار رقم الهاتف داخل نفس الدفعة."

export type EmployeeDraft = {
  firstName: string
  lastName: string
  phone: string
  roleId: string
  managerId: string
  projectId: string
  notes: string
}

export type EmployeeDraftErrors = Partial<Record<keyof EmployeeDraft, string>>

export function createEmptyEmployeeDraft(defaultRoleId = ""): EmployeeDraft {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    roleId: defaultRoleId,
    managerId: "",
    projectId: "",
    notes: "",
  }
}

export function normalizeEmployeeDraft(draft: EmployeeDraft) {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    phone: draft.phone.trim(),
    roleId: draft.roleId,
    status: "ACTIVE" as const,
    managerId: draft.managerId.trim() || null,
    projectId: draft.projectId.trim() || null,
    notes: draft.notes.trim() || undefined,
  }
}

export function validateEmployeeDraft(draft: EmployeeDraft) {
  const errors: EmployeeDraftErrors = {}
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

      if (field === "roleId") {
        errors.roleId = issue.message
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
