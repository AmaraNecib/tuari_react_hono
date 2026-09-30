import { useState } from "react"
import { useTranslation } from "react-i18next"

import { AppMutationError, useCreateEmployeesBatchMutation } from "@/features/app-shell/mock-dashboard"

/**
 * The "create a manager from the project form" wiring, shared by the project
 * create and edit pages.
 *
 * `CreateableSelect` is the same component the warehouse form uses; the only
 * project-specific parts are the field labels and the role the new employee is
 * given. Keeping the mutation call here (rather than in each page) is what
 * makes both entry points behave identically and keeps the form presentational.
 */
export type ManagerInlineCreateConfig = {
  createLabel: string
  fields: Array<{ key: string; label: string; placeholder?: string; required?: boolean }>
  onCreate: (data: Record<string, string>) => Promise<{ id: string; name: string }>
}

/**
 * Builds the inline-create config for a project manager.
 *
 * Returns `undefined` when the `project_manager` role id is unavailable so the
 * form hides the create option instead of offering a create that the API would
 * reject (the role id is required by the create contract and by
 * `requireAssignableEmployeeRole`).
 */
export function useProjectManagerInlineCreate(
  projectManagerRoleId: string,
): ManagerInlineCreateConfig | undefined {
  const { t } = useTranslation()
  const createEmployeeMutation = useCreateEmployeesBatchMutation()

  if (!projectManagerRoleId) {
    return undefined
  }

  return {
    createLabel: t("detailPages.project.createManager"),
    fields: [
      {
        key: "firstName",
        label: t("detailPages.debt.employeeFields.firstName"),
        placeholder: t("detailPages.debt.employeeFields.firstNamePlaceholder"),
        required: true,
      },
      {
        key: "lastName",
        label: t("detailPages.debt.employeeFields.lastName"),
        placeholder: t("detailPages.debt.employeeFields.lastNamePlaceholder"),
        required: true,
      },
      {
        key: "phone",
        label: t("detailPages.debt.employeeFields.phone"),
        placeholder: t("detailPages.debt.employeeFields.phonePlaceholder"),
        required: true,
      },
    ],
    onCreate: async (data) => {
      try {
        const result = await createEmployeeMutation.mutateAsync({
          employees: [
            {
              firstName: data.firstName ?? "",
              lastName: data.lastName ?? "",
              phone: data.phone ?? "",
              roleId: projectManagerRoleId,
              status: "ACTIVE",
              managerId: null,
              salaryAmountDzd: null,
              salaryPeriod: null,
              notes: null,
            },
          ],
        })

        const employee = result.employees[0]

        if (!employee) {
          throw new Error(t("detailPages.project.validation.managerCreateError"))
        }

        return { id: employee.id, name: `${employee.firstName} ${employee.lastName}` }
      } catch (error) {
        // Server entity failures already carry a localized (Arabic) message.
        // Anything else — wire validation, network — must not surface a raw
        // English message in the dialog.
        throw error instanceof AppMutationError
          ? error
          : new Error(t("detailPages.project.validation.managerCreateError"))
      }
    },
  }
}

/**
 * Wraps {@link useProjectManagerInlineCreate} with the selection bookkeeping
 * both project pages need: remembers the freshly created manager and returns
 * the display name to use while that id is selected but the workspace snapshot
 * has not refetched the new option yet.
 */
export function useManagerInlineCreateSelection({
  projectManagerRoleId,
  selectedManagerId,
}: {
  projectManagerRoleId: string
  selectedManagerId: string
}): {
  managerCreate: ManagerInlineCreateConfig | undefined
  managerDisplayValue: string | undefined
} {
  const managerCreate = useProjectManagerInlineCreate(projectManagerRoleId)
  const [createdManager, setCreatedManager] = useState<{ id: string; name: string } | null>(null)

  const wrappedCreate: ManagerInlineCreateConfig | undefined = managerCreate
    ? {
        ...managerCreate,
        onCreate: async (data) => {
          const created = await managerCreate.onCreate(data)
          setCreatedManager(created)
          return created
        },
      }
    : undefined

  return {
    managerCreate: wrappedCreate,
    managerDisplayValue:
      selectedManagerId && createdManager?.id === selectedManagerId ? createdManager.name : undefined,
  }
}
