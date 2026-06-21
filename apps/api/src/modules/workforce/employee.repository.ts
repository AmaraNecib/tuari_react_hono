import type { EmployeeRecord, RoleRecord } from "../company/company.types";

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
  findByPhone(phone: string): Promise<EmployeeRecord | null>;
  save(employee: EmployeeRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface EmployeeFilters {
  status?: EmployeeRecord["status"];
  roleId?: string;
}

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
