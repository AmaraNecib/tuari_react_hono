import { randomUUID } from "node:crypto";

import type { Employee, EmployeeCreateInput, EmployeeUpdateInput } from "@tuari/contracts";

import type { EmployeeRecord } from "../company/company.types";
import { decodeCursor, normalizePageSize } from "../shared/cursor";
import {
  DuplicatePhoneError,
  EmployeeNotFoundError,
  InvalidCursorError,
  RoleNotFoundError,
} from "./employee.errors";
import type {
  EmployeeFilters,
  EmployeeRepository,
  RoleRepository,
} from "./employee.repository";

/**
 * Dependencies that the EmployeeModule needs.
 * Grouped in a single object so the module has a small constructor signature.
 */
export type EmployeeModuleDependencies = {
  employeeRepository: EmployeeRepository;
  roleRepository: RoleRepository;
  /**
   * Returns the current timestamp. Injected to make tests deterministic.
   * Defaults to () => new Date().toISOString() in production.
   */
  now?: () => string;
};

/**
 * Input for creating an employee. Status is set by the module to ACTIVE
 * (callers should not need to specify it on creation).
 */
export type CreateEmployeeInput = Omit<EmployeeCreateInput, "status">;

/**
 * Options for the paginated list query.
 *
 * `cursor` is an opaque token from a previous response's `nextCursor`.
 * `limit` is clamped to a safe range by the module (1..100, default 50).
 */
export type ListPagedOptions = {
  filters?: EmployeeFilters;
  cursor?: string;
  limit?: number;
};

/**
 * Result of a paginated list query.
 *
 * - `items` are the public Employee records on this page
 * - `total` is the total count matching the filter (not the page size)
 * - `nextCursor` is null on the last page
 * - `hasMore` is a convenience flag equivalent to `nextCursor !== null`
 */
export type PaginatedEmployees = {
  items: Employee[];
  total: number;
  nextCursor: string | null;
};

/**
 * EmployeeModule - the deep module for employee management.
 *
 * This is a small public interface that hides complex implementation details.
 * Callers don't need to know about:
 * - How employees are stored
 * - How uniqueness is enforced
 * - How timestamps are generated
 *
 * The module is the natural place to put business rules like:
 * - Phone number uniqueness
 * - Role validation
 * - Status transitions (when we add update)
 *
 * Tests use InMemoryEmployeeRepository.
 * Production uses DrizzleEmployeeRepository (to be added in next iteration).
 */
export class EmployeeModule {
  private readonly employeeRepository: EmployeeRepository;
  private readonly roleRepository: RoleRepository;
  private readonly now: () => string;

  constructor(dependencies: EmployeeModuleDependencies) {
    this.employeeRepository = dependencies.employeeRepository;
    this.roleRepository = dependencies.roleRepository;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  /**
   * Create a new employee.
   *
   * Throws:
   * - DuplicatePhoneError if phone already exists
   * - RoleNotFoundError if roleId doesn't exist
   */
  async create(input: CreateEmployeeInput): Promise<Employee> {
    // Business rule: validate role exists
    const role = await this.roleRepository.findById(input.roleId);
    if (!role) {
      throw new RoleNotFoundError(input.roleId);
    }

    // Business rule: phone must be unique
    const existing = await this.employeeRepository.findByPhone(input.phone);
    if (existing) {
      throw new DuplicatePhoneError(input.phone);
    }

    const timestamp = this.now();
    const record: EmployeeRecord = {
      id: randomUUID(),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      roleId: input.roleId,
      status: "ACTIVE",
      salaryAmountDzd: input.salaryAmountDzd ?? null,
      salaryPeriod: input.salaryPeriod ?? null,
      notes: input.notes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.employeeRepository.save(record);
    return this.toEmployee(record);
  }

  /**
   * Find an employee by ID.
   * Returns null if not found.
   */
  async findById(id: string): Promise<Employee | null> {
    const record = await this.employeeRepository.findById(id);
    return record ? this.toEmployee(record) : null;
  }

  /**
   * List employees with optional filters.
   */
  async list(filters?: EmployeeFilters): Promise<Employee[]> {
    const records = await this.employeeRepository.findAll(filters);
    return records.map((r) => this.toEmployee(r));
  }

  /**
   * List employees as a paginated, cursor-based result.
   *
   * The cursor is opaque — clients must pass back the `nextCursor` from a
   * previous response without inspecting or modifying it. Filters are
   * applied BEFORE pagination so `total` reflects the filtered set.
   *
   * Throws:
   * - InvalidCursorError if the cursor is malformed or was not produced
   *   by this module.
   */
  async listPaged(options: ListPagedOptions): Promise<PaginatedEmployees> {
    const limit = normalizePageSize(options.limit);

    // Validate cursor up-front so we can give a precise error. The
    // repository will also decode it, but doing it here lets us throw a
    // module-typed error rather than a generic one.
    if (options.cursor !== undefined) {
      try {
        decodeCursor(options.cursor);
      } catch {
        throw new InvalidCursorError(options.cursor);
      }
    }

    const result = await this.employeeRepository.findPaged({
      filters: options.filters,
      cursor: options.cursor,
      limit,
    });

    return {
      items: result.items.map((r) => this.toEmployee(r)),
      total: result.total,
      nextCursor: result.nextCursor,
    };
  }

  /**
   * Update an existing employee.
   *
   * Throws:
   * - EmployeeNotFoundError if employee doesn't exist
   * - DuplicatePhoneError if new phone conflicts with another employee
   */
  async update(id: string, input: EmployeeUpdateInput): Promise<Employee> {
    const existing = await this.employeeRepository.findById(id);
    if (!existing) {
      throw new EmployeeNotFoundError(id);
    }

    // Defensive: if input.id is provided and doesn't match the path id,
    // throw rather than silently creating a ghost record.
    if (input.id !== undefined && input.id !== id) {
      throw new EmployeeNotFoundError(input.id);
    }

    // Business rule: if role is being changed, validate the new role exists
    if (input.roleId && input.roleId !== existing.roleId) {
      const role = await this.roleRepository.findById(input.roleId);
      if (!role) {
        throw new RoleNotFoundError(input.roleId);
      }
    }

    // Business rule: if phone is being changed, ensure it doesn't conflict
    if (input.phone && input.phone !== existing.phone) {
      const phoneOwner = await this.employeeRepository.findByPhone(input.phone);
      if (phoneOwner && phoneOwner.id !== id) {
        throw new DuplicatePhoneError(input.phone);
      }
    }

    // Build the updated record. We explicitly set id from the path parameter,
    // not from input.id, to prevent the ghost-record bug where a mismatched
    // input.id would cause the save to write to a different key than the
    // one we just read from.
    const { id: _ignoredId, ...updatableFields } = input;
    const updated: EmployeeRecord = {
      ...existing,
      ...updatableFields,
      id, // Always use the path id
      updatedAt: this.now(),
    };

    await this.employeeRepository.save(updated);
    return this.toEmployee(updated);
  }

  /**
   * Delete an employee.
   *
   * Throws:
   * - EmployeeNotFoundError if employee doesn't exist
   */
  async delete(id: string): Promise<void> {
    const existing = await this.employeeRepository.findById(id);
    if (!existing) {
      throw new EmployeeNotFoundError(id);
    }
    await this.employeeRepository.delete(id);
  }

  /**
   * Convert internal record shape to public Employee shape.
   * Hides the internal representation from callers.
   */
  private toEmployee(record: EmployeeRecord): Employee {
    return {
      id: record.id,
      firstName: record.firstName,
      lastName: record.lastName,
      phone: record.phone,
      roleId: record.roleId,
      status: record.status,
      salaryAmountDzd: record.salaryAmountDzd,
      salaryPeriod: record.salaryPeriod,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
