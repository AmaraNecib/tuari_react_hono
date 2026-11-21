import type { BetterSqliteDatabase } from "../types/sqlite";
import type { FifoLock } from "../infrastructure/database/fifo-lock";
import type { ExactFinanceRepository } from "../modules/company/exact-finance.repository";
import type { ExactFinanceService } from "../modules/company/exact-finance.service";
import { SqlitePayrollCashRepository } from "../modules/workforce/adapters/sqlite-payroll-cash.repository";
import { SqlitePayrollOffsetRepository } from "../modules/workforce/adapters/sqlite-payroll-offset.repository";
import { SqlitePayrollLifecycleReader } from "../modules/workforce/adapters/sqlite-payroll-lifecycle.reader";
import { SqlitePayrollSourceRepository } from "../modules/workforce/adapters/sqlite-payroll-source.repository";
import type { PayrollOpeningReviewProvider } from "../modules/workforce/payroll-lifecycle";
import { PayrollService } from "../modules/workforce/payroll.service";
import type { RpcMiddleware } from "./rpc-middleware";
import { createPayrollRouter } from "./payroll-router";

/** The caller owns the prepared schema and supplies the shared finance instance. */
export function createExactPayrollServices(
  db: BetterSqliteDatabase,
  lock: FifoLock,
  finance: ExactFinanceService,
  financeRepository: ExactFinanceRepository,
  dependencies: { id(): string; now(): string },
  opening?: PayrollOpeningReviewProvider,
) {
  const cash = new SqlitePayrollCashRepository(db, lock);
  const sources = new SqlitePayrollSourceRepository(db, lock, financeRepository);
  const offsets = new SqlitePayrollOffsetRepository(db, lock);
  const payroll = new PayrollService(finance, cash, sources, dependencies, offsets, opening);
  const lifecycle = new SqlitePayrollLifecycleReader(db, lock, finance, financeRepository, sources, cash, offsets, opening);
  return { payroll, lifecycle };
}

export function createExactPayrollComposition(
  db: BetterSqliteDatabase,
  lock: FifoLock,
  finance: ExactFinanceService,
  financeRepository: ExactFinanceRepository,
  middleware: RpcMiddleware,
  dependencies: { id(): string; now(): string },
  opening?: PayrollOpeningReviewProvider,
) {
  const services = createExactPayrollServices(db, lock, finance, financeRepository, dependencies, opening);
  return { services, router: createPayrollRouter(services.payroll, employeeId => services.lifecycle.getEmployeePayroll(employeeId), middleware) };
}
