import type { CompanyRepository } from "./company.repository.contracts";

/**
 * Utilities for managing transactions across repository operations.
 * Ensures data consistency for multi-step mutations.
 */
export class TransactionManager {
  constructor(private readonly repository: CompanyRepository) {}

  /**
   * Execute a mutation operation within a database transaction.
   * On error, the entire transaction is rolled back.
   */
  execute<T>(operation: () => T): T {
    return this.repository.withTransaction(operation);
  }

  /**
   * Execute multiple operations within a single transaction.
   * All operations succeed or all fail together.
   */
  executeMultiple<T>(operations: (() => T)[]): T[] {
    return this.repository.withTransaction(() => {
      const results: T[] = [];
      for (const operation of operations) {
        results.push(operation());
      }
      return results;
    });
  }
}

/**
 * Decorator function to wrap a method in a transaction.
 * Usage: @transactional
 */
export function transactional(
  _target: object,
  _propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
) {
  const originalMethod = descriptor.value;

  descriptor.value = function (this: { repository?: CompanyRepository }, ...args: unknown[]) {
    if (!this.repository) {
      throw new Error("transactional decorator requires repository property");
    }

    return this.repository.withTransaction(() => {
      return originalMethod.apply(this, args);
    });
  };

  return descriptor;
}
