import type { ExactFinanceService } from "../modules/company/exact-finance.service";
import { ExactWorkforceService } from "../modules/company/workforce-exact.service";
import { SqliteExactWorkforceRepository } from "../modules/company/adapters/sqlite-exact-workforce.repository";
import { SqlitePayrollCashRepository } from "../modules/company/adapters/sqlite-payroll-cash.repository";
import { PayrollCashService } from "../modules/company/payroll-cash.service";
import { createExactWorkforceRouter } from "./workforce-exact-router";
import type { BetterSqliteDatabase } from "../types/sqlite";
import type { FifoLock } from "../infrastructure/database/fifo-lock";
import type { RpcMiddleware } from "./rpc-middleware";

/** No initialization or activation. Root supplies the prepared workspace handle, shared FIFO and sole finance service. */
export function createExactWorkforceComposition(db: BetterSqliteDatabase, lock: FifoLock, middleware: RpcMiddleware, dependencies: { id(): string; now(): string }, finance: ExactFinanceService) {
  const earnings = new SqliteExactWorkforceRepository(db, lock);
  const cash = new SqlitePayrollCashRepository(db, lock);
  const workforce = new ExactWorkforceService(earnings, finance, dependencies);
  const payroll = new PayrollCashService(cash, earnings, finance, dependencies);
  return { services: { finance, workforce, payroll }, router: createExactWorkforceRouter(workforce, middleware, payroll) };
}
