import { useState } from "react"

import { AppMutationError, useCreateEmployeesBatchMutation } from "@/features/app-shell/mock-dashboard"

/**
 * Inline "create an employee" wiring shared by every `CreateableSelect` form
 * that creates a person (project manager, warehouse manager).
 *
 * The caller owns the labels and the role id; this hook owns the mutation, the
 * row shape, and the failure contract. Keeping one implementation is what stops
 * the callers from drifting back to fabricated ids or empty role ids.
 */
export type EmployeeInlineCreateField = {
  key: string
  label: string
  placeholder?: string
  required?: boolean
}

export type EmployeeInlineCreateConfig = {
  createLabel: string
  fields: EmployeeInlineCreateField[]
  onCreate: (data: Record<string, string>) => Promise<{ id: string; name: string }>
}

/**
 * Builds an inline-create config for an employee holding `roleId`.
 *
 * Returns `undefined` when `roleId` is unavailable so the form hides the create
 * option instead of offering a create the API would reject (the create contract
 * requires a role, and `requireAssignableEmployeeRole` only accepts system
 * workforce labels).
 *
 * `errorMessage` must be a localized string: every failure that is not a
 * server-authored `AppMutationError` (wire validation, network) is wrapped in
 * it so no raw English message reaches the dialog. A server `AppMutationError`
 * keeps its own message, preferring the first field error when present so the
 * specific reason (for example a taken phone number) reaches the user.
 */
export function useEmployeeInlineCreate({
  roleId,
  createLabel,
  fields,
  errorMessage,
}: {
  roleId: string
  createLabel: string
  fields: EmployeeInlineCreateField[]
  errorMessage: string
}): EmployeeInlineCreateConfig | undefined {
  const createEmployeeMutation = useCreateEmployeesBatchMutation()

  if (!roleId) {
    return undefined
  }

  return {
    createLabel,
    fields,
    onCreate: async (data) => {
      let result: Awaited<ReturnType<typeof createEmployeeMutation.mutateAsync>>

      try {
        result = await createEmployeeMutation.mutateAsync({
          employees: [
            {
              firstName: data.firstName ?? "",
              lastName: data.lastName ?? "",
              phone: data.phone ?? "",
              roleId,
              status: "ACTIVE",
              managerId: null,
              salaryAmountDzd: null,
              salaryPeriod: null,
              notes: null,
            },
          ],
        })
      } catch (error) {
        if (error instanceof AppMutationError) {
          // A batch validation error carries a generic top-level message
          // ("could not save the batch"); the actionable reason (the phone is
          // taken, the role is not assignable) rides the field errors. Surface
          // the specific one so the dialog does not tell the user to "review
          // the marked fields" when no field is marked.
          const fieldMessage = error.fieldErrors[0]?.message

          throw fieldMessage
            ? new AppMutationError({ code: error.code, message: fieldMessage, fieldErrors: error.fieldErrors })
            : error
        }

        throw new Error(errorMessage)
      }

      const employee = result.employees[0]

      // Fail loudly rather than fabricate an id: a selection pointing at a
      // non-existent row would submit a broken reference to the API.
      if (!employee?.id) {
        throw new Error(errorMessage)
      }

      return { id: employee.id, name: `${employee.firstName} ${employee.lastName}` }
    },
  }
}

/**
 * Wraps {@link useEmployeeInlineCreate} with the selection bookkeeping the
 * forms need: remembers the freshly created employee and returns the display
 * name to use while that id is selected but the workspace snapshot has not
 * refetched the new option yet.
 */
export function useEmployeeInlineCreateSelection({
  roleId,
  createLabel,
  fields,
  errorMessage,
  selectedEmployeeId,
}: {
  roleId: string
  createLabel: string
  fields: EmployeeInlineCreateField[]
  errorMessage: string
  selectedEmployeeId: string
}): {
  createConfig: EmployeeInlineCreateConfig | undefined
  selectedDisplayValue: string | undefined
} {
  const createConfig = useEmployeeInlineCreate({ roleId, createLabel, fields, errorMessage })
  const [createdEmployee, setCreatedEmployee] = useState<{ id: string; name: string } | null>(null)

  const wrappedConfig: EmployeeInlineCreateConfig | undefined = createConfig
    ? {
        ...createConfig,
        onCreate: async (data) => {
          const created = await createConfig.onCreate(data)
          setCreatedEmployee(created)
          return created
        },
      }
    : undefined

  return {
    createConfig: wrappedConfig,
    selectedDisplayValue:
      selectedEmployeeId && createdEmployee?.id === selectedEmployeeId ? createdEmployee.name : undefined,
  }
}
