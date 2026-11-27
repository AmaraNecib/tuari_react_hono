import type { FifoLock } from "../infrastructure/database/fifo-lock";
import { SqliteExactExpenseRepository } from "../modules/expenses/adapters/sqlite-exact-expenses.repository";
import { createExactExpensesModule } from "../modules/expenses/expenses.exact";
import { createExactCommerceServices, createExperimentalExactCommerceServices } from "../rpc/exact-commerce-composition";
import { createExactPayrollServices } from "../rpc/exact-payroll-composition";
import type { BetterSqliteDatabase } from "../types/sqlite";
import { SqlitePayrollOpeningRepository } from "../modules/workforce/adapters/sqlite-payroll-opening.repository";
import { PayrollOpeningService } from "../modules/workforce/payroll-opening.service";

/** All financial producers share the root-owned ledger, connection and FIFO. */
function createFinancialSupport<TCommerce extends ReturnType<typeof createExactCommerceServices> | ReturnType<typeof createExperimentalExactCommerceServices>>(
  db: BetterSqliteDatabase,
  lock: FifoLock,
  dependencies: { id(): string; now(): string },
  commerce: TCommerce,
) {
  const openingRepository = new SqlitePayrollOpeningRepository(db, lock);
  const opening = new PayrollOpeningService(commerce.finance, openingRepository, dependencies);
  const payroll = createExactPayrollServices(db, lock, commerce.finance, commerce.financeRepository, dependencies, openingRepository);
  const expenses = createExactExpensesModule(new SqliteExactExpenseRepository(db, lock));
  return { ...commerce, ...payroll, opening, expenses };
}

export function createFinancialDependencies(db: BetterSqliteDatabase, lock: FifoLock, dependencies: { id(): string; now(): string }) {
  return createFinancialSupport(db, lock, dependencies, createExactCommerceServices(db, lock, dependencies));
}

export function createExperimentalFinancialDependencies(db: BetterSqliteDatabase, lock: FifoLock, dependencies: { id(): string; now(): string }) {
  return createFinancialSupport(db, lock, dependencies, createExperimentalExactCommerceServices(db, lock, dependencies));
}

export type FinancialDependencies = ReturnType<typeof createFinancialDependencies>;
export type ExperimentalFinancialDependencies = ReturnType<typeof createExperimentalFinancialDependencies>;
