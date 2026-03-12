import type {
  AuditActionType,
  AuditEntityType,
  AuditLog,
  AuditLogListFilters,
  AuditSnapshot,
} from "./audit-log.entity";

export type AuditLogWriteInput = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  actionType: AuditActionType;
  summaryKey: string;
  actorUserId: string | null;
  occurredAt: Date;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  metadata: AuditSnapshot | null;
  createdAt: Date;
};

export interface AuditLogRepository {
  list(filters?: AuditLogListFilters): Promise<AuditLog[]>;
  create(input: AuditLogWriteInput): Promise<AuditLog>;
}
