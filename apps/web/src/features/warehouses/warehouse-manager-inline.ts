import { useTranslation } from "react-i18next"

import { useEmployeeInlineCreateSelection } from "@/features/employees/use-employee-inline-create"

/**
 * Warehouse-form view of the shared inline-employee-create wiring: the
 * warehouse manager labels plus the `warehouse_manager` role the create dialog
 * must send. Both the create and edit pages use this so the two stay identical.
 *
 * `warehouse_manager` (not `worker`) is the correct seeded role here: the API
 * rejects an ACTIVE worker that has no project and no direct manager, and the
 * warehouse form does not collect either. A warehouse manager has no such
 * required relations.
 */
export function useWarehouseManagerInlineCreateSelection({
  warehouseManagerRoleId,
  selectedManagerId,
}: {
  warehouseManagerRoleId: string
  selectedManagerId: string
}) {
  const { t } = useTranslation()

  return useEmployeeInlineCreateSelection({
    roleId: warehouseManagerRoleId,
    createLabel: t("detailPages.warehouse.createManager"),
    errorMessage: t("detailPages.warehouse.validation.managerCreateError"),
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
