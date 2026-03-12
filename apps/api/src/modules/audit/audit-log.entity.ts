import type { SessionUser } from "../session/session.types";

export const auditEntityTypes = [
  "WORKER",
  "PROJECT",
  "WAREHOUSE",
  "SALARY_TRANSACTION",
] as const;

export const auditActionTypes = [
  "CREATED",
  "UPDATED",
  "STATUS_CHANGED",
  "MANAGER_CHANGED",
  "PROJECT_CHANGED",
  "SALARY_CHANGED",
  "SOFT_DELETED",
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
