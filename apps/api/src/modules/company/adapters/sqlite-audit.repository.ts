import type { AuditRepository } from "../audit.repository";
import type { SqliteCompanyRepository } from "../sqlite-company.repository";
import type { AuthUserDisplayRecord, InventoryItemDefinitionAuditRecord, UserProfileHistoryRecord } from "../company.types";

export class SqliteAuditRepository implements AuditRepository {
  constructor(private readonly inner: SqliteCompanyRepository) {}
  isBootstrapOwner(userId: string): boolean { return this.inner.isBootstrapOwner(userId); }
  getAuthUserById(id: string): AuthUserDisplayRecord | null { return this.inner.getAuthUserById(id); }
  listUserProfileHistory(): UserProfileHistoryRecord[] { return this.inner.listUserProfileHistory(); }
  listInventoryItemDefinitionsForLog(): InventoryItemDefinitionAuditRecord[] { return this.inner.listInventoryItemDefinitionsForLog(); }
}
