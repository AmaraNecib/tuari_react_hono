import type { FifoLock } from "../infrastructure/database/fifo-lock";
import { SqliteExactExpenseRepository } from "../modules/expenses/adapters/sqlite-exact-expenses.repository";
import { createExactExpensesModule } from "../modules/expenses/expenses.exact";
import { createExactCommerceServices } from "../rpc/exact-commerce-composition";
import { createExactPayrollServices } from "../rpc/exact-payroll-composition";
import type { BetterSqliteDatabase } from "../types/sqlite";

/** All financial producers share the root-owned ledger, connection and FIFO. */
export function createFinancialDependencies(
  db: BetterSqliteDatabase,
  lock: FifoLock,
  dependencies: { id(): string; now(): string },
) {
  const commerce = createExactCommerceServices(db, lock, dependencies);
  const payroll = createExactPayrollServices(db, lock, commerce.finance, commerce.financeRepository, dependencies);
  const expenses = createExactExpensesModule(new SqliteExactExpenseRepository(db, lock));
  return { ...commerce, ...payroll, expenses };
}

export type FinancialDependencies = ReturnType<typeof createFinancialDependencies>;
