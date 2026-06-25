import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createInMemoryInvoiceRepository } from "../invoice/adapters/in-memory-invoice.repository";
import { createInMemoryInvoiceDebtPort } from "../invoice/adapters/invoice-debt.port";
import { createInMemoryPaymentRepository } from "./adapters/in-memory-payment.repository";
import { createPaymentModule } from "./payment.module";
import type { PaymentModule } from "./payment-module.interface";
import type { CreatePaymentInput } from "./payment.types";
import {
  PaymentAllocationSumMismatchError,
  PaymentInvoiceNotFoundError,
  PaymentInvoiceNotReceivedError,
  PaymentInvoiceOverAllocationError,
  PaymentNotFoundError,
} from "./payment.types";

function makeInvoiceInput(overrides: Partial<{
  id: string;
  supplierName: string;
  totalAmount: number;
  direction: string;
}> = {}) {
  return {
    id: overrides.id ?? "inv-1",
    supplierName: overrides.supplierName ?? "Acme Corp",
    lineItems: [
      { id: "li-1", description: "Cement", quantity: 10, unitPrice: overrides.totalAmount ? overrides.totalAmount / 10 : 500 },
    ],
    direction: (overrides.direction ?? "PURCHASE") as "PURCHASE" | "SALE",
  };
}

function makePaymentInput(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
  return {
    id: "pmt-1",
    counterpartyType: "EXTERNAL_COUNTERPARTY",
    counterpartyId: "cp-1",
    paymentDate: "2026-06-25T10:00:00.000Z",
    paymentMethod: "CASH",
    totalAmount: 5000,
    allocations: [
      { invoiceId: "inv-1", amount: 5000 },
    ],
    ...overrides,
  };
}

describe("PaymentModule", () => {
  let paymentModule: PaymentModule;
  let paymentRepo: ReturnType<typeof createInMemoryPaymentRepository>;
  let invoiceRepo: ReturnType<typeof createInMemoryInvoiceRepository>;
  let debtPort: ReturnType<typeof createInMemoryInvoiceDebtPort>;

  beforeEach(() => {
    paymentRepo = createInMemoryPaymentRepository();
    invoiceRepo = createInMemoryInvoiceRepository();
    debtPort = createInMemoryInvoiceDebtPort();
    paymentModule = createPaymentModule(paymentRepo, invoiceRepo, debtPort);
  });

  describe("create", () => {
    it("creates a payment with one allocation and links it to an invoice", async () => {
      // Arrange — create invoice and receive it
      const invoice = await invoiceRepo.create({
        id: "inv-1",
        invoiceNumber: null,
        supplierName: "Acme Corp",
        supplierPhone: null,
        warehouseId: null,
        projectId: null,
        status: "DRAFT",
        direction: "PURCHASE",
        invoiceDate: null,
        dueDate: null,
        currency: "DZD",
        totalAmount: 5000,
        paidAmount: 0,
        remainingAmount: 5000,
        notes: null,
        debtAccountId: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        lineItems: [
          { id: "li-1", invoiceId: "inv-1", description: "Cement", quantity: 10, unitPrice: 500, total: 5000 },
        ],
      });

      // Receive the invoice — this creates the debt account via the debt port
      await debtPort.createInvoiceDebt({
        invoiceId: "inv-1",
        supplierName: "Acme Corp",
        supplierPhone: null,
        amount: 5000,
        currency: "DZD",
        direction: "PURCHASE",
        actorUserId: "user-1",
        actorLabel: "Test User",
        transactionId: "tx-1",
      });

      // Manually update invoice status to RECEIVED with debt_account_id
      const debtAccountId = debtPort.state.debtAccounts.values().next().value!.id;
      await invoiceRepo.markReceivedWithDebtAccount("inv-1", debtAccountId);

      // Act
      const result = await paymentModule.create(makePaymentInput());

      // Assert — payment record
      expect(result).not.toBeNull();
      expect(result!.id).toBe("pmt-1");
      expect(result!.totalAmount).toBe(5000);
      expect(result!.paymentMethod).toBe("CASH");
      expect(result!.allocations).toHaveLength(1);

      // Assert — allocation
      const alloc = result!.allocations[0]!;
      expect(alloc.invoiceId).toBe("inv-1");
      expect(alloc.amount).toBe(5000);

      // Assert — invoice updated
      const updatedInvoice = await invoiceRepo.findById("inv-1");
      expect(updatedInvoice).not.toBeNull();
      expect(updatedInvoice!.paidAmount).toBe(5000);
      expect(updatedInvoice!.remainingAmount).toBe(0);
      expect(updatedInvoice!.status).toBe("PAID");

      // Assert — debt entry created
      const debtEntries = debtPort.state.entries.filter((e) => e.entryType === "PAYMENT");
      expect(debtEntries).toHaveLength(1);
      expect(debtEntries[0]!.signedAmount).toBe(-5000);
    });

    it("rejects allocation total that differs from payment amount", async () => {
      const input = makePaymentInput({
        totalAmount: 5000,
        allocations: [{ invoiceId: "inv-1", amount: 3000 }],
      });

      await expect(paymentModule.create(input)).rejects.toBeInstanceOf(
        PaymentAllocationSumMismatchError,
      );
    });

    it("rejects allocation to non-existent invoice", async () => {
      await expect(
        paymentModule.create(makePaymentInput({ allocations: [{ invoiceId: "inv-missing", amount: 5000 }] })),
      ).rejects.toBeInstanceOf(PaymentInvoiceNotFoundError);
    });

    it("rejects allocation to invoice in DRAFT status", async () => {
      await invoiceRepo.create({
        id: "inv-draft",
        invoiceNumber: null,
        supplierName: "Test",
        supplierPhone: null,
        warehouseId: null,
        projectId: null,
        status: "DRAFT",
        direction: "PURCHASE",
        invoiceDate: null,
        dueDate: null,
        currency: "DZD",
        totalAmount: 5000,
        paidAmount: 0,
        remainingAmount: 5000,
        notes: null,
        debtAccountId: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        lineItems: [],
      });

      await expect(
        paymentModule.create(makePaymentInput({ allocations: [{ invoiceId: "inv-draft", amount: 5000 }] })),
      ).rejects.toBeInstanceOf(PaymentInvoiceNotReceivedError);
    });

    it("rejects over-allocation exceeding invoice remaining amount", async () => {
      // Create and receive invoice for 5000
      const invoice = await invoiceRepo.create({
        id: "inv-over",
        invoiceNumber: null,
        supplierName: "Acme Corp",
        supplierPhone: null,
        warehouseId: null,
        projectId: null,
        status: "DRAFT",
        direction: "PURCHASE",
        invoiceDate: null,
        dueDate: null,
        currency: "DZD",
        totalAmount: 5000,
        paidAmount: 0,
        remainingAmount: 5000,
        notes: null,
        debtAccountId: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        lineItems: [],
      });

      await debtPort.createInvoiceDebt({
        invoiceId: "inv-over",
        supplierName: "Acme Corp",
        supplierPhone: null,
        amount: 5000,
        currency: "DZD",
        direction: "PURCHASE",
        actorUserId: "user-1",
        actorLabel: "Test User",
        transactionId: "tx-1",
      });
      const debtAccountId = debtPort.state.debtAccounts.values().next().value!.id;
      await invoiceRepo.markReceivedWithDebtAccount("inv-over", debtAccountId);

      await expect(
        paymentModule.create(makePaymentInput({
          id: 'pmt-over',
          totalAmount: 6000,
          allocations: [{ invoiceId: 'inv-over', amount: 6000 }],
        })),
      ).rejects.toBeInstanceOf(PaymentInvoiceOverAllocationError);
    });
  });

  describe("findById", () => {
    it("returns null for non-existent payment", async () => {
      const result = await paymentModule.findById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("rejects deletion of payment with allocations", async () => {
      // Create a payment with allocation via the module
      const invoice = await invoiceRepo.create({
        id: "inv-del",
        invoiceNumber: null,
        supplierName: "Acme Corp",
        supplierPhone: null,
        warehouseId: null,
        projectId: null,
        status: "DRAFT",
        direction: "PURCHASE",
        invoiceDate: null,
        dueDate: null,
        currency: "DZD",
        totalAmount: 3000,
        paidAmount: 0,
        remainingAmount: 3000,
        notes: null,
        debtAccountId: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        lineItems: [],
      });

      await debtPort.createInvoiceDebt({
        invoiceId: "inv-del",
        supplierName: "Acme Corp",
        supplierPhone: null,
        amount: 3000,
        currency: "DZD",
        direction: "PURCHASE",
        actorUserId: "user-1",
        actorLabel: "Test User",
        transactionId: "tx-1",
      });
      const debtAccountId = debtPort.state.debtAccounts.values().next().value!.id;
      await invoiceRepo.markReceivedWithDebtAccount("inv-del", debtAccountId);

      await paymentModule.create(makePaymentInput({
        id: "pmt-del",
        totalAmount: 3000,
        allocations: [{ invoiceId: "inv-del", amount: 3000 }],
      }));

      await expect(paymentModule.delete("pmt-del")).rejects.toThrow(
        "Cannot delete payment with existing allocations",
      );
    });

    it("deletes a payment without allocations", async () => {
      // Direct repo call to create payment without allocations
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
});
