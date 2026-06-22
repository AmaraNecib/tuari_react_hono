import type { InvoiceRepository } from "./invoice.repository";
import {
  EmptyLineItemsError,
  InvalidInvoiceCursorError,
  InvalidInvoiceStatusError,
  InvoiceDebtPortError,
  InvoiceNotFoundError,
} from "./invoice.types";
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceActorContext,
  InvoiceCurrency,
  InvoiceDebtPort,
  InvoiceLineItem,
  InvoiceListFilters,
  InvoiceListSortField,
  ReceiveInvoiceResult,
  SortDirection,
  UpdateInvoiceInput,
} from "./invoice.types";

function calculateTotal(lineItems: { quantity: number; unitPrice: number }[]): number {
  return lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
}

interface CursorPayload {
  sortValue: number | string | null;
  id: string;
}

function decodeCursor(cursor: string): CursorPayload {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidInvoiceCursorError(cursor);
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as CursorPayload).id !== "string" ||
    (typeof (decoded as CursorPayload).sortValue !== "string" &&
      typeof (decoded as CursorPayload).sortValue !== "number" &&
      (decoded as CursorPayload).sortValue !== null)
  ) {
    throw new InvalidInvoiceCursorError(cursor);
  }
  return decoded as CursorPayload;
}

export class InvoiceModule {
  constructor(
    private readonly repo: InvoiceRepository,
    private readonly debtPort: InvoiceDebtPort,
  ) {}

  async findById(id: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
    return this.repo.findById(id);
  }

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    if (input.lineItems.length === 0) {
      throw new EmptyLineItemsError();
    }

    const now = new Date().toISOString();
    const totalAmount = calculateTotal(input.lineItems);
    const lineItemsWithTotal = input.lineItems.map((li) => ({
      ...li,
      total: li.quantity * li.unitPrice,
    }));
    const currency: InvoiceCurrency = input.currency ?? "DZD";

    return this.repo.create({
      id: input.id,
      invoiceNumber: input.invoiceNumber ?? null,
      supplierName: input.supplierName,
      supplierPhone: input.supplierPhone ?? null,
      warehouseId: input.warehouseId ?? null,
      projectId: input.projectId ?? null,
      status: "DRAFT",
      invoiceDate: input.invoiceDate ?? null,
      dueDate: input.dueDate ?? null,
      currency,
      totalAmount,
      paidAmount: 0,
      remainingAmount: totalAmount,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      lineItems: lineItemsWithTotal,
    });
  }

  async update(input: UpdateInvoiceInput): Promise<Invoice> {
    const existing = await this.repo.findById(input.id);
    if (!existing) throw new InvoiceNotFoundError(input.id);
    if (existing.status !== "DRAFT") {
      throw new InvalidInvoiceStatusError(input.id, "DRAFT", existing.status);
    }

    const updateData: Record<string, unknown> = {};
    if (input.invoiceNumber !== undefined) updateData.invoiceNumber = input.invoiceNumber;
    if (input.supplierName !== undefined) updateData.supplierName = input.supplierName;
    if (input.supplierPhone !== undefined) updateData.supplierPhone = input.supplierPhone;
    if (input.warehouseId !== undefined) updateData.warehouseId = input.warehouseId;
    if (input.projectId !== undefined) updateData.projectId = input.projectId;
    if (input.invoiceDate !== undefined) updateData.invoiceDate = input.invoiceDate;
    if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
    if (input.notes !== undefined) updateData.notes = input.notes;

    if (input.lineItems) {
      if (input.lineItems.length === 0) throw new EmptyLineItemsError();
      const totalAmount = calculateTotal(input.lineItems);
      updateData.totalAmount = totalAmount;
      updateData.remainingAmount = totalAmount - existing.paidAmount;
      updateData.lineItems = input.lineItems.map((li) => ({
        ...li,
        total: li.quantity * li.unitPrice,
      }));
    }

    if (input.currency !== undefined) {
      updateData.currency = input.currency;
    }

    updateData.updatedAt = new Date().toISOString();

    return this.repo.update(input.id, updateData as never);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new InvoiceNotFoundError(id);
    if (existing.status !== "DRAFT") {
      throw new InvalidInvoiceStatusError(id, "DRAFT", existing.status);
    }
    return this.repo.delete(id);
  }

  /**
   * Transitions an invoice from DRAFT → RECEIVED and creates the
   * debt account + opening entry that backs the unpaid amount.
   * The invoice stays RECEIVED until paidAmount >= totalAmount.
   */
  async receive(id: string, actor: InvoiceActorContext): Promise<ReceiveInvoiceResult> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new InvoiceNotFoundError(id);
    if (existing.status !== "DRAFT") {
      throw new InvalidInvoiceStatusError(id, "DRAFT", existing.status);
    }

    let debtAccountId: string;
    try {
      const result = await this.debtPort.createInvoiceDebt({
        invoiceId: id,
        supplierName: existing.supplierName,
        supplierPhone: existing.supplierPhone,
        amount: existing.totalAmount,
        currency: existing.currency,
        actorUserId: actor.actorUserId,
        actorLabel: actor.actorLabel,
        transactionId: actor.transactionId,
      });
      debtAccountId = result.debtAccountId;
    } catch (error) {
      throw new InvoiceDebtPortError(
        `Failed to create invoice debt: ${String(error)}`,
      );
    }

    // Atomic single-statement write: status + debt_account_id + updated_at
    // either all land or none. No risk of leaving the invoice stranded in
    // RECEIVED with a null debt_account_id if the next call would fail.
    const updated = await this.repo.markReceivedWithDebtAccount(id, debtAccountId);
    return {
      invoice: updated,
      debtAccountId,
    };
  }

  /**
   * Records a payment against the invoice's debt account. The debt
   * port returns the new paid/remaining balance and whether the debt
   * is fully settled. The invoice transitions to PAID only when the
   * debt settles; otherwise it stays RECEIVED with the remaining
   * amount still owed.
   */
  async markPaid(
    id: string,
    amount: number,
    actor: InvoiceActorContext,
  ): Promise<Invoice> {
    if (amount <= 0) {
      throw new InvoiceDebtPortError("amount must be positive");
    }

    const existing = await this.repo.findById(id);
    if (!existing) throw new InvoiceNotFoundError(id);
    if (existing.status !== "RECEIVED") {
      throw new InvalidInvoiceStatusError(id, "RECEIVED", existing.status);
    }
    if (!existing.debtAccountId) {
      throw new InvoiceDebtPortError("Invoice has no debt account");
    }

    let payment;
    try {
      payment = await this.debtPort.recordInvoicePayment({
        invoiceId: id,
        amount,
        actorUserId: actor.actorUserId,
        actorLabel: actor.actorLabel,
        transactionId: actor.transactionId,
      });
    } catch (error) {
      throw new InvoiceDebtPortError(
        `Failed to record invoice payment: ${String(error)}`,
      );
    }

    return this.repo.updateStatus(
      id,
      payment.settled ? "PAID" : "RECEIVED",
      {
        paidAmount: payment.newPaidAmount,
        remainingAmount: payment.newRemainingAmount,
      },
    );
  }

  async listPaged(query: {
    filters?: InvoiceListFilters;
    sort?: { field: InvoiceListSortField; direction: SortDirection };
    cursor?: string;
    limit: number;
  }): Promise<{ items: Invoice[]; nextCursor: string | null; totalCount: number }> {
    const after = query.cursor ? decodeCursor(query.cursor) : undefined;

    return this.repo.findPaged({
      filters: query.filters,
      sort: query.sort,
      after,
      limit: query.limit,
    });
  }
}
