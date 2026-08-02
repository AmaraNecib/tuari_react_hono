import type { Permission } from "./permissions";

/**
 * PermissionResolverPort — resolves a user's effective RBAC permissions.
 *
 * The seam between permission consumers (e.g. SessionService) and storage
 * adapters (e.g. SqlitePermissionResolver, a future in-memory resolver).
 * Consumers depend on this interface, never on a concrete adapter.
 */
export interface PermissionResolverPort {
  getPermissionsForUserId(userId: string): Promise<Permission[]>;
}
