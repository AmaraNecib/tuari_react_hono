import type { SessionUser } from "../session/session.types";

export const auditEntityTypes = [
  "ROLE",
  "EMPLOYEE",
  "PROJECT",
  "WAREHOUSE",
  "EMPLOYEE_MANAGER_ASSIGNMENT",
  "EMPLOYEE_PROJECT_ASSIGNMENT",
] as const;

export const auditActionTypes = [
  "CREATED",
  "UPDATED",
  "STATUS_CHANGED",
  "SOFT_DELETED",
  "MANAGER_ASSIGNED",
  "MANAGER_REASSIGNED",
  "MANAGER_UNASSIGNED",
  "PROJECT_ASSIGNED",
  "PROJECT_REASSIGNED",
  "PROJECT_UNASSIGNED",
  "PROJECT_MANAGER_ASSIGNED",
  "PROJECT_MANAGER_REASSIGNED",
  "PROJECT_MANAGER_UNASSIGNED",
  "WAREHOUSE_MANAGER_ASSIGNED",
  "WAREHOUSE_MANAGER_REASSIGNED",
  "WAREHOUSE_MANAGER_UNASSIGNED",
] as const;

export type AuditEntityType = (typeof auditEntityTypes)[number];
export type AuditActionType = (typeof auditActionTypes)[number];
export type AuditSnapshot = Record<string, unknown>;

export type AuditLog = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  actionType: AuditActionType;
  summaryKey: string;
  actorUser: SessionUser | null;
  occurredAt: string;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  metadata: AuditSnapshot | null;
};

export type AuditLogListFilters = {
  entityType?: AuditEntityType;
  entityId?: string;
  actorUserId?: string;
  limit?: number;
};
