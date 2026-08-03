import type { Permission } from "./permissions";

/**
 * Public, denormalised view of a role with its full permission set.
 *
 * The deep module returns this shape to callers; the SQL adapter fills it
 * in by joining `role` → `role_permission`, while the in-memory adapter
 * is fed the same shape by tests. The interface is the seam — callers
 * never see the underlying tables.
 */
export type RoleWithPermissions = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: Permission[];
};

/**
 * Repository seam for role reads.
 *
 * The repository is intentionally narrow: a deep module wants a small
 * surface it can swap (Drizzle in production, in-memory in tests) without
 * dragging in the entire company.repository.
 */
export interface RoleRepository {
  findAll(): Promise<RoleWithPermissions[]>;
  findById(id: string): Promise<RoleWithPermissions | null>;
  findByKey(key: string): Promise<RoleWithPermissions | null>;
}

/**
 * Deep module for role queries.
 *
 * Hides the role + role_permission storage from callers. The public
 * surface is three read methods:
 *  - `list()` returns all roles (for the role management UI)
 *  - `getById(id)` for permission denial messages
 *  - `getByKey(key)` for seed lookups and tests
 *
 * Roles are immutable from this module's perspective; creating or editing
 * roles is out of scope for Slice 3. Mutation will live in a future
 * "Role management" surface, behind admin-only permissions.
 */
export class RoleModule {
  private readonly repository: RoleRepository;

  constructor(deps: { repository: RoleRepository }) {
    this.repository = deps.repository;
  }

  /**
   * List every role with its permissions, sorted by key for stable display
   * in the UI.
   */
  async list(): Promise<RoleWithPermissions[]> {
    const roles = await this.repository.findAll();
    return roles.sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * Find a single role by its database id. Returns null if missing.
   */
  async getById(id: string): Promise<RoleWithPermissions | null> {
    return this.repository.findById(id);
  }

  /**
   * Find a single role by its stable key (e.g. "admin", "manager",
   * "viewer"). Returns null if missing.
   */
  async getByKey(key: string): Promise<RoleWithPermissions | null> {
    return this.repository.findByKey(key);
  }
}
