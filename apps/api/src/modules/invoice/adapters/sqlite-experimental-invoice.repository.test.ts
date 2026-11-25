import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { ensureFreshExperimentalInvoiceSettlementSchema } from "../../../infrastructure/database/fresh-experimental-invoice-settlement-schema";
import { ensureFreshExactApplicationSchema } from "../../../infrastructure/database/fresh-exact-schema";
import { SqliteExactInvoiceRepository, SqliteExperimentalInvoiceRepository } from "./sqlite-exact-invoice.repository";
import type { ExperimentalExactInvoice } from "@tuari/contracts";

const id = "00000000-0000-4000-8000-000000000101";
const invoice = (status: ExperimentalExactInvoice["status"], paidAmount: string, settledAmount: string, remainingAmount: string): ExperimentalExactInvoice => ({
  id, counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "00000000-0000-4000-8000-000000000999", invoiceNumber: null,
  supplierName: "Vendor", supplierPhone: null, warehouseId: null, projectId: null, invoiceDate: null, dueDate: null, notes: null,
  currency: "DZD", direction: "PURCHASE", status, totalAmount: "100.00", paidAmount, settledAmount, remainingAmount,
  debtAccountId: null, debtEntryId: null, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z",
  lineItems: [{ id: "00000000-0000-4000-8000-000000000102", invoiceId: id, description: "Item", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }],
});
it("persists experimental invoice projections and rejects invalid rows without changing stored data", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-615-invoice-repo-")), "fixture.sqlite");
  let db = createDatabaseConnection(path, "", { journalMode: "preserve" });
  const lock = createFifoLock();
  try {
    await ensureFreshExperimentalInvoiceSettlementSchema(db);
    const repo = new SqliteExperimentalInvoiceRepository(db, lock);
    for (const row of [invoice("RECEIVED", "20.00", "0.00", "80.00"), invoice("SETTLED", "20.00", "80.00", "0.00"), invoice("RECEIVED", "20.00", "0.00", "80.00")]) {
      repo.saveInvoice(row);
      expect(repo.getInvoice(id)).toEqual(row);
      expect(repo.listInvoices()).toEqual([row]);
    }
    const payment = { id: "00000000-0000-4000-8000-000000000103", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: "00000000-0000-4000-8000-000000000999", currency: "DZD" as const, direction: "PURCHASE" as const, paymentDate: "2026-11-10T00:00:00.000Z", paymentMethod: "BANK_TRANSFER" as const, totalAmount: "20.00", unallocatedAmount: "20.00", notes: null, status: "LIVE" as const, actorUserId: null, actorLabel: null, transactionId: null, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z", allocations: [] };
    repo.savePayment(payment);
    const before = repo.getInvoice(id);
    const paymentBefore = repo.getPayment(payment.id);
    expect(() => repo.saveInvoice({ ...invoice("PAID", "20.00", "80.00", "0.00") })).toThrow();
    expect(repo.getInvoice(id)).toEqual(before);
    expect(repo.getPayment(payment.id)).toEqual(paymentBefore);
    db.close();
    db = createDatabaseConnection(path, "", { journalMode: "preserve" });
    expect(new SqliteExperimentalInvoiceRepository(db, createFifoLock()).getInvoice(id)).toEqual(before);
    expect(() => new SqliteExactInvoiceRepository(db, createFifoLock())).toThrow();
  } finally { db.close(); }
});
it("normal adapter refuses the experimental graph and experimental adapter refuses the normal graph", async () => {
  const normal = createDatabaseConnection(":memory:", "", { journalMode: "preserve" });
  try {
    await ensureFreshExactApplicationSchema(normal);
    expect(() => new SqliteExperimentalInvoiceRepository(normal, createFifoLock())).toThrow(/marker/i);
  } finally { normal.close(); }
});
