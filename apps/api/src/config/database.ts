/**
 * Database adapter factory functions.
 *
 * Each factory creates a repository instance appropriate for the configured
 * adapter type (determined by `AppConfig.dbAdapter`). In Phase 1 only the
 * SQLite adapter exists. When future adapters (Postgres / InMemory) are
 * added, the switch statements in these factories pick the right implementation
 * without callers changing.
 *
 * Phase 1 note: all factories delegate through `SqliteCompanyRepository`
 * because the per-domain adapter classes (SqliteWorkforceRepository, etc.)
 * do not yet exist. The narrow return types (WorkforceRepository etc.) are
 * correct because `SqliteCompanyRepository` satisfies `CompanyRepository`
 * which extends each narrow interface.
 */

import type { BetterSqliteDatabase } from "../types/sqlite";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { SqliteCompanyRepository } from "../modules/company/sqlite-company.repository";
import type { CompanyRepository } from "../modules/company/company.repository.contracts";
import type { WorkforceRepository } from "../modules/company/workforce.repository";
import type { OperationsRepository } from "../modules/company/operations.repository";
import type { FinanceRepository } from "../modules/company/finance.repository";
import type { AuditRepository } from "../modules/company/audit.repository";
import type { AppConfig } from "./index";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Create a SqliteCompanyRepository from a raw better-sqlite3 handle.
 *
 * This is the only concrete repository class we have until Phase 3
 * splits it into per-domain adapters.
 */
function buildSqliteRepository(
  rawDb: BetterSqliteDatabase,
  _config: AppConfig,
): CompanyRepository {
  rawDb.pragma("foreign_keys = ON");
  return new SqliteCompanyRepository(createDrizzleFromSqlite(rawDb), rawDb);
}

// ---------------------------------------------------------------------------
// Public factory functions
// ---------------------------------------------------------------------------

/**
 * Create a CompanyRepository (composition root) for the configured adapter.
 *
 * @param rawDb - A better-sqlite3 database handle (or compatible).
 * @param config - Validated application config (controls adapter selection).
 */
export function createCompanyRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
): CompanyRepository {
  switch (config.dbAdapter) {
    case "sqlite":
      return buildSqliteRepository(rawDb, config);
    default: {
      const _exhaustive: never = config.dbAdapter;
      throw new Error(`Unsupported db adapter: ${_exhaustive}`);
    }
  }
}

/**
 * Create a WorkforceRepository for the configured adapter.
 *
 * Phase 1: delegates to `createCompanyRepository` and returns the
 *          `SqliteCompanyRepository` cast to `WorkforceRepository`
 *          (safe because `CompanyRepository extends WorkforceRepository`).
 * Phase 3: will instantiate `SqliteWorkforceRepository` directly.
 */
export function createWorkforceRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
): WorkforceRepository {
  return createCompanyRepository(rawDb, config);
}

/**
 * Create an OperationsRepository for the configured adapter.
 *
 * Phase 1: delegates to `createCompanyRepository`.
 * Phase 3: will instantiate `SqliteOperationsRepository` directly.
 */
export function createOperationsRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
): OperationsRepository {
  return createCompanyRepository(rawDb, config);
}

/**
 * Create a FinanceRepository for the configured adapter.
 *
 * Phase 1: delegates to `createCompanyRepository`.
 * Phase 3: will instantiate `SqliteFinanceRepository` directly.
 */
export function createFinanceRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
): FinanceRepository {
  return createCompanyRepository(rawDb, config);
}

/**
 * Create an AuditRepository for the configured adapter.
 *
 * Phase 1: delegates to `createCompanyRepository`.
 * Phase 3: will instantiate `SqliteAuditRepository` directly.
 */
export function createAuditRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
): AuditRepository {
  return createCompanyRepository(rawDb, config);
}
