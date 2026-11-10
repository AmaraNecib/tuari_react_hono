import type { BetterSqliteDatabase } from "../types/sqlite";
import type { FifoLock } from "../infrastructure/database/fifo-lock";
import type { RpcMiddleware } from "./rpc-middleware";
import { ExactFinanceService } from "../modules/company/exact-finance.service";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { ExactInvoiceService } from "../modules/invoice/invoice-exact.service";
import { SqliteExactInvoiceRepository } from "../modules/invoice/adapters/sqlite-exact-invoice.repository";
import { ExactInventoryService } from "../modules/inventory/inventory-exact.service";
import { SqliteExactInventoryRepository } from "../modules/inventory/adapters/sqlite-exact-inventory.repository";
import { createExactDebtsRouter } from "./debts-exact-router";
import { createExactInvoicesRouter } from "./invoice-exact-router";
import { createExactInventoryRouter } from "./inventory-exact-router";

/** No initialization or activation. Caller supplies an isolated prepared exact copy and its one shared FIFO. */
export function createExactCommerceComposition(db: BetterSqliteDatabase, lock: FifoLock, middleware: RpcMiddleware, dependencies: { id(): string; now(): string }) {
  const finance = new ExactFinanceService(new SqliteExactFinanceRepository(db, lock), dependencies);
  const invoices = new ExactInvoiceService(new SqliteExactInvoiceRepository(db, lock), finance, dependencies);
  const inventory = new ExactInventoryService(new SqliteExactInventoryRepository(db, lock), finance, dependencies);
  return { services: { finance, invoices, inventory }, router: { debts: createExactDebtsRouter(finance, middleware), invoices: createExactInvoicesRouter(invoices, middleware), inventory: createExactInventoryRouter(inventory, middleware) } };
}
