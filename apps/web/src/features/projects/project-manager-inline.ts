import { useTranslation } from "react-i18next"

import { useEmployeeInlineCreateSelection } from "@/features/employees/use-employee-inline-create"

/**
 * Project-form view of the shared inline-employee-create wiring: the project
 * manager labels plus the `project_manager` role the create dialog must send.
 * Both the create and edit pages use this so the two stay identical.
 */
export function useProjectManagerInlineCreateSelection({
  projectManagerRoleId,
  selectedManagerId,
}: {
  projectManagerRoleId: string
  selectedManagerId: string
}) {
  const { t } = useTranslation()

  return useEmployeeInlineCreateSelection({
    roleId: projectManagerRoleId,
    createLabel: t("detailPages.project.createManager"),
    errorMessage: t("detailPages.project.validation.managerCreateError"),
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
    selectedEmployeeId: selectedManagerId,
  })
}
