/**
 * Database adapter factory functions.
 *
 * Each factory creates a repository instance appropriate for the configured
 * adapter type (determined by `AppConfig.dbAdapter`). Currently only the
 * SQLite adapter exists; future adapters (Postgres / InMemory) will be
 * selected here without callers changing.
 *
 * The narrow factories (createWorkforceRepository, createOperationsRepository,
 * etc.) return the per-domain delegation adapters introduced in Phase 3.
 *
 * Note: each narrow SQLite factory builds its own SqliteCompanyRepository
 * instance (and therefore its own Drizzle handle). They share the same
 * underlying better-sqlite3 connection (rawDb), so data is consistent, but
 * transactions are only atomic when a single repository instance is used —
 * prefer `createCompanyRepository` (or `createAppDependencies`) for the
 * composed wiring used in production.
 */

import type { BetterSqliteDatabase } from "../types/sqlite";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { SqliteCompanyRepository } from "../modules/company/adapters/sqlite-company.repository";
import { SqliteWorkforceRepository } from "../modules/company/adapters/sqlite-workforce.repository";
import { SqliteOperationsRepository } from "../modules/company/adapters/sqlite-operations.repository";
import { SqliteFinanceRepository } from "../modules/company/adapters/sqlite-finance.repository";
import { SqliteAuditRepository } from "../modules/company/adapters/sqlite-audit.repository";
import { InMemoryStore, InMemoryWorkforceRepository, InMemoryOperationsRepository, InMemoryFinanceRepository, InMemoryAuditRepository, InMemoryCompanyRepository } from "../modules/company/adapters";
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
 */
function buildSqliteCompanyRepository(
  rawDb: BetterSqliteDatabase,
  _config: AppConfig,
): SqliteCompanyRepository {
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
      return buildSqliteCompanyRepository(rawDb, config);
    case "inmemory":
      return new InMemoryCompanyRepository();
    default: {
      const _exhaustive: never = config.dbAdapter;
      throw new Error(`Unsupported db adapter: ${_exhaustive}`);
    }
  }
}

/**
 * Create a WorkforceRepository for the configured adapter.
 *
 * @param store - Optional shared in-memory store. Pass the same store
 *                across narrow factories to keep cross-domain lookups
 *                consistent when using per-domain injection.
 */
export function createWorkforceRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
  store?: InMemoryStore,
): WorkforceRepository {
  switch (config.dbAdapter) {
    case "sqlite":
      return new SqliteWorkforceRepository(buildSqliteCompanyRepository(rawDb, config));
    case "inmemory":
      return new InMemoryWorkforceRepository(store ?? new InMemoryStore());
    default: {
      const _exhaustive: never = config.dbAdapter;
      throw new Error(`Unsupported db adapter: ${_exhaustive}`);
    }
  }
}

/**
 * Create an OperationsRepository for the configured adapter.
 *
 * @param store - Optional shared in-memory store (see createWorkforceRepository).
 */
export function createOperationsRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
  store?: InMemoryStore,
): OperationsRepository {
  switch (config.dbAdapter) {
    case "sqlite":
      return new SqliteOperationsRepository(buildSqliteCompanyRepository(rawDb, config));
    case "inmemory":
      return new InMemoryOperationsRepository(store ?? new InMemoryStore());
    default: {
      const _exhaustive: never = config.dbAdapter;
      throw new Error(`Unsupported db adapter: ${_exhaustive}`);
    }
  }
}

/**
 * Create a FinanceRepository for the configured adapter.
 *
 * @param store - Optional shared in-memory store (see createWorkforceRepository).
 */
export function createFinanceRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
  store?: InMemoryStore,
): FinanceRepository {
  switch (config.dbAdapter) {
    case "sqlite":
      return new SqliteFinanceRepository(buildSqliteCompanyRepository(rawDb, config));
    case "inmemory":
      return new InMemoryFinanceRepository(store ?? new InMemoryStore());
    default: {
      const _exhaustive: never = config.dbAdapter;
      throw new Error(`Unsupported db adapter: ${_exhaustive}`);
    }
  }
}

/**
 * Create an AuditRepository for the configured adapter.
 *
 * @param store - Optional shared in-memory store (see createWorkforceRepository).
 */
export function createAuditRepository(
  rawDb: BetterSqliteDatabase,
  config: AppConfig,
  store?: InMemoryStore,
): AuditRepository {
  switch (config.dbAdapter) {
    case "sqlite":
      return new SqliteAuditRepository(buildSqliteCompanyRepository(rawDb, config));
    case "inmemory":
      return new InMemoryAuditRepository(store ?? new InMemoryStore());
    default: {
      const _exhaustive: never = config.dbAdapter;
      throw new Error(`Unsupported db adapter: ${_exhaustive}`);
    }
  }
}
