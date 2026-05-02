import type { SystemLogEntry } from "@tuari/contracts"

import type { WorkspaceSidebarPage } from "./workspace-sidebar"

export type HomeViewPage = WorkspaceSidebarPage

export type PendingDelete = {
  section: "projects" | "roles" | "warehouses"
  id: string
  label: string
}

export type FormErrors = {
  name?: string
  phone?: string
  password?: string
  setupSecret?: string
}

export type HomeViewSystemLogFilters = {
  actionType?: SystemLogEntry["actionType"]
  actorQuery?: string
  actorUserId?: string
  entityType?: SystemLogEntry["entityType"]
  fromDate?: string
  toDate?: string
}
