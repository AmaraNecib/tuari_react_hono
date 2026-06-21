import type { EmployeeRecord, RoleRecord } from "../company/company.types";
import type { Cursor } from "../shared/cursor";

/**
 * The repository interface for employees.
 *
 * This is the seam between the EmployeeModule and the data layer.
 * Production code uses DrizzleEmployeeRepository, tests use InMemoryEmployeeRepository.
 *
 * This interface is intentionally small - it exposes only the operations
 * the module needs. Complex queries should be added here only when the
 * module actually needs them.
 */
export interface EmployeeRepository {
  findById(id: string): Promise<EmployeeRecord | null>;
  findAll(filters?: EmployeeFilters): Promise<EmployeeRecord[]>;
  findPaged(options: EmployeePagedQuery): Promise<EmployeePagedResult>;
  findByPhone(phone: string): Promise<EmployeeRecord | null>;
  save(employee: EmployeeRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface EmployeeFilters {
  status?: EmployeeRecord["status"];
  roleId?: string;
}

/**
 * Input for the paginated employee query.
 *
 * The cursor is opaque (produced by `encodeCursor`). Filters are applied
 * BEFORE pagination so the total reflects the filtered set.
 */
export type EmployeePagedQuery = {
  filters?: EmployeeFilters;
  cursor?: string;
  limit: number;
};

/**
 * Paginated result from the employee query.
 *
 * - `items` are the records on this page (sorted createdAt DESC, id DESC)
 * - `total` is the total matching the filter (NOT the page count)
 * - `nextCursor` is null on the last page
 */
export type EmployeePagedResult = {
  items: EmployeeRecord[];
  total: number;
  nextCursor: string | null;
};

/**
 * The repository interface for roles.
 *
 * The EmployeeModule only needs to look up roles to validate that
 * an employee's roleId refers to an existing role. Role CRUD
 * (create, update, delete) is handled by a separate RoleModule
 * (future work).
 */
export interface RoleRepository {
  findById(id: string): Promise<RoleRecord | null>;
}

// Re-export the Cursor type for repository implementations that need it.
export type { Cursor };
