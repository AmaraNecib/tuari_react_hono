/**
 * PaymentModule against the REAL sqlite payment adapter.
 *
 * The regular module tests swap in the in-memory payment repository; this
 * suite wires the production adapter (better-sqlite3 + full app schema,
 * same construction as dependencies.ts) with the in-memory invoice repo /
 * debt port, so the financial invariants are pinned against the real
 * transaction code:
 *   - exact-cap allocation: concurrent payments against one shared capacity
 *     must NEVER double-allocate (one wins, one rejects; final capacity is
 *     exact) — issue #288 gap 2;
 *   - mid-flow failure rolls back every payment write.
 */
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { createInMemoryInvoiceRepository } from "../invoice/adapters/in-memory-invoice.repository";
import { createInMemoryInvoiceDebtPort } from "../invoice/adapters/invoice-debt.port";
import { PaymentRepositoryImpl } from "./adapters/payment.repository";
import { createPaymentModule } from "./payment.module";
import type { PaymentModule } from "./payment-module.interface";
import {
  PaymentInvoiceNotReceivedError,
  PaymentInvoiceOverAllocationError,
} from "./payment.types";

function createTestEnv() {
  const rawDb = new Database(":memory:");
  rawDb.pragma("foreign_keys = ON");
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt);
  }
  const paymentRepo = new PaymentRepositoryImpl(rawDb, createFifoLock());
  const invoiceRepo = createInMemoryInvoiceRepository();
  const debtPort = createInMemoryInvoiceDebtPort();
  const paymentModule = createPaymentModule(paymentRepo, invoiceRepo, debtPort);
  return { rawDb, paymentRepo, invoiceRepo, debtPort, paymentModule };
}

/** Create + receive an invoice with `capacity` remaining, returning its id. */
async function seedReceivedInvoice(
  env: ReturnType<typeof createTestEnv>,
  id: string,
  capacity: number,
): Promise<void> {
  const { rawDb, invoiceRepo, debtPort } = env;

  // The in-memory invoice repo drives the module logic, but the sqlite
  // payment_allocation.invoice_id FK needs a real invoice row on the
  // shared connection.
  const now = "2026-06-01T00:00:00.000Z";
  rawDb
    .prepare(
      `INSERT INTO "invoice" ("id", "invoice_number", "supplier_name", "supplier_phone", "warehouse_id", "project_id", "status", "direction", "invoice_date", "due_date", "currency", "total_amount", "paid_amount", "remaining_amount", "debt_account_id", "notes", "created_at", "updated_at")
       VALUES (?, NULL, ?, NULL, NULL, NULL, 'DRAFT', 'PURCHASE', NULL, NULL, 'DZD', ?, 0, ?, NULL, NULL, ?, ?)`,
    )
    .run(id, "Acme Corp", capacity, capacity, now, now);

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
    totalAmount: capacity,
    paidAmount: 0,
    remainingAmount: capacity,
    notes: null,
    debtAccountId: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    lineItems: [
      { id: "li-1", description: "Cement", quantity: 10, unitPrice: 500, total: capacity },
    ],
  });
  await debtPort.createInvoiceDebt({
    invoiceId: id,
    supplierName: "Acme Corp",
    supplierPhone: null,
    amount: capacity,
    currency: "DZD",
    direction: "PURCHASE",
    actorUserId: "user-1",
    actorLabel: "Test User",
    transactionId: "tx-1",
  });
  const debtAccountId = debtPort.state.debtAccounts.values().next().value!.id;
  await invoiceRepo.markReceivedWithDebtAccount(id, debtAccountId);
}

function paymentInput(overrides: Record<string, unknown> = {}) {
  return {
    id: "pmt-1",
    counterpartyType: "EXTERNAL_COUNTERPARTY" as const,
    counterpartyId: "cp-1",
    paymentDate: "2026-06-25T10:00:00.000Z",
    paymentMethod: "CASH" as const,
    totalAmount: 5000,
    allocations: [{ invoiceId: "inv-1", amount: 5000 }],
    ...overrides,
  };
}

describe("PaymentModule with sqlite payment adapter", () => {
  let env: ReturnType<typeof createTestEnv>;
  let paymentModule: PaymentModule;

  beforeEach(() => {
    env = createTestEnv();
    paymentModule = env.paymentModule;
  });

  it("pins exact-cap allocation: concurrent payments cannot double-allocate capacity", async () => {
    await seedReceivedInvoice(env, "inv-1", 5000);

    // Two concurrent payments, each needing 3000 of a 5000 capacity.
    // Serialized by the connection-wide lock (in-process) — the capacity
    // reads inside each transaction cannot be stale, so exactly one may
    // win; the loser sees the remaining 2000 and rejects. (The BEGIN
    // IMMEDIATE write reservation against a SECOND process is pinned
    // separately in payment.repository.test.ts.)
    const [first, second] = await Promise.allSettled([
      paymentModule.create(paymentInput({ id: "pmt-a", totalAmount: 3000, allocations: [{ invoiceId: "inv-1", amount: 3000 }] })),
      paymentModule.create(paymentInput({ id: "pmt-b", totalAmount: 3000, allocations: [{ invoiceId: "inv-1", amount: 3000 }] })),
    ]);

    const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
    const rejected = [first, second].filter((r) => r.status === "rejected");

    // Exactly one wins; exactly one hits the capacity wall.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      PaymentInvoiceOverAllocationError,
    );

    // Exact-cap invariant: 3000 allocated, 2000 left — never 6000/0 or -1000.
    const invoice = await env.invoiceRepo.findById("inv-1");
    expect(invoice).not.toBeNull();
    expect(invoice!.paidAmount).toBe(3000);
    expect(invoice!.remainingAmount).toBe(2000);

    // Exactly one payment + one allocation landed in the sqlite store.
    const paymentCount = env.rawDb.prepare(`SELECT COUNT(*) AS c FROM "payment"`).get() as { c: number };
    const allocCount = env.rawDb.prepare(`SELECT COUNT(*) AS c FROM "payment_allocation"`).get() as { c: number };
    expect(paymentCount.c).toBe(1);
    expect(allocCount.c).toBe(1);
  });

  it("lets equal-capacity payments both succeed exactly at the boundary", async () => {
    await seedReceivedInvoice(env, "inv-1", 5000);

    // 2500 + 2500 fills the invoice exactly: both must succeed (a `>`
    // regression to `>=` in the capacity check would wrongly reject one),
    // the invoice lands fully paid, and the status transitions to PAID.
    const [a, b] = await Promise.allSettled([
      paymentModule.create(
        paymentInput({ id: "pmt-eq-a", totalAmount: 2500, allocations: [{ invoiceId: "inv-1", amount: 2500 }] }),
      ),
      paymentModule.create(
        paymentInput({ id: "pmt-eq-b", totalAmount: 2500, allocations: [{ invoiceId: "inv-1", amount: 2500 }] }),
      ),
    ]);

    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");

    const invoice = await env.invoiceRepo.findById("inv-1");
    expect(invoice).not.toBeNull();
    expect(invoice!.paidAmount).toBe(5000);
    expect(invoice!.remainingAmount).toBe(0);
    expect(invoice!.status).toBe("PAID");
  });

  it("capacity of one: concurrent unit payments allocate exactly once", async () => {
    await seedReceivedInvoice(env, "inv-1", 1);

    const [first, second] = await Promise.allSettled([
      paymentModule.create(
        paymentInput({ id: "pmt-u-a", totalAmount: 1, allocations: [{ invoiceId: "inv-1", amount: 1 }] }),
      ),
      paymentModule.create(
        paymentInput({ id: "pmt-u-b", totalAmount: 1, allocations: [{ invoiceId: "inv-1", amount: 1 }] }),
      ),
    ]);

    const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
    const rejected = [first, second].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The winner pays the invoice in full (capacity 1) → PAID, so the loser
    // is rejected because the invoice is no longer RECEIVED (the payment
    // domain refuses to over-allocate either way).
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      PaymentInvoiceNotReceivedError,
    );

    const invoice = await env.invoiceRepo.findById("inv-1");
    expect(invoice!.remainingAmount).toBe(0);
    expect(invoice!.status).toBe("PAID");
  });

  it("rolls back every payment write when a mid-flow validation fails", async () => {
    await seedReceivedInvoice(env, "inv-1", 5000);
    await seedReceivedInvoice(env, "inv-2", 1000);

    // Allocation sum matches the total (structural check passes), but the
    // second invoice (capacity 1000) cannot absorb 4000 → the whole create
    // fails after the first invoice's debt entry + status update already ran.
    await expect(
      paymentModule.create(
        paymentInput({
          id: "pmt-partial",
          totalAmount: 5000,
          allocations: [
            { invoiceId: "inv-1", amount: 1000 },
            { invoiceId: "inv-2", amount: 4000 },
          ],
        }),
      ),
    ).rejects.toThrow(PaymentInvoiceOverAllocationError);

    // All-or-nothing: no payment row, no allocation row survived.
    const paymentCount = env.rawDb.prepare(`SELECT COUNT(*) AS c FROM "payment"`).get() as { c: number };
    const allocCount = env.rawDb.prepare(`SELECT COUNT(*) AS c FROM "payment_allocation"`).get() as { c: number };
    expect(paymentCount.c).toBe(0);
    expect(allocCount.c).toBe(0);
    expect(await paymentModule.findById("pmt-partial")).toBeNull();
  });
});
