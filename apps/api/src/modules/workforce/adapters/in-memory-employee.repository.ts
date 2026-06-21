import type { EmployeeRecord } from "../../company/company.types";
import type { EmployeeFilters, EmployeeRepository } from "../employee.repository";

/**
 * In-memory implementation of EmployeeRepository for testing.
 *
 * Stores employees in a Map. Does not enforce uniqueness beyond what
 * the module's business logic requires - the module is responsible for
 * validation.
 */
export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly store = new Map<string, EmployeeRecord>();

  async findById(id: string): Promise<EmployeeRecord | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filters?: EmployeeFilters): Promise<EmployeeRecord[]> {
    const all = Array.from(this.store.values());
    if (!filters) return all;

    return all.filter((employee) => {
      if (filters.status && employee.status !== filters.status) return false;
      if (filters.roleId && employee.roleId !== filters.roleId) return false;
      return true;
    });
  }

  async findByPhone(phone: string): Promise<EmployeeRecord | null> {
    for (const employee of this.store.values()) {
      if (employee.phone === phone) return employee;
    }
    return null;
  }

  async save(employee: EmployeeRecord): Promise<void> {
    this.store.set(employee.id, employee);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
