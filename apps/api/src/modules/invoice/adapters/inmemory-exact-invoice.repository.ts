import type { ExactInvoice, ExactPayment } from "@tuari/contracts";
import type { ExactTransactionIdentity } from "../../company/exact-finance.repository";
import type { ExactInvoiceRepository } from "../invoice-exact.repository";

export class InMemoryExactInvoiceRepository implements ExactInvoiceRepository {
  private invoices = new Map<string, ExactInvoice>();
  private payments = new Map<string, ExactPayment>();
  constructor(readonly transactionIdentity: ExactTransactionIdentity) {}
  withTransaction<T>(work: () => T): T {
    const before = structuredClone([this.invoices, this.payments] as const);
    try {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Invoice transaction must be synchronous");
      return result;
    } catch (error) { [this.invoices, this.payments] = before; throw error; }
  }
  getInvoice(id: string) { return structuredClone(this.invoices.get(id) ?? null); }
  listInvoices() { return structuredClone([...this.invoices.values()]); }
  saveInvoice(invoice: ExactInvoice) { this.invoices.set(invoice.id, structuredClone(invoice)); }
  deleteInvoice(id: string) { this.invoices.delete(id); }
  getPayment(id: string) { return structuredClone(this.payments.get(id) ?? null); }
  listPayments() { return structuredClone([...this.payments.values()]); }
  savePayment(payment: ExactPayment) { this.payments.set(payment.id, structuredClone(payment)); }
  deletePayment(id: string) { this.payments.delete(id); }
}
