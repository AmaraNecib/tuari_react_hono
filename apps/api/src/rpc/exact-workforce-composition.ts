import type { ExactFinanceService } from "../modules/company/exact-finance.service";
import { ExactWorkforceService } from "../modules/company/workforce-exact.service";
import { SqliteExactWorkforceRepository } from "../modules/company/adapters/sqlite-exact-workforce.repository";
import { createExactWorkforceRouter } from "./workforce-exact-router";
import type { BetterSqliteDatabase } from "../types/sqlite";
import type { FifoLock } from "../infrastructure/database/fifo-lock";
import type { RpcMiddleware } from "./rpc-middleware";

/** No initialization or activation. Root supplies the prepared workspace handle, shared FIFO and sole finance service. */
export function createExactWorkforceComposition(db: BetterSqliteDatabase, lock: FifoLock, middleware: RpcMiddleware, dependencies: { id(): string; now(): string }, finance: ExactFinanceService) {
  const workforce = new ExactWorkforceService(new SqliteExactWorkforceRepository(db, lock), finance, dependencies);
  return { services: { finance, workforce }, router: createExactWorkforceRouter(workforce, middleware) };
}
