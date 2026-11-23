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
        label: t("common.employeeFields.firstName"),
        placeholder: t("common.employeeFields.firstNamePlaceholder"),
        required: true,
      },
      {
        key: "lastName",
        label: t("common.employeeFields.lastName"),
        placeholder: t("common.employeeFields.lastNamePlaceholder"),
        required: true,
      },
      {
        key: "phone",
        label: t("common.employeeFields.phone"),
        placeholder: t("common.employeeFields.phonePlaceholder"),
        required: true,
      },
    ],
    selectedEmployeeId: selectedManagerId,
  })
}
