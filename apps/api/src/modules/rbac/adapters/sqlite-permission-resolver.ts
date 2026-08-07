/**
 * SqlitePermissionResolver — Drizzle-backed PermissionResolverPort adapter.
 *
 * Resolves user permissions by joining role_permission → employee → user.
 * Bootstrap owners get all permissions regardless of employee record.
 *
 * Takes a pre-built `AppDrizzle` instance (created once at the composition
 * root) rather than a raw SQLite handle — the resolver never touches the
 * underlying better-sqlite3 connection directly.
 */
import { eq } from "drizzle-orm";
import * as schema from "../../../schema";
import type { AppDrizzle } from "../../../infrastructure/database/drizzle";
import type { Permission } from "../permissions";
import { ALL_PERMISSIONS, isPermission } from "../permissions";
import type { PermissionResolverPort } from "../permission-resolver.types";

type AuthBootstrapGateway = {
  isBootstrapOwner: (userId: string) => Promise<boolean>;
};

/**
 * Resolve user permissions from the database.
 * Uses Drizzle for the role_permission → employee → user join.
 */
export class SqlitePermissionResolver implements PermissionResolverPort {
  constructor(
    private readonly db: AppDrizzle,
    private readonly authBootstrap: AuthBootstrapGateway,
  ) {}

  /**
   * Get all permissions for a user.
   * Bootstrap owners get all permissions. Otherwise, permissions are
   * resolved from the user's employee role via role_permission table.
   */
  async getPermissionsForUserId(userId: string): Promise<Permission[]> {
    // Bootstrap owners get all permissions regardless of employee record
    if (await this.authBootstrap.isBootstrapOwner(userId)) {
      return [...ALL_PERMISSIONS];
    }

    // Query: role_permission → employee → user join
    const rows = this.db
      .select({ permission: schema.rolePermission.permission })
      .from(schema.rolePermission)
      .innerJoin(schema.employee, eq(schema.rolePermission.roleId, schema.employee.roleId))
      .innerJoin(schema.user, eq(schema.user.phoneNumber, schema.employee.phone))
      .where(eq(schema.user.id, userId))
      .all();

    // Deduplicate permissions (multiple roles could grant the same
    // permission) and drop rows that fail the `isPermission` guard
    // (legacy dot-form, stale removed permissions, multi-colon strings) —
    // consistent with the role repository's read path (#266).
    const uniquePermissions = new Set<string>();
    for (const row of rows) {
      if (isPermission(row.permission)) uniquePermissions.add(row.permission);
    }
    return [...uniquePermissions] as Permission[];
  }
}
