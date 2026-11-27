import { createHash } from "node:crypto";
import { Money } from "@tuari/contracts";
import { ExactDebtError, type ExactDebtAudit, type ExactFinanceService } from "../company/exact-finance.service";
import type { ManualSettlementRepository } from "../company/manual-settlement.repository";
import type { ExactFinanceRepository, ExactDebtEntry } from "../company/exact-finance.repository";
import type { ExperimentalInvoiceRepository } from "./invoice-exact.repository";
import type { ExperimentalExactInvoice } from "@tuari/contracts";

export type ExperimentalInvoiceOriginal = { invoice: ExperimentalExactInvoice; entry: ExactDebtEntry; direction: "PAYABLE" | "RECEIVABLE" };

/** Internal invoice-source authority. RPCs receive only the settlement service's typed projections. */
export class ExperimentalInvoiceSettlementParticipant {
  constructor(private readonly invoices: ExperimentalInvoiceRepository, private readonly finance: ExactFinanceService, private readonly ledger: ExactFinanceRepository, private readonly dependencies: { now(): string } = { now: () => new Date().toISOString() }) {
    const identity = finance.transactionIdentity;
    for (const participant of [invoices, ledger]) if (identity.connection !== participant.transactionIdentity.connection || identity.lock !== participant.transactionIdentity.lock) throw new Error("Experimental invoice settlement requires the same connection and shared FIFO");
  }

  get transactionIdentity() { return this.invoices.transactionIdentity; }

  lookupOriginal(originalEntryId: string): ExperimentalInvoiceOriginal | null {
    return this.lookupLinkedOriginal(originalEntryId, false);
  }

  private lookupLinkedOriginal(originalEntryId: string, historical: boolean): ExperimentalInvoiceOriginal | null {
    const entry = this.ledger.getEntry(originalEntryId);
    if (!entry || !(entry.status === "LIVE" || historical && entry.status === "VOIDED") || entry.targetEntryId || entry.correctionOfEntryId || entry.producerType !== "INVOICE" || !entry.producerId || entry.invoiceId !== entry.producerId || Money.parse(entry.signedAmountDzd).compare(Money.parse("0")) <= 0) return null;
    const invoice = this.invoices.getInvoice(entry.producerId);
    if (!invoice || invoice.id !== entry.invoiceId || invoice.debtEntryId !== entry.id || invoice.debtAccountId !== entry.debtAccountId || !(["RECEIVED", "PAID", "SETTLED"].includes(invoice.status) || historical && invoice.status === "VOIDED") || Money.parse(entry.signedAmountDzd).compare(Money.parse(invoice.totalAmount)) !== 0 || entry.currency !== "DZD") return null;
    const account = this.finance.getAccount(entry.debtAccountId);
    const direction = invoice.direction === "PURCHASE" ? "PAYABLE" : "RECEIVABLE";
    if (account.partyType !== "EXTERNAL_COUNTERPARTY" || account.externalCounterpartyId !== invoice.counterpartyId || account.direction !== direction || account.currency !== "DZD" || invoice.counterpartyType !== "EXTERNAL_COUNTERPARTY" || invoice.currency !== "DZD") return null;
    return { invoice, entry, direction };
  }

  describeSource(originalEntryId: string): { kind: "INVOICE_PURCHASE" | "INVOICE_SALE"; id: string; label: string } | null {
    const source = this.lookupLinkedOriginal(originalEntryId, true);
    if (!source) return null;
    const kind = source.invoice.direction === "PURCHASE" ? "INVOICE_PURCHASE" : "INVOICE_SALE";
    const label = source.invoice.direction === "PURCHASE" ? "فاتورة شراء" : "فاتورة بيع";
    return { kind, id: source.invoice.id, label: `${label} ${source.invoice.invoiceNumber || source.invoice.id}` };
  }

  validateEligible(originalEntryId: string): ExperimentalInvoiceOriginal {
    const source = this.lookupOriginal(originalEntryId);
    if (!source) throw new ExactDebtError("Invoice original is not owned by an eligible received external invoice", "CONFLICT");
    const remaining = Money.parse(this.finance.remaining(source.entry.id));
    if (remaining.compare(Money.parse("0")) <= 0 || remaining.toWire() !== source.invoice.remainingAmount) throw new ExactDebtError("Invoice remaining amount is stale or exhausted", "CONFLICT");
    const actualPaid = this.invoices.listLiveAllocationAmountsByInvoice(source.invoice.id).reduce((sum, amount) => sum.add(Money.parse(amount)), Money.parse("0"));
    if (actualPaid.toWire() !== source.invoice.paidAmount) throw new ExactDebtError("Invoice paid amount disagrees with live actual allocations", "CONFLICT");
    const portions = actualPaid.add(Money.parse(source.invoice.settledAmount)).add(remaining);
    if (portions.compare(Money.parse(source.invoice.totalAmount)) !== 0) throw new ExactDebtError("Invoice portions do not reconcile", "CONFLICT");
    return source;
  }

  appendConfirmation(originalEntryId: string, amountDzd: string, requestId: string, audit: ExactDebtAudit) {
    const source = this.validateEligible(originalEntryId);
    const childRequest = `invoice-settlement:${createHash("sha256").update(JSON.stringify([requestId, originalEntryId])).digest("hex")}`;
    return this.finance.forProducer({ type: "INVOICE", id: source.invoice.id }).recordSettlement({ requestId: childRequest, debtEntryId: originalEntryId, amountDzd, currency: "DZD", ...audit });
  }

  appendReversal(originalEntryId: string, settlementPostingId: string, audit: ExactDebtAudit) {
    const source = this.lookupOriginal(originalEntryId);
    if (!source) throw new ExactDebtError("Invoice original linkage is invalid", "CONFLICT");
    return this.finance.forProducer({ type: "INVOICE", id: source.invoice.id }).appendInvoiceSettlementReversal(originalEntryId, settlementPostingId, audit);
  }

  reconcileProjection(originalEntryId: string, settlements: ManualSettlementRepository): void {
    const source = this.lookupOriginal(originalEntryId);
    if (!source) throw new ExactDebtError("Invoice original linkage is invalid", "CONFLICT");
    const linked = settlements.listAccountSettlements(source.invoice.debtAccountId!);
    const liveSettled = linked.filter(row => (row.payableOriginalEntryId === originalEntryId || row.receivableOriginalEntryId === originalEntryId) && !settlements.getReversal(row.id)).reduce((sum, row) => sum.add(Money.parse(row.amountDzd)), Money.parse("0"));
    const actualPaid = this.invoices.listLiveAllocationAmountsByInvoice(source.invoice.id).reduce((sum, amount) => sum.add(Money.parse(amount)), Money.parse("0"));
    const remaining = Money.parse(this.finance.remaining(originalEntryId));
    if (actualPaid.toWire() !== source.invoice.paidAmount || actualPaid.add(liveSettled).add(remaining).compare(Money.parse(source.invoice.totalAmount)) !== 0) throw new ExactDebtError("Invoice settlement projection does not reconcile", "CONFLICT");
    const status = remaining.compare(Money.parse("0")) > 0 ? "RECEIVED" : liveSettled.compare(Money.parse("0")) > 0 ? "SETTLED" : "PAID";
    this.invoices.saveInvoice({ ...source.invoice, status, settledAmount: liveSettled.toWire(), remainingAmount: remaining.toWire(), updatedAt: this.dependencies.now() });
  }
}
