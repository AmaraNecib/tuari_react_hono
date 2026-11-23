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

/** Construct one financial graph on the caller's prepared connection and FIFO. */
export function createExactCommerceServices(db: BetterSqliteDatabase, lock: FifoLock, dependencies: { id(): string; now(): string }) {
  const financeRepository = new SqliteExactFinanceRepository(db, lock);
  const finance = new ExactFinanceService(financeRepository, dependencies);
  const invoices = new ExactInvoiceService(new SqliteExactInvoiceRepository(db, lock), finance, dependencies);
  const inventory = new ExactInventoryService(new SqliteExactInventoryRepository(db, lock), finance, dependencies);
  return { financeRepository, finance, invoices, inventory };
}

/** Bind the same graph to authenticated handlers; schema ownership stays with the caller. */
export function createExactCommerceComposition(db: BetterSqliteDatabase, lock: FifoLock, middleware: RpcMiddleware, dependencies: { id(): string; now(): string }) {
  const services = createExactCommerceServices(db, lock, dependencies);
  return { services, router: { debts: createExactDebtsRouter(services.finance, middleware), invoices: createExactInvoicesRouter(services.invoices, middleware), inventory: createExactInventoryRouter(services.inventory, middleware) } };
}
