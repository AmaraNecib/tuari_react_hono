import { ExactFinanceService } from "../modules/company/exact-finance.service";
import { ExactWorkforceService } from "../modules/company/workforce-exact.service";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { SqliteExactWorkforceRepository } from "../modules/company/adapters/sqlite-exact-workforce.repository";
import { createExactWorkforceRouter } from "./workforce-exact-router";
import type { BetterSqliteDatabase } from "../types/sqlite";
import type { FifoLock } from "../infrastructure/database/fifo-lock";
import type { RpcMiddleware } from "./rpc-middleware";

/** No initialization or activation. Caller supplies an isolated prepared exact copy and its one shared FIFO. */
export function createExactWorkforceComposition(db: BetterSqliteDatabase, lock: FifoLock, middleware: RpcMiddleware, dependencies: { id(): string; now(): string }) {
  const finance = new ExactFinanceService(new SqliteExactFinanceRepository(db, lock), dependencies);
  const workforce = new ExactWorkforceService(new SqliteExactWorkforceRepository(db, lock), finance, dependencies);
  return { services: { finance, workforce }, router: createExactWorkforceRouter(workforce, middleware) };
}
