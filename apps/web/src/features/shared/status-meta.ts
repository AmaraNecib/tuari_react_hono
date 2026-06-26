import { i18n } from "@/i18n"

/** Returns CSS tone class for a status value. */
export function getStatusTone(status: string) {
  if (status === "ACTIVE") {
    return "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-400/14 dark:text-emerald-200"
  }

  if (status === "LEFT" || status === "ARCHIVED") {
    return "bg-slate-500/12 text-slate-700 ring-slate-500/20 dark:bg-slate-400/14 dark:text-slate-200"
  }

  return "bg-amber-500/12 text-amber-700 ring-amber-500/20 dark:bg-amber-400/14 dark:text-amber-100"
}

const statusLabelKeys: Record<string, string> = {
  ACTIVE: "status.active",
  INACTIVE: "status.inactive",
  LEFT: "status.left",
  STOPPED: "status.stopped",
  COMPLETED: "status.completed",
  ARCHIVED: "status.archived",
  ENDED: "status.ended",
}

/** Returns the Arabic label for a status value. */
export function getArabicStatusLabel(status: string) {
  return statusLabelKeys[status]
    ? i18n.t(statusLabelKeys[status])
    : i18n.t("detailPages.shared.unexpectedValue", { value: status })
}

const historyEventLabelKeys: Record<string, string> = {
  CREATED: "historyEvent.created",
  UPDATED: "historyEvent.updated",
}

const systemRoleLabelKeys: Record<string, string> = {
  worker: "systemRoles.worker",
  project_manager: "systemRoles.projectManager",
  warehouse_manager: "systemRoles.warehouseManager",
}

export function getArabicHistoryEventLabel(eventType: string) {
  return historyEventLabelKeys[eventType]
    ? i18n.t(historyEventLabelKeys[eventType])
    : i18n.t("detailPages.shared.unexpectedValue", { value: eventType })
}

export function getArabicRoleLabel(role: { key: string; name: string } | null | undefined) {
  if (!role) {
    return i18n.t("detailPages.shared.activeRoleMissing")
  }

  const translationKey = systemRoleLabelKeys[role.key]
  return translationKey ? i18n.t(translationKey) : role.name
}
