import type { FifoLock } from "../infrastructure/database/fifo-lock";
import { SqliteExactExpenseRepository } from "../modules/expenses/adapters/sqlite-exact-expenses.repository";
import { createExactExpensesModule } from "../modules/expenses/expenses.exact";
import { createExactCommerceServices } from "../rpc/exact-commerce-composition";
import { createExactPayrollServices } from "../rpc/exact-payroll-composition";
import type { BetterSqliteDatabase } from "../types/sqlite";
import { SqlitePayrollOpeningRepository } from "../modules/workforce/adapters/sqlite-payroll-opening.repository";
import { PayrollOpeningService } from "../modules/workforce/payroll-opening.service";

/** All financial producers share the root-owned ledger, connection and FIFO. */
export function createFinancialDependencies(
  db: BetterSqliteDatabase,
  lock: FifoLock,
  dependencies: { id(): string; now(): string },
) {
  const commerce = createExactCommerceServices(db, lock, dependencies);
  const openingRepository = new SqlitePayrollOpeningRepository(db, lock);
  const opening = new PayrollOpeningService(commerce.finance, openingRepository, dependencies);
  const payroll = createExactPayrollServices(db, lock, commerce.finance, commerce.financeRepository, dependencies, openingRepository);
  const expenses = createExactExpensesModule(new SqliteExactExpenseRepository(db, lock));
  return { ...commerce, ...payroll, opening, expenses };
}

export type FinancialDependencies = ReturnType<typeof createFinancialDependencies>;
