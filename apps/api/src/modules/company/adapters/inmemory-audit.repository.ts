/**
 * In-memory AuditRepository for tests and the InMemory adapter.
 */

import type { AuditRepository } from "../audit.repository";
import type { AuthUserDisplayRecord, InventoryItemDefinitionAuditRecord, UserProfileHistoryRecord } from "../company.types";
import { InMemoryStore } from "./inmemory-store";

export class InMemoryAuditRepository implements AuditRepository {
  constructor(private readonly store: InMemoryStore) {}

  isBootstrapOwner(userId: string): boolean {
    const state = Array.from(this.store.bootstrapState.values()).find((s) => s.singleton === 1);
    if (state?.userId) return state.userId === userId;
    // Fall back to the first created user.
    const users = Array.from(this.store.users.values()).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return users[0]?.id === userId;
  }

  getAuthUserById(id: string): AuthUserDisplayRecord | null {
    const u = this.store.users.get(id);
    if (!u) return null;
    return { id: u.id, name: u.name ?? null, phone: u.phoneNumber ?? null };
  }

  listUserProfileHistory(): UserProfileHistoryRecord[] {
    return Array.from(this.store.userProfileHistory.values());
  }

  listInventoryItemDefinitionsForLog(): InventoryItemDefinitionAuditRecord[] {
    return [];
  }
}
