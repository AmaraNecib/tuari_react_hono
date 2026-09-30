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
