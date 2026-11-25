import { i18n } from "@/i18n"

/** Returns CSS tone class for a status value. */
export function getStatusTone(status: string) {
  if (status === "ACTIVE") {
    return "bg-good/12 text-good ring-good/20"
  }

  if (status === "LEFT" || status === "ARCHIVED") {
    return "bg-muted text-muted-foreground ring-border/20"
  }

  return "bg-warn/12 text-warn ring-warn/20"
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

/**
 * getArabicHistoryEventLabel(eventType component.
 */
export function getArabicHistoryEventLabel(eventType: string) {
  return historyEventLabelKeys[eventType]
    ? i18n.t(historyEventLabelKeys[eventType])
/**
 * getArabicRoleLabel(role component.
 */
    : i18n.t("detailPages.shared.unexpectedValue", { value: eventType })
}

export function getArabicRoleLabel(role: { key: string; name: string } | null | undefined) {
  if (!role) {
    return i18n.t("detailPages.shared.activeRoleMissing")
  }

  const translationKey = systemRoleLabelKeys[role.key]
  return translationKey ? i18n.t(translationKey) : role.name
}
