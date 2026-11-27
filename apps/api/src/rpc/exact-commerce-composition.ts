import type { BetterSqliteDatabase } from "../types/sqlite";
import type { FifoLock } from "../infrastructure/database/fifo-lock";
import type { RpcMiddleware } from "./rpc-middleware";
import { ExactFinanceService } from "../modules/company/exact-finance.service";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { ExactInvoiceService } from "../modules/invoice/invoice-exact.service";
import { ExperimentalExactInvoiceService } from "../modules/invoice/experimental-invoice.service";
import { SqliteExactInvoiceRepository, SqliteExperimentalInvoiceRepository } from "../modules/invoice/adapters/sqlite-exact-invoice.repository";
import { ExperimentalInvoiceSettlementParticipant } from "../modules/invoice/experimental-invoice-settlement-participant";
import { ExactInventoryService } from "../modules/inventory/inventory-exact.service";
import { SqliteExactInventoryRepository } from "../modules/inventory/adapters/sqlite-exact-inventory.repository";
import { createExactDebtsRouter } from "./debts-exact-router";
import { createExactInvoicesRouter } from "./invoice-exact-router";
import { createExactInventoryRouter } from "./inventory-exact-router";

/** Construct one financial graph on the caller's prepared connection and FIFO. */
function createExactCommerceBase(db: BetterSqliteDatabase, lock: FifoLock, dependencies: { id(): string; now(): string }) {
  const financeRepository = new SqliteExactFinanceRepository(db, lock);
  const finance = new ExactFinanceService(financeRepository, dependencies);
  const inventory = new ExactInventoryService(new SqliteExactInventoryRepository(db, lock), finance, dependencies);
  return { financeRepository, finance, inventory };
}

export function createExactCommerceServices(db: BetterSqliteDatabase, lock: FifoLock, dependencies: { id(): string; now(): string }) {
  const base = createExactCommerceBase(db, lock, dependencies);
  const invoiceRepository = new SqliteExactInvoiceRepository(db, lock);
  return { ...base, invoiceRepository, invoices: new ExactInvoiceService(invoiceRepository, base.finance, dependencies) };
}

/** Experimental root never constructs the cash-only invoice repository or service. */
export function createExperimentalExactCommerceServices(db: BetterSqliteDatabase, lock: FifoLock, dependencies: { id(): string; now(): string }) {
  const base = createExactCommerceBase(db, lock, dependencies);
  const invoiceRepository = new SqliteExperimentalInvoiceRepository(db, lock);
  const experimentalInvoices = new ExperimentalExactInvoiceService(invoiceRepository, base.finance, dependencies);
  const invoiceParticipant = new ExperimentalInvoiceSettlementParticipant(invoiceRepository, base.finance, base.financeRepository, dependencies);
  return { ...base, invoiceRepository, experimentalInvoices, invoiceParticipant };
}

/** Bind the same graph to authenticated handlers; schema ownership stays with the caller. */
export function createExactCommerceComposition(db: BetterSqliteDatabase, lock: FifoLock, middleware: RpcMiddleware, dependencies: { id(): string; now(): string }) {
  const services = createExactCommerceServices(db, lock, dependencies);
  return { services, router: { debts: createExactDebtsRouter(services.finance, middleware), invoices: createExactInvoicesRouter(services.invoices, middleware), inventory: createExactInventoryRouter(services.inventory, middleware) } };
}
