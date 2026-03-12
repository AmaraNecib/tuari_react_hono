import type { AuditEntityType, AuditLog, AuditLogListFilters } from "./audit-log.entity";
import type { AuditLogRepository } from "./audit-log.repository";

export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  list(filters?: AuditLogListFilters): Promise<AuditLog[]> {
    return this.repository.list(filters);
  }

  listForEntity(entityType: AuditEntityType, entityId: string): Promise<AuditLog[]> {
    return this.repository.list({
      entityType,
      entityId,
      limit: 200,
    });
  }
}
