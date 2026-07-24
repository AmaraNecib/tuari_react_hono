/**
 * Audit repository interface.
 *
 * Owns the data-access seam for the audit domain: bootstrap owner
 * check, auth user lookup, user profile history, and inventory item
 * definitions for the audit log.
 */

import type {
  AuthUserDisplayRecord,
  InventoryItemDefinitionAuditRecord,
  UserProfileHistoryRecord,
} from "./company.types";

export interface AuditRepository {
  /** Returns true if the user is the bootstrap owner (the first user). */
  isBootstrapOwner(userId: string): boolean;

  /** Returns the auth user display record (name, phone) for log rendering. */
  getAuthUserById(id: string): AuthUserDisplayRecord | null;

  /** Lists all user profile history entries (for the system log). */
  listUserProfileHistory(): UserProfileHistoryRecord[];

  /** Lists all inventory item definitions (for the system log). */
  listInventoryItemDefinitionsForLog(): InventoryItemDefinitionAuditRecord[];
}
