import { Money } from "@tuari/contracts";
import type { ExactFinanceRepository, ExactDebtEntry } from "../company/exact-finance.repository";
import type { ExactFinanceService } from "../company/exact-finance.service";
import type { ExperimentalInvoiceRepository } from "./invoice-exact.repository";
import type { ExperimentalExactInvoice } from "@tuari/contracts";

export type ExperimentalInvoiceOriginal = { invoice: ExperimentalExactInvoice; entry: ExactDebtEntry; direction: "PAYABLE" | "RECEIVABLE" };

/** Internal source authority for a future paired-settlement composition. Not registered in a root or RPC. */
export class ExperimentalInvoiceSettlementParticipant {
  constructor(private readonly invoices: ExperimentalInvoiceRepository, private readonly finance: ExactFinanceService, private readonly ledger: ExactFinanceRepository) {
    const identity = finance.transactionIdentity;
    for (const participant of [invoices, ledger]) if (identity.connection !== participant.transactionIdentity.connection || identity.lock !== participant.transactionIdentity.lock) throw new Error("Experimental invoice settlement requires the same connection and shared FIFO");
  }

  lookupOriginal(originalEntryId: string): ExperimentalInvoiceOriginal | null {
    const entry = this.ledger.getEntry(originalEntryId);
    if (!entry || entry.status !== "LIVE" || entry.targetEntryId || entry.correctionOfEntryId || entry.producerType !== "INVOICE" || !entry.producerId || entry.invoiceId !== entry.producerId || Money.parse(entry.signedAmountDzd).compare(Money.parse("0")) <= 0) return null;
    const invoice = this.invoices.getInvoice(entry.producerId);
    if (!invoice || invoice.id !== entry.invoiceId || invoice.debtEntryId !== entry.id || invoice.debtAccountId !== entry.debtAccountId || !["RECEIVED", "PAID", "SETTLED"].includes(invoice.status)) return null;
    const account = this.finance.getAccount(entry.debtAccountId);
    const direction = invoice.direction === "PURCHASE" ? "PAYABLE" : "RECEIVABLE";
    if (account.partyType !== "EXTERNAL_COUNTERPARTY" || account.externalCounterpartyId !== invoice.counterpartyId || account.direction !== direction || account.currency !== "DZD" || invoice.counterpartyType !== "EXTERNAL_COUNTERPARTY" || invoice.currency !== "DZD") return null;
    return { invoice, entry, direction };
  }

  validateEligible(originalEntryId: string): ExperimentalInvoiceOriginal {
    const source = this.lookupOriginal(originalEntryId);
    if (!source) throw new Error("Invoice original is not owned by an eligible received external invoice");
    const remaining = Money.parse(this.finance.remaining(source.entry.id));
    if (remaining.compare(Money.parse("0")) <= 0 || remaining.toWire() !== source.invoice.remainingAmount) throw new Error("Invoice remaining amount is stale or exhausted");
    const actualPaid = Money.parse(this.invoices.listPayments().flatMap(payment => payment.allocations).filter(row => row.invoiceId === source.invoice.id && row.status === "LIVE").reduce((sum, row) => sum.add(Money.parse(row.amount)), Money.parse("0")).toWire());
    if (actualPaid.toWire() !== source.invoice.paidAmount) throw new Error("Invoice paid amount disagrees with live actual allocations");
    const portions = actualPaid.add(Money.parse(source.invoice.settledAmount)).add(remaining);
    if (portions.compare(Money.parse(source.invoice.totalAmount)) !== 0) throw new Error("Invoice portions do not reconcile");
    return source;
  }
}
