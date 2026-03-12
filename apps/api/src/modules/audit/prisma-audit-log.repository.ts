import { Prisma } from "@prisma/client";

import type { DatabaseClient } from "../shared/database-client";
import type {
  AuditActionType,
  AuditEntityType,
  AuditLog,
  AuditLogListFilters,
  AuditSnapshot,
} from "./audit-log.entity";
import type { AuditLogRepository, AuditLogWriteInput } from "./audit-log.repository";

const auditLogInclude = {
  actorUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.AuditLogInclude;

type AuditLogRow = Prisma.AuditLogGetPayload<{
  include: typeof auditLogInclude;
}>;

const toAuditSnapshot = (value: Prisma.JsonValue | null): AuditSnapshot | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AuditSnapshot;
};

const toAuditLog = (row: AuditLogRow): AuditLog => ({
  id: row.id,
  entityType: row.entityType as AuditEntityType,
  entityId: row.entityId,
  actionType: row.actionType as AuditActionType,
  summaryKey: row.summaryKey,
  actorUser: row.actorUser
    ? {
        id: row.actorUser.id,
        name: row.actorUser.name,
        email: row.actorUser.email,
      }
    : null,
  occurredAt: row.occurredAt.toISOString(),
  before: toAuditSnapshot(row.beforeJson),
  after: toAuditSnapshot(row.afterJson),
  metadata: toAuditSnapshot(row.metadataJson),
});

const toJsonValue = (value: AuditSnapshot | null) => {
  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
};

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DatabaseClient) {}

  withClient(db: DatabaseClient): PrismaAuditLogRepository {
    return new PrismaAuditLogRepository(db);
  }

  async list(filters?: AuditLogListFilters): Promise<AuditLog[]> {
    const rows = await this.db.auditLog.findMany({
      where: {
        entityType: filters?.entityType,
        entityId: filters?.entityId,
        actorUserId: filters?.actorUserId,
      },
      include: auditLogInclude,
      orderBy: {
        occurredAt: "desc",
      },
      take: filters?.limit ?? 100,
    });

    return rows.map(toAuditLog);
  }

  async create(input: AuditLogWriteInput): Promise<AuditLog> {
    const created = await this.db.auditLog.create({
      data: {
        id: input.id,
        entityType: input.entityType,
        entityId: input.entityId,
        actionType: input.actionType,
        summaryKey: input.summaryKey,
        actorUserId: input.actorUserId,
        occurredAt: input.occurredAt,
        beforeJson: toJsonValue(input.before),
        afterJson: toJsonValue(input.after),
        metadataJson: toJsonValue(input.metadata),
        createdAt: input.createdAt,
      },
    });

    const row = await this.db.auditLog.findUniqueOrThrow({
      where: {
        id: created.id,
      },
      include: auditLogInclude,
    });

    return toAuditLog(row);
  }
}
