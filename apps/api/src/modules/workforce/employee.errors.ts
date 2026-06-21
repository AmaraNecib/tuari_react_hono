/**
 * Domain errors for the Employee module.
 *
 * These are the only errors that the module will throw. Callers can
 * catch these specific errors to handle domain-level failures.
 */
export class EmployeeNotFoundError extends Error {
  readonly code = "EMPLOYEE_NOT_FOUND" as const;
  constructor(employeeId: string) {
    super(`Employee with id "${employeeId}" not found`);
    this.name = "EmployeeNotFoundError";
  }
}

export class DuplicatePhoneError extends Error {
  readonly code = "DUPLICATE_PHONE" as const;
  constructor(phone: string) {
    super(`An employee with phone "${phone}" already exists`);
    this.name = "DuplicatePhoneError";
  }
}

export class RoleNotFoundError extends Error {
  readonly code = "ROLE_NOT_FOUND" as const;
  constructor(roleId: string) {
    super(`Role with id "${roleId}" not found`);
    this.name = "RoleNotFoundError";
  }
}
