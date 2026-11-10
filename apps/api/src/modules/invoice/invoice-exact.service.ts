import { createHash } from "node:crypto";
import {
  Money, allocateMoney, finalizeLines, parseExactLine, sumMoney,
  exactInvoiceCreateSchema, exactInvoiceUpdateSchema, exactInvoiceCommandSchema, exactInvoiceVoidSchema,
  exactPaymentCreateSchema, exactPaymentAllocateSchema, exactInvoiceListSchema, exactPaymentListSchema,
  exactInvoiceAmountSchema, timestampSchema,
  type ExactInvoice, type ExactPayment, type ExactInvoiceCreate, type ExactInvoiceUpdate,
  type ExactInvoiceCommand, type ExactInvoiceVoid, type ExactPaymentCreate, type ExactPaymentAllocate,
  type ExactInvoiceList, type ExactPaymentList, type ExactFinanceAggregateOwner,
} from "@tuari/contracts";
import { ExactFinanceService, ExactDebtError, type ExactDebtAudit } from "../company/exact-finance.service";
import type { ExactInvoiceRepository } from "./invoice-exact.repository";

type AuditInput<T> = T & ExactDebtAudit;
const domainInput = <T extends ExactDebtAudit>(raw: T) => {
  const input = { ...raw };
  delete input.actorUserId; delete input.actorLabel; delete input.transactionId;
  return input;
};
const zero = () => Money.parse("0");
const sum = (values: string[]) => Money.parse(sumMoney(values.map(value => Money.parse(value))));
const request = (root: string, kind: string, id: string) => `invoice:${createHash("sha256").update(JSON.stringify([root, kind, id])).digest("hex")}`;
const auditOf = (input: ExactDebtAudit) => ({ actorUserId: input.actorUserId ?? null, actorLabel: input.actorLabel ?? null, transactionId: input.transactionId ?? null });
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Opt-in invoice/cash aggregate. No active numeric repository is used. */
export class ExactInvoiceService {
  constructor(private readonly repo: ExactInvoiceRepository, private readonly finance: ExactFinanceService, private readonly dependencies: { id(): string; now(): string }) {}
  private command<T>(kind: string, owner: ExactFinanceAggregateOwner, input: { requestId: string } & ExactDebtAudit, intent: unknown, work: () => T): T {
    return this.finance.runAggregate({ requestId: input.requestId, producer: owner, intent: { kind, input: intent }, ...auditOf(input) }, this.repo, work);
  }
  getInvoice(id: string): ExactInvoice {
    const row = this.repo.getInvoice(id);
    if (!row) throw new ExactDebtError("Invoice not found", "NOT_FOUND");
    return row;
  }
  getPayment(id: string): ExactPayment {
    const row = this.repo.getPayment(id);
    if (!row) throw new ExactDebtError("Payment not found", "NOT_FOUND");
    return row;
  }
  createInvoice(raw: AuditInput<ExactInvoiceCreate>): ExactInvoice {
    const input = exactInvoiceCreateSchema.parse(domainInput(raw));
    return this.command("create-invoice", { type: "INVOICE", id: input.id ?? request(input.requestId, "create-invoice", "") }, raw, input, () => {
      const id = input.id ?? this.dependencies.id();
      if (this.repo.getInvoice(id)) throw new ExactDebtError("Duplicate invoice id", "CONFLICT");
      this.finance.requireParty(input.counterpartyType === "WORKER" ? "INTERNAL_WORKER" : "EXTERNAL_COUNTERPARTY", input.counterpartyId);
      const now = this.dependencies.now();
      const total = finalizeLines(input.lineItems.map(line => parseExactLine(line.source))).toWire();
      const invoice: ExactInvoice = {
        id, counterpartyType: input.counterpartyType, counterpartyId: input.counterpartyId,
        supplierName: input.supplierName, supplierPhone: input.supplierPhone ?? null, invoiceNumber: input.invoiceNumber ?? null,
        warehouseId: input.warehouseId ?? null, projectId: input.projectId ?? null, invoiceDate: input.invoiceDate ?? null, dueDate: input.dueDate ?? null,
        notes: input.notes ?? null, currency: input.currency, direction: input.direction, status: "DRAFT", totalAmount: total,
        paidAmount: "0.00", remainingAmount: total, debtAccountId: null, debtEntryId: null, createdAt: now, updatedAt: now,
        lineItems: input.lineItems.map(line => ({ ...line, id: this.dependencies.id(), invoiceId: id })),
      };
      this.repo.saveInvoice(invoice);
      return invoice;
    });
  }
  updateInvoice(raw: AuditInput<ExactInvoiceUpdate>): ExactInvoice {
    const input = exactInvoiceUpdateSchema.parse(domainInput(raw));
    return this.command("update-invoice", { type: "INVOICE", id: input.id }, raw, input, () => {
      const invoice = this.getInvoice(input.id);
      if (invoice.status !== "DRAFT") throw new ExactDebtError("Only draft invoices can be edited");
      const next = { ...invoice };
      for (const key of ["invoiceNumber", "supplierName", "supplierPhone", "warehouseId", "projectId", "invoiceDate", "dueDate", "notes"] as const) {
        if (input[key] !== undefined) Object.assign(next, { [key]: input[key] });
      }
      if (input.lineItems) {
        next.lineItems = input.lineItems.map(line => ({ ...line, id: this.dependencies.id(), invoiceId: invoice.id }));
        next.totalAmount = finalizeLines(next.lineItems.map(line => parseExactLine(line.source))).toWire();
        next.remainingAmount = next.totalAmount;
      }
      next.updatedAt = this.dependencies.now();
      this.repo.saveInvoice(next);
      return next;
    });
  }
  deleteDraft(raw: AuditInput<ExactInvoiceCommand>): { id: string } {
    const input = exactInvoiceCommandSchema.parse(domainInput(raw));
    return this.command("delete-invoice", { type: "INVOICE", id: input.id }, raw, input, () => {
      if (this.getInvoice(input.id).status !== "DRAFT") throw new ExactDebtError("Only draft invoices can be deleted");
      this.repo.deleteInvoice(input.id);
      return { id: input.id };
    });
  }
  receiveInvoice(raw: AuditInput<ExactInvoiceCommand>): ExactInvoice {
    const input = exactInvoiceCommandSchema.parse(domainInput(raw));
    return this.command("receive-invoice", { type: "INVOICE", id: input.id }, raw, input, () => {
      const invoice = this.getInvoice(input.id);
      if (invoice.status !== "DRAFT") throw new ExactDebtError("Only draft invoices can be received");
      const port = this.finance.forProducer({ type: "INVOICE", id: invoice.id });
      const account = port.createAccount({ requestId: request(input.requestId, "account", invoice.id),
        partyType: invoice.counterpartyType === "WORKER" ? "INTERNAL_WORKER" : "EXTERNAL_COUNTERPARTY",
        workerId: invoice.counterpartyType === "WORKER" ? invoice.counterpartyId : null,
        externalCounterpartyId: invoice.counterpartyType === "EXTERNAL_COUNTERPARTY" ? invoice.counterpartyId : null,
        direction: invoice.direction === "SALE" ? "RECEIVABLE" : "PAYABLE", currency: invoice.currency, ...auditOf(raw) });
      const entry = invoice.totalAmount === "0.00" ? null : port.postEntry({ requestId: request(input.requestId, "original", invoice.id),
        invoiceId: invoice.id, debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: invoice.totalAmount, currency: invoice.currency, ...auditOf(raw) });
      const next: ExactInvoice = { ...invoice, status: entry ? "RECEIVED" : "PAID", debtAccountId: account.id, debtEntryId: entry?.id ?? null, updatedAt: this.dependencies.now() };
      this.repo.saveInvoice(next);
      return next;
    });
  }
  createPayment(raw: AuditInput<ExactPaymentCreate>): ExactPayment {
    const input = exactPaymentCreateSchema.parse(domainInput(raw));
    return this.command("create-payment", { type: "PAYMENT", id: input.id ?? request(input.requestId, "create-payment", "") }, raw, input, () => {
      const id = input.id ?? this.dependencies.id();
      if (this.repo.getPayment(id)) throw new ExactDebtError("Duplicate payment id", "CONFLICT");
      this.finance.requireParty(input.counterpartyType === "WORKER" ? "INTERNAL_WORKER" : "EXTERNAL_COUNTERPARTY", input.counterpartyId);
      const now = this.dependencies.now();
      const payment: ExactPayment = { id, counterpartyType: input.counterpartyType, counterpartyId: input.counterpartyId,
        currency: input.currency, direction: input.direction, paymentDate: input.paymentDate, paymentMethod: input.paymentMethod,
        totalAmount: input.totalAmount, unallocatedAmount: input.totalAmount, notes: input.notes ?? null, status: "LIVE", allocations: [],
        ...auditOf(raw), createdAt: now, updatedAt: now };
      this.applyAllocations(payment, input.allocations, input.requestId, raw);
      this.repo.savePayment(payment);
      return payment;
    });
  }
  allocatePayment(raw: AuditInput<ExactPaymentAllocate>): ExactPayment {
    const input = exactPaymentAllocateSchema.parse(domainInput(raw));
    return this.command("allocate-payment", { type: "PAYMENT", id: input.id }, raw, input, () => {
      const payment = this.getPayment(input.id);
      if (payment.status !== "LIVE") throw new ExactDebtError("Voided payments cannot be allocated");
      this.applyAllocations(payment, input.allocations, input.requestId, raw);
      payment.updatedAt = this.dependencies.now();
      this.repo.savePayment(payment);
      return payment;
    });
  }
  private applyAllocations(payment: ExactPayment, allocations: { invoiceId: string; amount: string }[], root: string, audit: ExactDebtAudit): void {
    const allocated = sum(allocations.map(row => row.amount));
    if (allocated.compare(Money.parse(payment.unallocatedAmount)) > 0) throw new ExactDebtError("Allocation sum exceeds unallocated payment");
    for (const [index, allocation] of allocations.entries()) {
      const invoice = this.getInvoice(allocation.invoiceId);
      if (invoice.status !== "RECEIVED" || !invoice.debtEntryId) throw new ExactDebtError("Invoice is not available for payment");
      if (invoice.counterpartyType !== payment.counterpartyType || invoice.counterpartyId !== payment.counterpartyId || invoice.currency !== payment.currency || invoice.direction !== payment.direction) throw new ExactDebtError("Payment party, currency and direction must match invoice");
      const amount = Money.parse(allocation.amount);
      const remaining = Money.parse(this.finance.remaining(invoice.debtEntryId));
      if (remaining.toWire() !== invoice.remainingAmount) throw new ExactDebtError("Invoice and linked debt disagree", "CONFLICT");
      if (amount.compare(remaining) > 0) throw new ExactDebtError("Allocation exceeds remaining invoice");
      const entry = this.finance.forProducer({ type: "INVOICE", id: invoice.id }).recordPayment({ requestId: request(root, "allocation", `${payment.id}:${index}`),
        debtEntryId: invoice.debtEntryId, amountDzd: amount.toWire(), currency: payment.currency, paymentMethod: payment.paymentMethod, ...auditOf(audit) });
      const paid = Money.parse(invoice.paidAmount).add(amount);
      const nextRemaining = remaining.subtract(amount);
      this.repo.saveInvoice({ ...invoice, paidAmount: paid.toWire(), remainingAmount: nextRemaining.toWire(), status: nextRemaining.compare(zero()) === 0 ? "PAID" : "RECEIVED", updatedAt: this.dependencies.now() });
      payment.allocations.push({ id: this.dependencies.id(), paymentId: payment.id, invoiceId: invoice.id, amount: amount.toWire(), debtEntryId: entry.id, status: "LIVE", createdAt: this.dependencies.now() });
    }
    payment.unallocatedAmount = Money.parse(payment.unallocatedAmount).subtract(allocated).toWire();
  }
  voidPayment(raw: AuditInput<ExactInvoiceVoid>): ExactPayment {
    const input = exactInvoiceVoidSchema.parse(domainInput(raw));
    return this.command("void-payment", { type: "PAYMENT", id: input.id }, raw, input, () => {
      const payment = this.getPayment(input.id);
      if (payment.status !== "LIVE") throw new ExactDebtError("Payment is already voided");
      for (const allocation of payment.allocations.filter(row => row.status === "LIVE")) {
        const invoice = this.getInvoice(allocation.invoiceId);
        this.finance.forProducer({ type: "INVOICE", id: invoice.id }).voidEntry({ requestId: request(input.requestId, "void-allocation", allocation.id), entryId: allocation.debtEntryId, voidReason: input.reason, ...auditOf(raw) });
        const amount = Money.parse(allocation.amount);
        this.repo.saveInvoice({ ...invoice, paidAmount: Money.parse(invoice.paidAmount).subtract(amount).toWire(), remainingAmount: Money.parse(invoice.remainingAmount).add(amount).toWire(), status: "RECEIVED", updatedAt: this.dependencies.now() });
        allocation.status = "VOIDED";
      }
      payment.status = "VOIDED";
      payment.unallocatedAmount = payment.totalAmount;
      payment.updatedAt = this.dependencies.now();
      this.repo.savePayment(payment);
      return payment;
    });
  }
  voidInvoice(raw: AuditInput<ExactInvoiceVoid>): ExactInvoice {
    const input = exactInvoiceVoidSchema.parse(domainInput(raw));
    return this.command("void-invoice", { type: "INVOICE", id: input.id }, raw, input, () => {
      const invoice = this.getInvoice(input.id);
      if (invoice.status === "DRAFT" || invoice.status === "VOIDED") throw new ExactDebtError("Only received or paid invoices can be voided");
      if (invoice.debtEntryId) this.finance.forProducer({ type: "INVOICE", id: invoice.id }).voidEntry({ requestId: request(input.requestId, "void-original", invoice.id), entryId: invoice.debtEntryId, voidReason: input.reason, ...auditOf(raw) });
      for (const payment of this.repo.listPayments().filter(row => row.status === "LIVE")) {
        const affected = payment.allocations.filter(row => row.invoiceId === invoice.id && row.status === "LIVE");
        if (!affected.length) continue;
        for (const row of affected) row.status = "VOIDED";
        payment.unallocatedAmount = Money.parse(payment.unallocatedAmount).add(sum(affected.map(row => row.amount))).toWire();
        payment.updatedAt = this.dependencies.now();
        this.repo.savePayment(payment);
      }
      const next: ExactInvoice = { ...invoice, status: "VOIDED", paidAmount: "0.00", remainingAmount: "0.00", updatedAt: this.dependencies.now() };
      this.repo.saveInvoice(next);
      return next;
    });
  }
  deleteUnallocatedPayment(raw: AuditInput<ExactInvoiceCommand>): { id: string } {
    const input = exactInvoiceCommandSchema.parse(domainInput(raw));
    return this.command("delete-payment", { type: "PAYMENT", id: input.id }, raw, input, () => {
      const payment = this.getPayment(input.id);
      if (payment.allocations.length) throw new ExactDebtError("Payment with allocation history cannot be deleted", "CONFLICT");
      this.repo.deletePayment(payment.id);
      return { id: payment.id };
    });
  }
  splitPayment(amount: string, invoiceIds: string[]): { invoiceId: string; amount: string }[] {
    if (!invoiceIds.length || invoiceIds.length > 1000 || new Set(invoiceIds).size !== invoiceIds.length) throw new ExactDebtError("Split requires distinct recorded invoice identities");
    return allocateMoney(Money.parse(amount), invoiceIds.map(id => ({ id, weight: "1" })))
      .filter(row => row.amount.compare(zero()) > 0).map(row => ({ invoiceId: row.id, amount: row.amount.toWire() }));
  }
  listInvoices(raw: ExactInvoiceList = {}) {
    const input = exactInvoiceListSchema.parse(raw);
    const rows = this.repo.listInvoices().filter(row => (!input.filters?.status || row.status === input.filters.status) && (!input.filters?.counterpartyId || row.counterpartyId === input.filters.counterpartyId));
    return page(rows, "invoice", input.sort ?? { field: "createdAt", direction: "desc" }, input.cursor, input.limit);
  }
  listPayments(raw: ExactPaymentList = {}) {
    const input = exactPaymentListSchema.parse(raw);
    const rows = this.repo.listPayments().filter(row => (!input.filters?.counterpartyId || row.counterpartyId === input.filters.counterpartyId) && (!input.filters?.direction || row.direction === input.filters.direction));
    return page(rows, "payment", input.sort ?? { field: "createdAt", direction: "desc" }, input.cursor, input.limit);
  }
}

function compareTimestamp(a: string, b: string): number {
  // Compare whole instants, then preserve accepted sub-millisecond precision.
  const whole = Date.parse(a.replace(/\.\d+/, "")) - Date.parse(b.replace(/\.\d+/, ""));
  if (whole) return whole;
  const left = a.match(/\.(\d+)/)?.[1] ?? "";
  const right = b.match(/\.(\d+)/)?.[1] ?? "";
  const width = Math.max(left.length, right.length);
  return compareText(left.padEnd(width, "0"), right.padEnd(width, "0"));
}

function page<T extends { id: string; totalAmount: string }>(rows: T[], collection: string, sort: { field: string; direction: "asc" | "desc" }, cursor: string | undefined, limit: number) {
  if (rows.length > 100000) throw new ExactDebtError("Exact financial read resource limit exceeded");
  const value = (row: T): string | null => (row as Record<string, unknown>)[sort.field] as string | null;
  const compare = (a: string | null, b: string | null) => a === b ? 0 : a === null ? -1 : b === null ? 1 : sort.field === "totalAmount" ? Money.parse(a).compare(Money.parse(b)) : compareTimestamp(a, b);
  const sign = sort.direction === "asc" ? 1 : -1;
  rows.sort((a, b) => sign * (compare(value(a), value(b)) || compareText(a.id, b.id)));
  let after: { sortValue: string | null; id: string } | null = null;
  if (cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      const validValue = sort.field === "totalAmount" ? exactInvoiceAmountSchema.safeParse(parsed.sortValue).success
        : parsed.sortValue === null && sort.field === "invoiceDate" || timestampSchema.safeParse(parsed.sortValue).success;
      if (parsed.v === 1 && parsed.collection === collection && parsed.field === sort.field && parsed.direction === sort.direction && typeof parsed.id === "string" && validValue) after = parsed;
    } catch { /* Invalid cursor starts at the first page, matching the existing payment contract. */ }
  }
  const remaining = after ? rows.filter(row => sign * (compare(value(row), after!.sortValue) || compareText(row.id, after!.id)) > 0) : rows;
  const items = remaining.slice(0, limit);
  const last = items.at(-1);
  const hasMore = remaining.length > limit;
  return { items, totalCount: rows.length, hasMore, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ v: 1, collection, ...sort, sortValue: value(last), id: last.id })).toString("base64url") : null };
}
