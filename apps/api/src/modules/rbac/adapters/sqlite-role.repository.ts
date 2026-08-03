/**
 * SqliteRoleRepository — Drizzle-backed implementation of `RoleRepository`.
 *
 * Reads roles and their permissions from the `role` and `role_permission`
 * tables via a single LEFT JOIN, then groups in memory to produce the
 * denormalised `RoleWithPermissions` shape the deep module exposes.
 */
import { eq, asc } from "drizzle-orm";

import * as schema from "../../../schema";
import type { AppDrizzle } from "../../../infrastructure/database/drizzle";
import type { Permission } from "../permissions";
import { isPermission } from "../permissions";
import type { RoleRepository, RoleWithPermissions } from "../role.module";

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: number;
  createdAt: string;
  updatedAt: string;
  permission: string | null;
};

export class SqliteRoleRepository implements RoleRepository {
  private readonly db: AppDrizzle;

  constructor(drizzleDb: AppDrizzle) {
    this.db = drizzleDb;
  }

  async findAll(): Promise<RoleWithPermissions[]> {
    const rows = this.db
      .select({
        id: schema.role.id,
        key: schema.role.key,
        name: schema.role.name,
        description: schema.role.description,
        isSystem: schema.role.isSystem,
        createdAt: schema.role.createdAt,
        updatedAt: schema.role.updatedAt,
        permission: schema.rolePermission.permission,
      })
      .from(schema.role)
      .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
      .orderBy(asc(schema.role.key), asc(schema.rolePermission.permission))
      .all() as RoleRow[];

    return groupRoles(rows);
  }

  async findById(id: string): Promise<RoleWithPermissions | null> {
    const rows = this.db
      .select({
        id: schema.role.id,
        key: schema.role.key,
        name: schema.role.name,
        description: schema.role.description,
        isSystem: schema.role.isSystem,
        createdAt: schema.role.createdAt,
        updatedAt: schema.role.updatedAt,
        permission: schema.rolePermission.permission,
      })
      .from(schema.role)
      .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
      .where(eq(schema.role.id, id))
      .all() as RoleRow[];

    return groupRoles(rows)[0] ?? null;
  }

  async findByKey(key: string): Promise<RoleWithPermissions | null> {
    const rows = this.db
      .select({
        id: schema.role.id,
        key: schema.role.key,
        name: schema.role.name,
        description: schema.role.description,
        isSystem: schema.role.isSystem,
        createdAt: schema.role.createdAt,
        updatedAt: schema.role.updatedAt,
        permission: schema.rolePermission.permission,
      })
      .from(schema.role)
      .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
      .where(eq(schema.role.key, key))
      .all() as RoleRow[];

    return groupRoles(rows)[0] ?? null;
  }
}

/**
 * Group a flat list of (role, permission) rows into one
 * `RoleWithPermissions` record per role.
 *
 * Rows where `permission` is null (LEFT JOIN miss) are ignored — that
 * role simply has no permission rows yet. Permission strings that fail
 * the `isPermission` type-guard (legacy dot-separated values) are
 * silently skipped: a defensive normalisation layer rewrites them to
 * colon form during the migration, so a stray dot row is best treated
 * as already-superseded data.
 */
function groupRoles(rows: RoleRow[]): RoleWithPermissions[] {
  const grouped = new Map<string, RoleWithPermissions>();

  for (const row of rows) {
    let entry = grouped.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        isSystem: row.isSystem === 1,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        permissions: [],
      };
      grouped.set(row.id, entry);
    }

    if (row.permission && isPermission(row.permission)) {
      entry.permissions.push(row.permission as Permission);
    }
  }

  return Array.from(grouped.values());
}
