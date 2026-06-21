import type { RoleRecord } from "../../company/company.types";
import type { RoleRepository } from "../employee.repository";

/**
 * In-memory implementation of RoleRepository for testing.
 */
export class InMemoryRoleRepository implements RoleRepository {
  private readonly store = new Map<string, RoleRecord>();

  async findById(id: string): Promise<RoleRecord | null> {
    return this.store.get(id) ?? null;
  }

  async save(role: RoleRecord): Promise<void> {
    this.store.set(role.id, role);
  }
}
