import type { ExactInvoice, ExperimentalExactInvoice, ExactPayment, ExactInvoiceList, ExactPaymentList } from "@tuari/contracts";
import { ExactInvoiceService } from "./invoice-exact.service";
import type { ExactInvoiceRepository, ExperimentalInvoiceRepository } from "./invoice-exact.repository";
import type { ExactFinanceService } from "../company/exact-finance.service";

const normalView = (row: ExperimentalExactInvoice): ExactInvoice => {
  const { settledAmount: _settled, status, ...rest } = row;
  return { ...rest, status: status === "SETTLED" ? "RECEIVED" : status };
};
class ExperimentalRepositoryBridge implements ExactInvoiceRepository {
  constructor(private readonly repo: ExperimentalInvoiceRepository) {}
  get transactionIdentity() { return this.repo.transactionIdentity; }
  withTransaction<T>(work: () => T): T { return this.repo.withTransaction(work); }
  getInvoice(id: string) { const row = this.repo.getInvoice(id); return row ? normalView(row) : null; }
  listInvoices() { return this.repo.listInvoices().map(normalView); }
  saveInvoice(row: ExactInvoice) {
    const previous = this.repo.getInvoice(row.id);
    const settledAmount = previous?.settledAmount ?? "0.00";
    const status = row.status === "PAID" && settledAmount !== "0.00" ? "SETTLED" : row.status;
    this.repo.saveInvoice({ ...row, status, settledAmount } as ExperimentalExactInvoice);
  }
  deleteInvoice(id: string) { this.repo.deleteInvoice(id); }
  getPayment(id: string) { return this.repo.getPayment(id); }
  listPayments() { return this.repo.listPayments(); }
  savePayment(row: ExactPayment) { this.repo.savePayment(row); }
  deletePayment(id: string) { this.repo.deletePayment(id); }
}

/** Experimental invoice lifecycle. Cash remains in the shared producer-owned exact ledger. */
export class ExperimentalExactInvoiceService {
  private readonly delegate: ExactInvoiceService;
  constructor(private readonly repository: ExperimentalInvoiceRepository, finance: ExactFinanceService, dependencies: { id(): string; now(): string }) {
    this.delegate = new ExactInvoiceService(new ExperimentalRepositoryBridge(repository), finance, dependencies);
  }
  private invoice(row: ExactInvoice): ExperimentalExactInvoice {
    const persisted = this.repository.getInvoice(row.id);
    if (!persisted) throw new Error("Experimental invoice disappeared after command");
    return persisted;
  }
  getInvoice(id: string): ExperimentalExactInvoice { return this.invoice(this.delegate.getInvoice(id)); }
  createInvoice(input: Parameters<ExactInvoiceService["createInvoice"]>[0]) { return this.invoice(this.delegate.createInvoice(input)); }
  updateInvoice(input: Parameters<ExactInvoiceService["updateInvoice"]>[0]) { return this.invoice(this.delegate.updateInvoice(input)); }
  deleteDraft(input: Parameters<ExactInvoiceService["deleteDraft"]>[0]) { return this.delegate.deleteDraft(input); }
  receiveInvoice(input: Parameters<ExactInvoiceService["receiveInvoice"]>[0]) { return this.invoice(this.delegate.receiveInvoice(input)); }
  createPayment(input: Parameters<ExactInvoiceService["createPayment"]>[0]) { return this.delegate.createPayment(input); }
  allocatePayment(input: Parameters<ExactInvoiceService["allocatePayment"]>[0]) { return this.delegate.allocatePayment(input); }
  voidPayment(input: Parameters<ExactInvoiceService["voidPayment"]>[0]) { return this.delegate.voidPayment(input); }
  voidInvoice(input: Parameters<ExactInvoiceService["voidInvoice"]>[0]) {
    const invoice = this.repository.getInvoice(input.id);
    if (invoice && invoice.settledAmount !== "0.00") throw new Error("Reverse the linked settlement before voiding this invoice");
    return this.invoice(this.delegate.voidInvoice(input));
  }
  deleteUnallocatedPayment(input: Parameters<ExactInvoiceService["deleteUnallocatedPayment"]>[0]) { return this.delegate.deleteUnallocatedPayment(input); }
  listInvoices(input: ExactInvoiceList = {}) {
    const result = this.delegate.listInvoices(input);
    return { ...result, items: result.items.map(row => this.invoice(row)) };
  }
  listPayments(input: ExactPaymentList = {}) { return this.delegate.listPayments(input); }
}
