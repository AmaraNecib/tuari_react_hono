import type { RoleRecord } from "../../company/company.types";
import type { RoleRepository } from "../employee.repository";

/**
 * In-memory implementation of RoleRepository for testing.
 *
 * Roles are seeded directly in tests (bypassing the repository).
 * Production roles will be managed by a separate RoleModule.
 */
export class InMemoryRoleRepository implements RoleRepository {
  private readonly store = new Map<string, RoleRecord>();

  async findById(id: string): Promise<RoleRecord | null> {
    return this.store.get(id) ?? null;
  }

  /**
   * Test helper: seed a role directly into the store.
   * Not part of the RoleRepository interface - only used in tests.
   */
  seed(role: RoleRecord): void {
    this.store.set(role.id, role);
  }
}
