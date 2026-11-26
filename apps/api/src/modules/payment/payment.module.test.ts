import { beforeEach, describe, expect, it } from "vitest";

import { createInMemoryInvoiceRepository } from "../invoice/adapters/in-memory-invoice.repository";
import { createInMemoryInvoiceDebtPort } from "../invoice/adapters/invoice-debt.port";
import { createInMemoryPaymentRepository } from "./adapters/in-memory-payment.repository";
import { createPaymentModule } from "./payment.module";
import type { PaymentModule } from "./payment-module.interface";
import type { CreatePaymentInput } from "./payment.types";
import {
  PaymentAllocationSumMismatchError,
  PaymentDuplicateIdConflictError,
  PaymentInvoiceNotFoundError,
  PaymentInvoiceNotReceivedError,
  PaymentInvoiceOverAllocationError,
  PaymentNotFoundError,
  PaymentHasAllocationsError,
  PaymentEmptyAllocationsError,
  PaymentInvalidAmountError,
  PaymentInvalidLimitError,
} from "./payment.types";

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

async function prepareReceivedInvoice(
  invoiceRepo: ReturnType<typeof createInMemoryInvoiceRepository>,
  debtPort: ReturnType<typeof createInMemoryInvoiceDebtPort>,
  id: string,
  amount: number,
): Promise<void> {
  await invoiceRepo.create({
    id,
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
    totalAmount: amount,
    paidAmount: 0,
    remainingAmount: amount,
    notes: null,
    debtAccountId: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    lineItems: [],
  });
  await debtPort.createInvoiceDebt({
    invoiceId: id,
    supplierName: "Acme Corp",
    supplierPhone: null,
    amount,
    currency: "DZD",
    direction: "PURCHASE",
    actorUserId: "user-1",
    actorLabel: "Test User",
    transactionId: "tx-1",
  });
  const debtAccountId = debtPort.state.debtAccounts.values().next().value!.id;
  await invoiceRepo.markReceivedWithDebtAccount(id, debtAccountId);
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
          { id: "li-1", description: "Cement", quantity: 10, unitPrice: 500, total: 5000 },
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

    it("rejects a reused payment ID before changing the payment, invoice, or debt", async () => {
      await prepareReceivedInvoice(invoiceRepo, debtPort, "inv-duplicate", 900);

      await paymentModule.create(makePaymentInput({
        id: "dup",
        totalAmount: 100,
        allocations: [{ invoiceId: "inv-duplicate", amount: 100 }],
      }));

      const duplicate = paymentModule.create(makePaymentInput({
        id: "dup",
        totalAmount: 200,
        allocations: [{ invoiceId: "inv-duplicate", amount: 200 }],
      }));
      await expect(duplicate).rejects.toBeInstanceOf(PaymentDuplicateIdConflictError);
      await expect(duplicate).rejects.toMatchObject({
        code: "PAYMENT_ID_CONFLICT",
        paymentId: "dup",
      });

      expect(await paymentModule.findById("dup")).toMatchObject({
        totalAmount: 100,
        allocations: [{ amount: 100 }],
      });
      expect(await invoiceRepo.findById("inv-duplicate")).toMatchObject({
        paidAmount: 100,
        remainingAmount: 800,
      });
      const paymentEntries = debtPort.state.entries.filter((entry) => entry.entryType === "PAYMENT");
      expect(paymentEntries).toHaveLength(1);
      expect(paymentEntries[0]!.signedAmount).toBe(-100);
    });

    it("allows only one concurrent create for a payment ID", async () => {
      await prepareReceivedInvoice(invoiceRepo, debtPort, "inv-duplicate-race", 900);

      const results = await Promise.allSettled([
        paymentModule.create(makePaymentInput({
          id: "dup-race",
          totalAmount: 100,
          allocations: [{ invoiceId: "inv-duplicate-race", amount: 100 }],
        })),
        paymentModule.create(makePaymentInput({
          id: "dup-race",
          totalAmount: 200,
          allocations: [{ invoiceId: "inv-duplicate-race", amount: 200 }],
        })),
      ]);
      const successes = results.filter((result) => result.status === "fulfilled");
      const failures = results.filter((result) => result.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      const conflict = (failures[0] as PromiseRejectedResult).reason;
      expect(conflict).toBeInstanceOf(PaymentDuplicateIdConflictError);
      expect(conflict).toMatchObject({
        code: "PAYMENT_ID_CONFLICT",
        paymentId: "dup-race",
      });
      const saved = await paymentModule.findById("dup-race");
      expect(saved).not.toBeNull();
      const winnerAmount = (successes[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof paymentModule.create>>>).value.totalAmount;
      expect(saved!.totalAmount).toBe(winnerAmount);
      expect(saved!.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)).toBe(winnerAmount);
      expect(await invoiceRepo.findById("inv-duplicate-race")).toMatchObject({
        paidAmount: winnerAmount,
        remainingAmount: 900 - winnerAmount,
      });
      expect(debtPort.state.entries.filter((entry) => entry.entryType === "PAYMENT")).toHaveLength(1);
    });

    it("groups multiple allocations to the same invoice and pays it once", async () => {
      // Create and receive an invoice for 5000
      await invoiceRepo.create({
        id: "inv-group",
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
        invoiceId: "inv-group",
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
      await invoiceRepo.markReceivedWithDebtAccount("inv-group", debtAccountId);

      // Act — two allocations targeting the same invoice
      const result = await paymentModule.create(makePaymentInput({
        id: "pmt-group",
        totalAmount: 5000,
        allocations: [
          { invoiceId: "inv-group", amount: 3000 },
          { invoiceId: "inv-group", amount: 2000 },
        ],
      }));

      // Assert — both allocations were created against the same invoice
      expect(result).not.toBeNull();
      expect(result!.allocations).toHaveLength(2);
      expect(result!.allocations.every((a) => a.invoiceId === "inv-group")).toBe(true);

      // Assert — invoice is fully paid exactly once
      const updatedInvoice = await invoiceRepo.findById("inv-group");
      expect(updatedInvoice!.paidAmount).toBe(5000);
      expect(updatedInvoice!.remainingAmount).toBe(0);
      expect(updatedInvoice!.status).toBe("PAID");

      // Assert — the debt port records one entry per allocation (split), totaling the payment
      const debtEntries = debtPort.state.entries.filter((e) => e.entryType === "PAYMENT");
      expect(debtEntries).toHaveLength(2);
      expect(debtEntries.reduce((sum, e) => sum + e.signedAmount, 0)).toBe(-5000);
    });

    it("rejects empty allocations (no phantom payments)", async () => {
      await expect(
        paymentModule.create(makePaymentInput({ allocations: [] })),
      ).rejects.toBeInstanceOf(PaymentEmptyAllocationsError);
    });

    it("rejects a zero total amount", async () => {
      await expect(
        paymentModule.create(makePaymentInput({
          totalAmount: 0,
          allocations: [{ invoiceId: "inv-1", amount: 5000 }],
        })),
      ).rejects.toBeInstanceOf(PaymentInvalidAmountError);
    });

    it("rejects amounts beyond the safe integer range", async () => {
      await expect(
        paymentModule.create(makePaymentInput({
          totalAmount: 2 ** 53,
          allocations: [{ invoiceId: "inv-1", amount: 2 ** 53 }],
        })),
      ).rejects.toBeInstanceOf(PaymentInvalidAmountError);
    });

    it("rejects a negative total amount", async () => {
      await expect(
        paymentModule.create(makePaymentInput({
          totalAmount: -10000,
          allocations: [
            { invoiceId: "inv-1", amount: -5000 },
            { invoiceId: "inv-2", amount: -5000 },
          ],
        })),
      ).rejects.toBeInstanceOf(PaymentInvalidAmountError);
    });

    it("rejects a zero allocation amount", async () => {
      await expect(
        paymentModule.create(makePaymentInput({
          totalAmount: 5000,
          allocations: [{ invoiceId: "inv-1", amount: 0 }],
        })),
      ).rejects.toBeInstanceOf(PaymentInvalidAmountError);
    });

    it("rejects a negative allocation amount", async () => {
      await expect(
        paymentModule.create(makePaymentInput({
          totalAmount: 5000,
          allocations: [{ invoiceId: "inv-1", amount: -5000 }],
        })),
      ).rejects.toBeInstanceOf(PaymentInvalidAmountError);
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

  describe("listPaged", () => {
    function makePayment(id: string, overrides: Partial<{
      counterpartyType: string;
      counterpartyId: string;
      paymentDate: string;
      paymentMethod: string;
      totalAmount: number;
      createdAt: string;
    }> = {}) {
      return {
        id,
        counterpartyType: overrides.counterpartyType ?? "EXTERNAL_COUNTERPARTY",
        counterpartyId: overrides.counterpartyId ?? "cp-1",
        paymentDate: overrides.paymentDate ?? "2026-06-25T10:00:00.000Z",
        paymentMethod: overrides.paymentMethod ?? "CASH",
        totalAmount: overrides.totalAmount ?? 1000,
        notes: null as string | null,
        actorUserId: null as string | null,
        actorLabel: null as string | null,
        transactionId: null as string | null,
        createdAt: overrides.createdAt ?? "2026-06-20T00:00:00.000Z",
        updatedAt: "2026-06-20T00:00:00.000Z",
      };
    }

    function encodeCursor(sortValue: unknown, id: unknown): string {
      return Buffer.from(JSON.stringify({ sortValue, id })).toString("base64url");
    }

    it("rejects a fractional page limit", async () => {
      // sqlite LIMIT ? throws a datatype mismatch on fractional bounds — the
      // shared schema's .int() rejects it at the seam before the adapter.
      await expect(paymentModule.listPaged({ limit: 2.5 })).rejects.toBeInstanceOf(
        PaymentInvalidLimitError,
      );
    });

    it("rejects a zero limit", async () => {
      await expect(paymentModule.listPaged({ limit: 0 })).rejects.toBeInstanceOf(
        PaymentInvalidLimitError,
      );
    });

    it("rejects a negative limit", async () => {
      await expect(paymentModule.listPaged({ limit: -1 })).rejects.toBeInstanceOf(
        PaymentInvalidLimitError,
      );
    });

    it("rejects a limit above the maximum", async () => {
      await expect(paymentModule.listPaged({ limit: 101 })).rejects.toBeInstanceOf(
        PaymentInvalidLimitError,
      );
    });

    it("pages with a default sort and reports total count", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2", { totalAmount: 2000 }));
      await paymentRepo.createPayment(makePayment("pmt-3", { totalAmount: 3000 }));

      const result = await paymentModule.listPaged({ limit: 2 });

      expect(result.totalCount).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).not.toBeNull();
    });

    it("follows a valid numeric-sortValue cursor to the next page", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1", { totalAmount: 1000 }));
      await paymentRepo.createPayment(makePayment("pmt-2", { totalAmount: 2000 }));
      await paymentRepo.createPayment(makePayment("pmt-3", { totalAmount: 3000 }));

      // Sort by totalAmount asc so the cursor page boundary is deterministic.
      const first = await paymentModule.listPaged({
        limit: 2,
        sort: { field: "totalAmount", direction: "asc" },
      });
      expect(first.items.map((p) => p.id)).toEqual(["pmt-1", "pmt-2"]);

      const second = await paymentModule.listPaged({
        limit: 2,
        sort: { field: "totalAmount", direction: "asc" },
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.items.map((p) => p.id)).toEqual(["pmt-3"]);
    });

    it("falls back when cursor value type does not match the requested sort", async () => {
      for (const payment of [
        makePayment("a", { totalAmount: 10, paymentDate: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" }),
        makePayment("b", { totalAmount: 30, paymentDate: "2026-01-02T00:00:00.000Z", createdAt: "2026-01-02T00:00:00.000Z" }),
        makePayment("c", { totalAmount: 20, paymentDate: "2026-01-03T00:00:00.000Z", createdAt: "2026-01-03T00:00:00.000Z" }),
      ]) {
        await paymentRepo.createPayment(payment);
      }

      const cases = [
        { sort: { field: "paymentDate", direction: "asc" }, cursor: encodeCursor(10, "a"), expected: ["a", "b", "c"] },
        { sort: { field: "paymentDate", direction: "desc" }, cursor: encodeCursor(10, "a"), expected: ["c", "b", "a"] },
        { sort: { field: "totalAmount", direction: "asc" }, cursor: encodeCursor("2026-01-01T00:00:00.000Z", "a"), expected: ["a", "c", "b"] },
        { sort: { field: "totalAmount", direction: "desc" }, cursor: encodeCursor("2026-01-01T00:00:00.000Z", "a"), expected: ["b", "c", "a"] },
        { sort: { field: "totalAmount", direction: "asc" }, cursor: Buffer.from('{"sortValue":1e400,"id":"a"}').toString("base64url"), expected: ["a", "c", "b"] },
        { sort: { field: "createdAt", direction: "asc" }, cursor: encodeCursor(10, "a"), expected: ["a", "b", "c"] },
        { sort: { field: "createdAt", direction: "desc" }, cursor: encodeCursor(10, "a"), expected: ["c", "b", "a"] },
        { sort: undefined, cursor: encodeCursor(10, "a"), expected: ["c", "b", "a"] },
      ] as const;

      for (const testCase of cases) {
        const seen: string[] = [];
        let page = await paymentModule.listPaged({
          limit: 1,
          ...(testCase.sort ? { sort: testCase.sort } : {}),
          cursor: testCase.cursor,
        });
        expect(page.totalCount).toBe(3);
        expect(page.items.map((payment) => payment.id)).toEqual([testCase.expected[0]]);
        seen.push(...page.items.map((payment) => payment.id));

        while (page.nextCursor) {
          page = await paymentModule.listPaged({
            limit: 1,
            ...(testCase.sort ? { sort: testCase.sort } : {}),
            cursor: page.nextCursor,
          });
          seen.push(...page.items.map((payment) => payment.id));
        }

        expect(seen).toEqual(testCase.expected);
        expect(new Set(seen).size).toBe(3);
      }
    });

    it("accepts a cursor with a string sortValue and skips the cursor row", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: encodeCursor("2026-06-25T10:00:00.000Z", "pmt-1"),
      });

      // Decode succeeded: the cursor row is skipped, so only pmt-2 remains.
      expect(result.items.map((p) => p.id)).toEqual(["pmt-2"]);
      expect(result.totalCount).toBe(2);
    });

    it("accepts a cursor with a null sortValue and skips the cursor row", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: encodeCursor(null, "pmt-1"),
      });

      expect(result.items.map((p) => p.id)).toEqual(["pmt-2"]);
      expect(result.totalCount).toBe(2);
    });

    it("falls back to the full list when the cursor sortValue has a bad type", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: encodeCursor(true, "pmt-1"),
      });

      // Invalid cursor is treated as "no cursor": every payment is returned.
      expect(result.totalCount).toBe(2);
      expect(result.items.map((p) => p.id)).toEqual(["pmt-1", "pmt-2"]);
    });

    it("falls back to the full list when the cursor decodes to null", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: Buffer.from("null").toString("base64url"),
      });

      expect(result.totalCount).toBe(2);
      expect(result.items.map((p) => p.id)).toEqual(["pmt-1", "pmt-2"]);
    });

    it("falls back to the full list when the cursor decodes to a non-object", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: Buffer.from(JSON.stringify("garbage")).toString("base64url"),
      });

      expect(result.totalCount).toBe(2);
      expect(result.items.map((p) => p.id)).toEqual(["pmt-1", "pmt-2"]);
    });

    it("falls back to the full list when the cursor is a JSON array without an id", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: Buffer.from(JSON.stringify([])).toString("base64url"),
      });

      expect(result.totalCount).toBe(2);
      expect(result.items.map((p) => p.id)).toEqual(["pmt-1", "pmt-2"]);
    });

    it("falls back to the full list when the cursor id is not a string", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: encodeCursor(5, 42),
      });

      expect(result.totalCount).toBe(2);
      expect(result.items.map((p) => p.id)).toEqual(["pmt-1", "pmt-2"]);
    });

    it("falls back to the full list when the cursor is not valid base64 JSON", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1"));
      await paymentRepo.createPayment(makePayment("pmt-2"));

      const result = await paymentModule.listPaged({
        limit: 10,
        cursor: "%%%not-base64%%%",
      });

      expect(result.totalCount).toBe(2);
      expect(result.items.map((p) => p.id)).toEqual(["pmt-1", "pmt-2"]);
    });

    it("applies filters through to the repository", async () => {
      await paymentRepo.createPayment(makePayment("pmt-1", { counterpartyType: "WORKER" }));
      await paymentRepo.createPayment(makePayment("pmt-2", { counterpartyType: "EXTERNAL_COUNTERPARTY" }));

      const result = await paymentModule.listPaged({
        limit: 10,
        filters: { counterpartyType: "WORKER" },
      });

      expect(result.items.map((p) => p.id)).toEqual(["pmt-1"]);
    });
  });

  describe("delete", () => {
    it("rejects deletion of an unknown payment", async () => {
      await expect(paymentModule.delete("pmt-ghost")).rejects.toBeInstanceOf(
        PaymentNotFoundError,
      );
    });

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

      await expect(paymentModule.delete("pmt-del")).rejects.toBeInstanceOf(
        PaymentHasAllocationsError,
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
