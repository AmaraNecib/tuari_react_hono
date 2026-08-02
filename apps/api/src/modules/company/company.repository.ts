/**
 * Company repository composition root.
 *
 * Domain services depend on the focused repository interfaces. The concrete
 * SQLite/Drizzle adapter lives in `sqlite-company.repository.ts` so this
 * module remains a small, stable boundary for callers and dependency wiring.
 */

import { createDrizzleFromSqlite } from "../../infrastructure/database/drizzle";
import { SqliteCompanyRepository } from "./sqlite-company.repository";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import type { CompanyRepository } from "./company.repository.contracts";

export type { CompanyRepository } from "./company.repository.contracts";
export type { WorkforceRepository } from "./workforce.repository";
export type { OperationsRepository } from "./operations.repository";
export type { FinanceRepository } from "./finance.repository";
export type { AuditRepository } from "./audit.repository";
export { SqliteCompanyRepository } from "./sqlite-company.repository";

/** Create the Drizzle-backed repository from a shared SQLite handle. */
export function createCompanyRepository(rawDb: BetterSqliteDatabase): CompanyRepository {
  rawDb.pragma("foreign_keys = ON");
  return new SqliteCompanyRepository(createDrizzleFromSqlite(rawDb), rawDb);
}
