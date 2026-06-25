import { describe, it, expect, beforeEach } from "vitest";

import { InvoiceModule } from "../../modules/invoice/invoice.module";
import { createInMemoryInvoiceRepository } from "../../modules/invoice/adapters/in-memory-invoice.repository";
import { createInMemoryInvoiceDebtPort } from "../../modules/invoice/adapters/invoice-debt.port";
import { createPaymentModule } from "../../modules/payment/payment.module";
import { createInMemoryPaymentRepository } from "../../modules/payment/adapters/in-memory-payment.repository";
import type { CreateInvoiceInput } from "../../modules/invoice/invoice.types";
import {
  PaymentAllocationSumMismatchError,
  PaymentInvoiceOverAllocationError,
  PaymentHasAllocationsError,
} from "../../modules/payment/payment.types";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const ACTOR = {
  actorUserId: "user-1",
  actorLabel: "Test User",
  transactionId: "tx-1",
};

function makeLineItems(
  items: Array<{ description: string; quantity: number; unitPrice: number }>,
) {
  return items.map((item, idx) => ({
    id: `li-${idx + 1}`,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

function invoiceInput(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    id: "inv-1",
    supplierName: "Acme Corp",
    lineItems: makeLineItems([
      { description: "Cement", quantity: 10, unitPrice: 500 },
    ]),
    ...overrides,
  };
}

function paymentInput(overrides: Record<string, unknown> = {}) {
  return {
    id: "pmt-1",
    counterpartyType: "EXTERNAL_COUNTERPARTY" as const,
    counterpartyId: "cp-1",
    paymentDate: "2026-06-25T10:00:00.000Z",
    paymentMethod: "CASH" as const,
    totalAmount: 5000,
    notes: null,
    allocations: [{ invoiceId: "inv-1", amount: 5000 }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite: Invoice → Payment cross-domain workflow
// ---------------------------------------------------------------------------

describe("Cross-domain: Invoice → Payment flow", () => {
  let invoiceModule: InvoiceModule;
  let paymentModule: ReturnType<typeof createPaymentModule>;
  let invoiceRepo: ReturnType<typeof createInMemoryInvoiceRepository>;
  let paymentRepo: ReturnType<typeof createInMemoryPaymentRepository>;
  let debtPort: ReturnType<typeof createInMemoryInvoiceDebtPort>;

  beforeEach(() => {
    invoiceRepo = createInMemoryInvoiceRepository();
    paymentRepo = createInMemoryPaymentRepository();
    debtPort = createInMemoryInvoiceDebtPort();
    invoiceModule = new InvoiceModule(invoiceRepo, debtPort);
    paymentModule = createPaymentModule(paymentRepo, invoiceRepo, debtPort);
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it("creates invoice → receives it → records payment → verifies settlement", async () => {
    // 1. Create invoice (DRAFT)
    const created = await invoiceModule.create(invoiceInput());
    expect(created.status).toBe("DRAFT");
    expect(created.totalAmount).toBe(5000);

    // 2. Mark as RECEIVED — creates debt account + opening entry
    const received = await invoiceModule.receive("inv-1", { ...ACTOR });
    expect(received.invoice.status).toBe("RECEIVED");
    expect(received.debtAccountId).toBeTruthy();

    // 3. Pay the invoice in full
    const payment = await paymentModule.create(paymentInput());
    expect(payment).not.toBeNull();

    // 4. Verify invoice now PAID
    const paidInvoice = await invoiceModule.findById("inv-1");
    expect(paidInvoice).not.toBeNull();
    expect(paidInvoice!.status).toBe("PAID");
    expect(paidInvoice!.paidAmount).toBe(5000);
    expect(paidInvoice!.remainingAmount).toBe(0);

    // 5. Verify debt account balance
    const debtAccounts = Array.from(debtPort.state.debtAccounts.values());
    expect(debtAccounts).toHaveLength(1);
    expect(debtAccounts[0]!.settled).toBe(true);

    // 6. Verify debt entries: one OPENING (5000) + one PAYMENT (-5000)
    const openings = debtPort.state.entries.filter((e) => e.entryType === "OPENING");
    const payments = debtPort.state.entries.filter((e) => e.entryType === "PAYMENT");
    expect(openings).toHaveLength(1);
    expect(openings[0]!.signedAmount).toBe(5000);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.signedAmount).toBe(-5000);

    // 7. Verify payment record and allocation
    const saved = await paymentModule.findById("pmt-1");
    expect(saved).not.toBeNull();
    expect(saved!.allocations).toHaveLength(1);
    expect(saved!.allocations[0]!.invoiceId).toBe("inv-1");
    expect(saved!.allocations[0]!.amount).toBe(5000);
  });

  it("handles partial payment correctly", async () => {
    // 1. Create an invoice for 10000
    await invoiceModule.create(invoiceInput({ id: "inv-2", lineItems: makeLineItems([{ description: "Steel", quantity: 5, unitPrice: 2000 }]) }));
    await invoiceModule.receive("inv-2", { ...ACTOR });

    // 2. Pay only 3000 of the 10000
    const payment = await paymentModule.create(paymentInput({
      id: "pmt-2",
      totalAmount: 3000,
      allocations: [{ invoiceId: "inv-2", amount: 3000 }],
    }));
    expect(payment).not.toBeNull();

    // 3. Invoice should still be RECEIVED (not PAID)
    const invoice = await invoiceModule.findById("inv-2");
    expect(invoice!.status).toBe("RECEIVED");
    expect(invoice!.paidAmount).toBe(3000);
    expect(invoice!.remainingAmount).toBe(7000);
  });

  it("rejects payment that over-allocates an invoice", async () => {
    await invoiceModule.create(invoiceInput({ id: "inv-3" }));
    await invoiceModule.receive("inv-3", { ...ACTOR });

    // Try to pay 6000 against a 5000 invoice
    await expect(
      paymentModule.create(paymentInput({
        id: "pmt-3",
        totalAmount: 6000,
        allocations: [{ invoiceId: "inv-3", amount: 6000 }],
      })),
    ).rejects.toBeInstanceOf(PaymentInvoiceOverAllocationError);
  });

  it("rejects payment with mismatched allocation total", async () => {
    await invoiceModule.create(invoiceInput({ id: "inv-4" }));
    await invoiceModule.receive("inv-4", { ...ACTOR });

    await expect(
      paymentModule.create(paymentInput({
        id: "pmt-4",
        totalAmount: 5000,
        allocations: [{ invoiceId: "inv-4", amount: 3000 }], // Only 3000 allocated
      })),
    ).rejects.toBeInstanceOf(PaymentAllocationSumMismatchError);
  });

  // -----------------------------------------------------------------------
  // Multi-invoice scenarios
  // -----------------------------------------------------------------------

  it("allocates a single payment across multiple invoices", async () => {
    // Create two invoices: 5000 + 3000 = 8000
    await invoiceModule.create(invoiceInput({ id: "inv-5a" }));
    await invoiceModule.receive("inv-5a", { ...ACTOR });

    await invoiceModule.create(invoiceInput({
      id: "inv-5b",
      lineItems: makeLineItems([{ description: "Sand", quantity: 10, unitPrice: 300 }]),
    }));
    await invoiceModule.receive("inv-5b", { ...ACTOR });

    // Single payment for both invoices
    const payment = await paymentModule.create({
      id: "pmt-5",
      counterpartyType: "EXTERNAL_COUNTERPARTY",
      counterpartyId: "cp-1",
      paymentDate: "2026-06-25T10:00:00.000Z",
      paymentMethod: "CASH",
      totalAmount: 8000,
      notes: null,
      allocations: [
        { invoiceId: "inv-5a", amount: 5000 },
        { invoiceId: "inv-5b", amount: 3000 },
      ],
    });

    expect(payment).not.toBeNull();
    expect(payment!.allocations).toHaveLength(2);

    // Both invoices should be PAID
    const invA = await invoiceModule.findById("inv-5a");
    expect(invA!.status).toBe("PAID");
    expect(invA!.remainingAmount).toBe(0);

    const invB = await invoiceModule.findById("inv-5b");
    expect(invB!.status).toBe("PAID");
    expect(invB!.remainingAmount).toBe(0);
  });

  it("allocates a single payment across multiple invoices partially", async () => {
    // Invoice A: 5000, Invoice B: 5000
    await invoiceModule.create(invoiceInput({ id: "inv-6a" }));
    await invoiceModule.receive("inv-6a", { ...ACTOR });

    await invoiceModule.create(invoiceInput({
      id: "inv-6b",
      lineItems: makeLineItems([{ description: "Gravel", quantity: 5, unitPrice: 1000 }]),
    }));
    await invoiceModule.receive("inv-6b", { ...ACTOR });

    // Pay 2000 to inv-6a, 1000 to inv-6b
    await paymentModule.create({
      id: "pmt-6",
      counterpartyType: "EXTERNAL_COUNTERPARTY",
      counterpartyId: "cp-1",
      paymentDate: "2026-06-25T10:00:00.000Z",
      paymentMethod: "CHECK",
      totalAmount: 3000,
      notes: null,
      allocations: [
        { invoiceId: "inv-6a", amount: 2000 },
        { invoiceId: "inv-6b", amount: 1000 },
      ],
    });

    const invA = await invoiceModule.findById("inv-6a");
    expect(invA!.status).toBe("RECEIVED");
    expect(invA!.paidAmount).toBe(2000);
    expect(invA!.remainingAmount).toBe(3000);

    const invB = await invoiceModule.findById("inv-6b");
    expect(invB!.status).toBe("RECEIVED");
    expect(invB!.paidAmount).toBe(1000);
    expect(invB!.remainingAmount).toBe(4000);
  });

  // -----------------------------------------------------------------------
  // Error: duplicate invoiceId in allocations
  // -----------------------------------------------------------------------

  it("rejects when duplicate invoiceId entries exceed remaining capacity combined", async () => {
    // Create invoice for 5000
    await invoiceModule.create(invoiceInput({ id: "inv-dup" }));
    await invoiceModule.receive("inv-dup", { ...ACTOR });

    // Two allocations against the same invoice: 3000 + 3000 = 6000 total
    await expect(
      paymentModule.create({
        id: "pmt-dup",
        counterpartyType: "EXTERNAL_COUNTERPARTY",
        counterpartyId: "cp-1",
        paymentDate: "2026-06-25T10:00:00.000Z",
        paymentMethod: "CASH",
        totalAmount: 6000,
        notes: null,
        allocations: [
          { invoiceId: "inv-dup", amount: 3000 },
          { invoiceId: "inv-dup", amount: 3000 },
        ],
      }),
    ).rejects.toBeInstanceOf(PaymentInvoiceOverAllocationError);
    // Each individual allocation (3000) is under the 5000 limit, but
    // combined (6000) exceeds it — the module must aggregate by invoiceId.
  });

  // -----------------------------------------------------------------------
  // Mixed allocation regression (Issue #12 bug where settled flag was
  // checked at the debt-account level instead of per-invoice)
  // -----------------------------------------------------------------------

  it("fully pays one invoice while leaving another partially unpaid on same debt account", async () => {
    // Invoice A: 5000 (will be paid in full)
    await invoiceModule.create(invoiceInput({ id: "inv-mix-a" }));
    await invoiceModule.receive("inv-mix-a", { ...ACTOR });

    // Invoice B: 5000 (will be paid only 2000)
    await invoiceModule.create(invoiceInput({
      id: "inv-mix-b",
      lineItems: makeLineItems([{ description: "Pipes", quantity: 5, unitPrice: 1000 }]),
    }));
    await invoiceModule.receive("inv-mix-b", { ...ACTOR });

    // Single payment: 5000 to inv-mix-a + 2000 to inv-mix-b = 7000
    const payment = await paymentModule.create({
      id: "pmt-mix",
      counterpartyType: "EXTERNAL_COUNTERPARTY",
      counterpartyId: "cp-1",
      paymentDate: "2026-06-25T10:00:00.000Z",
      paymentMethod: "CASH",
      totalAmount: 7000,
      notes: null,
      allocations: [
        { invoiceId: "inv-mix-a", amount: 5000 },
        { invoiceId: "inv-mix-b", amount: 2000 },
      ],
    });

    expect(payment).not.toBeNull();

    // Invoice A is fully paid
    const invA = await invoiceModule.findById("inv-mix-a");
    expect(invA!.status).toBe("PAID");
    expect(invA!.paidAmount).toBe(5000);
    expect(invA!.remainingAmount).toBe(0);

    // Invoice B is still receivable (partially paid)
    const invB = await invoiceModule.findById("inv-mix-b");
    expect(invB!.status).toBe("RECEIVED");
    expect(invB!.paidAmount).toBe(2000);
    expect(invB!.remainingAmount).toBe(3000);

    // Debt account is NOT settled (inv-mix-b still owes)
    const debtAccounts = Array.from(debtPort.state.debtAccounts.values());
    expect(debtAccounts).toHaveLength(1);
    expect(debtAccounts[0]!.settled).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Delete behaviours
  // -----------------------------------------------------------------------

  it("rejects deletion of a payment that has allocations", async () => {
    await invoiceModule.create(invoiceInput({ id: "inv-del" }));
    await invoiceModule.receive("inv-del", { ...ACTOR });
    await paymentModule.create(paymentInput({
      id: "pmt-del",
      allocations: [{ invoiceId: "inv-del", amount: 5000 }],
    }));

    await expect(
      paymentModule.delete("pmt-del"),
    ).rejects.toBeInstanceOf(PaymentHasAllocationsError);
  });

  it("deletes a payment that has no allocations", async () => {
    // Create a payment without allocations via the repo directly
    await paymentRepo.createPayment({
      id: "pmt-empty",
      counterpartyType: "EXTERNAL_COUNTERPARTY",
      counterpartyId: "cp-1",
      paymentDate: "2026-06-25T10:00:00.000Z",
      paymentMethod: "CASH",
      totalAmount: 1000,
      notes: null,
      actorUserId: null,
      actorLabel: null,
      transactionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await paymentModule.delete("pmt-empty");

    const result = await paymentModule.findById("pmt-empty");
    expect(result).toBeNull();
  });
});
