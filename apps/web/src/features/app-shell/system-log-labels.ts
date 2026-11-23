import type { SystemLogEntry } from "@tuari/contracts"

export function getActionTypeLabel(t: (key: string) => string, actionType: SystemLogEntry["actionType"]) {
  const map: Record<SystemLogEntry["actionType"], string> = {
    ACCOUNT_UPDATED: t("systemLog.accountUpdated"),
    DEBT_ACCOUNT_CREATED: t("systemLog.debtAccountCreated"),
    DEBT_ENTRY_RECORDED: t("systemLog.debtEntryRecorded"),
    DEBT_SETTLED: t("systemLog.debtSettled"),
    EMPLOYEE_CREATED: t("systemLog.employeeCreated"),
    EMPLOYEE_UPDATED: t("systemLog.employeeUpdated"),
    INVENTORY_ITEM_CREATED: t("systemLog.inventoryItemCreated"),
    PROJECT_MANAGER_CHANGED: t("systemLog.projectManagerChanged"),
    SALARY_PAYMENT_RECORDED: t("systemLog.salaryPaymentRecorded"),
    WAREHOUSE_MANAGER_CHANGED: t("systemLog.warehouseManagerChanged"),
    WORKPLACE_ASSIGNED: t("systemLog.workplaceAssigned"),
  }

  return map[actionType]
}

export function getEntityTypeLabel(t: (key: string) => string, entityType: SystemLogEntry["entityType"]) {
  const map: Record<SystemLogEntry["entityType"], string> = {
    ACCOUNT: t("systemLog.entityAccount"),
    DEBT_ACCOUNT: t("systemLog.entityDebtAccount"),
    DEBT_ENTRY: t("systemLog.entityDebtEntry"),
    EMPLOYEE: t("systemLog.entityEmployee"),
    EXTERNAL_COUNTERPARTY: t("systemLog.entityExternalCounterparty"),
    INVENTORY_ITEM: t("systemLog.entityInventoryItem"),
    MANAGER_ASSIGNMENT: t("systemLog.entityManagerAssignment"),
    PROJECT: t("systemLog.entityProject"),
    PROJECT_ASSIGNMENT: t("systemLog.entityProjectAssignment"),
    SALARY_PAYMENT: t("systemLog.entitySalaryPayment"),
    WAREHOUSE: t("systemLog.entityWarehouse"),
    WAREHOUSE_ASSIGNMENT: t("systemLog.entityWarehouseAssignment"),
  }

  return map[entityType]
}

