import type { Permission } from "./permissions";
import type Database from "better-sqlite3";

export class SqlitePermissionResolver {
  constructor(private readonly db: Database.Database) {}

  async getPermissionsForUserId(userId: string): Promise<Permission[]> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT rp.permission
         FROM role_permission rp
         INNER JOIN employee e ON e.role_id = rp.role_id
         INNER JOIN "user" u ON u."phoneNumber" = e.phone
         WHERE u.id = ?`,
      )
      .all(userId) as { permission: string }[];

    return rows.map((row) => row.permission as Permission);
  }
}
