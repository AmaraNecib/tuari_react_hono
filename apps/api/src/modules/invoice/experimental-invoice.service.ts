import type { ExperimentalExactInvoiceList, ExactPaymentList } from "@tuari/contracts";
import { ExperimentalInvoiceServiceCore } from "./invoice-exact.service";
import type { ExperimentalInvoiceRepository } from "./invoice-exact.repository";
import type { ExactFinanceService } from "../company/exact-finance.service";

/** Internal experimental lifecycle. The core parser/status policy is fixed here, not client-selectable. */
export class ExperimentalExactInvoiceService extends ExperimentalInvoiceServiceCore {
  constructor(repository: ExperimentalInvoiceRepository, finance: ExactFinanceService, dependencies: { id(): string; now(): string }) {
    super(repository, finance, dependencies);
  }
  listInvoices(input: ExperimentalExactInvoiceList = {}) { return super.listInvoices(input); }
  listPayments(input: ExactPaymentList = {}) { return super.listPayments(input); }
}
