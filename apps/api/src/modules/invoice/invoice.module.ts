import type { InvoiceRepository } from "./invoice.repository";
import type {
  Invoice,
  InvoiceLineItem,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  ReceiveInvoiceResult,
} from "./invoice.types";

export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Invoice not found: ${id}`);
    this.name = "InvoiceNotFoundError";
  }
}

export class InvalidInvoiceStatusError extends Error {
  constructor(id: string, expected: string, actual: string) {
    super(`Invoice ${id} must be ${expected} but is ${actual}`);
    this.name = "InvalidInvoiceStatusError";
  }
}

export class EmptyLineItemsError extends Error {
  constructor() {
    super("Invoice must have at least one line item");
    this.name = "EmptyLineItemsError";
  }
}

function calculateTotal(lineItems: { quantity: number; unitPriceDzd: number }[]): number {
  return lineItems.reduce((sum, li) => sum + li.quantity * li.unitPriceDzd, 0);
}

export class InvoiceModule {
  constructor(private readonly repo: InvoiceRepository) {}

  async findById(id: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
    return this.repo.findById(id);
  }

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    if (input.lineItems.length === 0) {
      throw new EmptyLineItemsError();
    }

    const now = new Date().toISOString();
    const totalAmountDzd = calculateTotal(input.lineItems);
    const lineItemsWithTotal = input.lineItems.map((li) => ({
      ...li,
      totalDzd: li.quantity * li.unitPriceDzd,
    }));

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
      totalAmountDzd,
      paidAmountDzd: 0,
      remainingAmountDzd: totalAmountDzd,
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
      const totalAmountDzd = calculateTotal(input.lineItems);
      updateData.totalAmountDzd = totalAmountDzd;
      updateData.remainingAmountDzd = totalAmountDzd - existing.paidAmountDzd;
      updateData.lineItems = input.lineItems.map((li) => ({
        ...li,
        totalDzd: li.quantity * li.unitPriceDzd,
      }));
    }

    updateData.updatedAt = new Date().toISOString();

    return this.repo.update(input.id, updateData);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new InvoiceNotFoundError(id);
    if (existing.status !== "DRAFT") {
      throw new InvalidInvoiceStatusError(id, "DRAFT", existing.status);
    }
    return this.repo.delete(id);
  }

  async receive(id: string): Promise<ReceiveInvoiceResult> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new InvoiceNotFoundError(id);
    if (existing.status !== "DRAFT") {
      throw new InvalidInvoiceStatusError(id, "DRAFT", existing.status);
    }

    const updated = await this.repo.updateStatus(id, "RECEIVED");
    const debtEntryId = `debt-${id}`;

    return {
      invoice: updated,
      debtEntryId,
    };
  }

  async markPaid(id: string, amountDzd: number): Promise<Invoice> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new InvoiceNotFoundError(id);
    if (existing.status !== "RECEIVED") {
      throw new InvalidInvoiceStatusError(id, "RECEIVED", existing.status);
    }

    const newPaidAmount = existing.paidAmountDzd + amountDzd;
    const newRemaining = Math.max(0, existing.totalAmountDzd - newPaidAmount);

    return this.repo.updateStatus(id, newPaidAmount >= existing.totalAmountDzd ? "PAID" : existing.status, {
      paidAmountDzd: newPaidAmount,
      remainingAmountDzd: newRemaining,
    });
  }

  async listPaged(query: {
    filters?: { status?: "DRAFT" | "RECEIVED" | "PAID"; supplierName?: string; warehouseId?: string; projectId?: string };
    cursor?: string;
    limit: number;
  }): Promise<{ items: Invoice[]; nextCursor: string | null; totalCount: number }> {
    let after: { sortValue: number | string; id: string } | undefined;
    if (query.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(query.cursor, "base64url").toString("utf8"),
        );
        after = { sortValue: decoded.sortValue, id: decoded.id };
      } catch {
        throw new Error("Invalid cursor");
      }
    }

    return this.repo.findPaged({
      filters: query.filters,
      after,
      limit: query.limit,
    });
  }
}
