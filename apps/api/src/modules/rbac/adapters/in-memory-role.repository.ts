import type { Permission } from "../permissions";
import type { RoleRepository, RoleWithPermissions } from "../role.module";

/**
 * In-memory implementation of `RoleRepository` for unit tests.
 *
 * Test code seeds the store directly via `seed()`. Production code uses
 * `SqliteRoleRepository` (in `apps/api/src/modules/rbac/adapters/sqlite-role.repository.ts`).
 */
export class InMemoryRoleRepository implements RoleRepository {
  private readonly store = new Map<string, RoleWithPermissions>();

  async findAll(): Promise<RoleWithPermissions[]> {
    return Array.from(this.store.values()).map((role) => ({
      ...role,
      permissions: [...role.permissions] as Permission[],
    }));
  }

  async findById(id: string): Promise<RoleWithPermissions | null> {
    const role = this.store.get(id);
    if (!role) return null;
    return { ...role, permissions: [...role.permissions] as Permission[] };
  }

  async findByKey(key: string): Promise<RoleWithPermissions | null> {
    for (const role of this.store.values()) {
      if (role.key === key) {
        return { ...role, permissions: [...role.permissions] as Permission[] };
      }
    }
    return null;
  }

  /**
   * Test helper: insert a role directly. Not part of the public repository
   * contract.
   */
  seed(role: RoleWithPermissions): void {
    this.store.set(role.id, { ...role, permissions: [...role.permissions] as Permission[] });
  }
}
