import { randomUUID } from "node:crypto";

import type {
  AuditActionType,
  AuditEntityType,
  AuditSnapshot,
} from "./audit-log.entity";
import type { AuditLogRepository } from "./audit-log.repository";

export type RecordAuditLogInput = {
  entityType: AuditEntityType;
  entityId: string;
  actionType: AuditActionType;
  summaryKey: string;
  actorUserId: string | null;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
  metadata?: AuditSnapshot | null;
  occurredAt?: Date;
};

export function recordAuditLog(
  repository: AuditLogRepository,
  input: RecordAuditLogInput,
) {
  const occurredAt = input.occurredAt ?? new Date();

  return repository.create({
    id: randomUUID(),
    entityType: input.entityType,
    entityId: input.entityId,
    actionType: input.actionType,
    summaryKey: input.summaryKey,
    actorUserId: input.actorUserId,
    occurredAt,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? null,
    createdAt: occurredAt,
  });
}
