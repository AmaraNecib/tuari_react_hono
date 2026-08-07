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

/**
 * Shared projection for the role LEFT JOIN — one definition so a schema
 * change cannot silently drift one reader out of sync with the others.
 */
const ROLE_FIELDS = {
  id: schema.role.id,
  key: schema.role.key,
  name: schema.role.name,
  description: schema.role.description,
  isSystem: schema.role.isSystem,
  createdAt: schema.role.createdAt,
  updatedAt: schema.role.updatedAt,
  permission: schema.rolePermission.permission,
};

export class SqliteRoleRepository implements RoleRepository {
  private readonly db: AppDrizzle;

  constructor(drizzleDb: AppDrizzle) {
    this.db = drizzleDb;
  }

  async findAll(): Promise<RoleWithPermissions[]> {
    const rows = this.db
      .select(ROLE_FIELDS)
      .from(schema.role)
      .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
      .orderBy(asc(schema.role.key), asc(schema.rolePermission.permission))
      .all() as RoleRow[];

    return groupRoles(rows);
  }

  async findById(id: string): Promise<RoleWithPermissions | null> {
    const rows = this.db
      .select(ROLE_FIELDS)
      .from(schema.role)
      .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
      .where(eq(schema.role.id, id))
      .orderBy(asc(schema.rolePermission.permission))
      .all() as RoleRow[];

    return groupRoles(rows)[0] ?? null;
  }

  async findByKey(key: string): Promise<RoleWithPermissions | null> {
    const rows = this.db
      .select(ROLE_FIELDS)
      .from(schema.role)
      .leftJoin(schema.rolePermission, eq(schema.rolePermission.roleId, schema.role.id))
      .where(eq(schema.role.key, key))
      .orderBy(asc(schema.rolePermission.permission))
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
 *
 * Repeated `(role, permission)` rows collapse to a single entry
 * (first-seen order preserved, matching the query ORDER BY):
 * `role_permission` has a surrogate id primary key and no
 * (role_id, permission) uniqueness constraint, so duplicates can exist
 * at rest and must not surface as duplicate permissions in the UI.
 */
function groupRoles(rows: RoleRow[]): RoleWithPermissions[] {
  const grouped = new Map<
    string,
    { role: RoleWithPermissions; seenPermissions: Set<string> }
  >();

  for (const row of rows) {
    let bucket = grouped.get(row.id);
    if (!bucket) {
      bucket = {
        role: {
          id: row.id,
          key: row.key,
          name: row.name,
          description: row.description,
          isSystem: row.isSystem === 1,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          permissions: [],
        },
        seenPermissions: new Set<string>(),
      };
      grouped.set(row.id, bucket);
    }

    if (
      row.permission &&
      isPermission(row.permission) &&
      !bucket.seenPermissions.has(row.permission)
    ) {
      bucket.seenPermissions.add(row.permission);
      bucket.role.permissions.push(row.permission as Permission);
    }
  }

  return Array.from(grouped.values()).map((bucket) => bucket.role);
}
