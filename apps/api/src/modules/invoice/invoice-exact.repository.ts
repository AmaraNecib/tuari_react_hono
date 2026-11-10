import type { ExactInvoice, ExactPayment } from "@tuari/contracts";
import type { ExactTransactionParticipant } from "../company/exact-finance.repository";

/** Domain rows and exact ledger writes enlist through the same transaction identity. */
export interface ExactInvoiceRepository extends ExactTransactionParticipant {
  getInvoice(id: string): ExactInvoice | null;
  listInvoices(): ExactInvoice[];
  saveInvoice(invoice: ExactInvoice): void;
  deleteInvoice(id: string): void;
  getPayment(id: string): ExactPayment | null;
  listPayments(): ExactPayment[];
  savePayment(payment: ExactPayment): void;
  deletePayment(id: string): void;
}
