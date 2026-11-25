import type { ExactInvoice, ExactPayment, ExperimentalExactInvoice } from "@tuari/contracts";
import type { ExactTransactionParticipant } from "../company/exact-finance.repository";

/** Domain rows and exact ledger writes enlist through the same transaction identity. */
export type InvoiceRepositoryRow = ExactInvoice | ExperimentalExactInvoice;
export interface ExactInvoiceRepository<TInvoice extends InvoiceRepositoryRow = ExactInvoice> extends ExactTransactionParticipant {
  getInvoice(id: string): TInvoice | null;
  listInvoices(): TInvoice[];
  saveInvoice(invoice: TInvoice): void;
  deleteInvoice(id: string): void;
  getPayment(id: string): ExactPayment | null;
  listPayments(): ExactPayment[];
  savePayment(payment: ExactPayment): void;
  deletePayment(id: string): void;
}

export type ExperimentalInvoiceRepository = ExactInvoiceRepository<ExperimentalExactInvoice>;
