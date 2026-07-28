/**
 * Provider-neutral composition contract for company persistence.
 *
 * Domain and application modules depend on the focused repository
 * interfaces below. Infrastructure adapters satisfy this composition
 * contract without exposing their database or ORM implementation.
 */

import type { AuditRepository } from "./audit.repository";
import type { FinanceRepository } from "./finance.repository";
import type { OperationsRepository } from "./operations.repository";
import type { WorkforceRepository } from "./workforce.repository";

/**
 * The repository capabilities currently composed by the application.
 *
 * The transaction method is part of the contract because some mutations
 * update multiple domain tables atomically. Its implementation is supplied
 * by the selected persistence adapter.
 */
export interface CompanyRepository
  extends WorkforceRepository,
    OperationsRepository,
    FinanceRepository,
    AuditRepository {
  withTransaction<T>(callback: () => T): T;
}
