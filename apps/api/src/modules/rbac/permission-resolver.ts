/**
 * SqlitePermissionResolver — Drizzle-backed implementation.
 *
 * Resolves user permissions by joining role_permission → employee → user.
 * Bootstrap owners get all permissions regardless of employee record.
 */
import { eq, and } from "drizzle-orm";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import * as schema from "../../schema";
import { createDrizzleFromSqlite, type AppDrizzle } from "../../infrastructure/database/drizzle";
import type { Permission } from "./permissions";
import { ALL_PERMISSIONS } from "./permissions";

type AuthBootstrapGateway = {
  isBootstrapOwner: (userId: string) => Promise<boolean>;
};

/**
 * Resolve user permissions from the database.
 * Uses Drizzle for the role_permission → employee → user join.
 */
export class SqlitePermissionResolver {
  private readonly db: AppDrizzle;

  constructor(
    rawDb: BetterSqliteDatabase | { exec: (sql: string) => void },
    private readonly authBootstrap: AuthBootstrapGateway,
    drizzleDb?: AppDrizzle,
  ) {
    this.db = drizzleDb ?? createDrizzleFromSqlite(rawDb as BetterSqliteDatabase);
  }

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

    // Deduplicate permissions (multiple roles could grant same permission)
    const uniquePermissions = new Set(rows.map((r) => r.permission as Permission));
    return [...uniquePermissions];
  }
}
