import type { EmployeeRecord } from "../../company/company.types";
import { decodeCursor, encodeCursor } from "../../shared/cursor";
import type { EmployeeFilters, EmployeePagedQuery, EmployeePagedResult, EmployeeRepository } from "../employee.repository";

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

    const needle = filters.search?.trim().toLowerCase();

    return all.filter((employee) => {
      if (filters.status && employee.status !== filters.status) return false;
      if (filters.roleId && employee.roleId !== filters.roleId) return false;
      if (needle) {
        const haystack = `${employee.firstName} ${employee.lastName} ${employee.phone}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }

  async findPaged(options: EmployeePagedQuery): Promise<EmployeePagedResult> {
    const all = await this.findAll(options.filters);
    // Sort by createdAt DESC, id DESC. This matches the production SQL index
    // so behavior is identical between adapters.
    const sorted = all
      .slice()
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) {
          return a.createdAt < b.createdAt ? 1 : -1;
        }
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      });

    let startIndex = 0;
    if (options.cursor !== undefined) {
      const cursor = decodeCursor(options.cursor);
      // Find the first item strictly past the cursor in sort order.
      startIndex = sorted.findIndex(
        (record) => record.createdAt < cursor.createdAt
          || (record.createdAt === cursor.createdAt && record.id < cursor.id),
      );
      if (startIndex < 0) startIndex = sorted.length;
    }

    const slice = sorted.slice(startIndex, startIndex + options.limit);
    const hasMore = startIndex + slice.length < sorted.length;
    const last = slice[slice.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return {
      items: slice,
      total: sorted.length,
      nextCursor,
    };
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
