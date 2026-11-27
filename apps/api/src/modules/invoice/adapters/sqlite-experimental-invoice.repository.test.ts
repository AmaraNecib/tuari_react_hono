import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ExactFinanceService } from "../../company/exact-finance.service";
import { SqliteExactFinanceRepository } from "../../company/adapters/sqlite-exact-finance.repository";
import { ExperimentalExactInvoiceService } from "../experimental-invoice.service";
import { InMemoryExactInvoiceRepository } from "./inmemory-exact-invoice.repository";
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
it("reads exact live allocation amounts only for the selected invoice in both adapters", async () => {
  const db = createDatabaseConnection(":memory:", "", { journalMode: "preserve" });
  try {
    await ensureFreshExperimentalInvoiceSettlementSchema(db);
    const party = randomUUID();
    const now = "2026-11-10T00:00:00.000Z";
    db.prepare("INSERT INTO external_counterparty(id,full_name,phone_number,note,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(party, "Scoped vendor", "", null, now, now);
    const lock = createFifoLock();
    const repo = new SqliteExperimentalInvoiceRepository(db, lock);
    const finance = new ExactFinanceService(new SqliteExactFinanceRepository(db, lock), { id: randomUUID, now: () => now });
    const service = new ExperimentalExactInvoiceService(repo, finance, { id: randomUUID, now: () => now });
    const create = (label: string) => service.receiveInvoice({ requestId: randomUUID(), id: service.createInvoice({ requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, supplierName: label, lineItems: [{ description: label, source: { mode: "agreed-total", total: "100.00", quantity: "1" } }] }).id });
    const a = create("Selected"); const b = create("Unrelated");
    const pay = (invoiceId: string, amount: string) => service.createPayment({ requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, direction: "PURCHASE", paymentDate: now, paymentMethod: "BANK_TRANSFER", totalAmount: amount, allocations: [{ invoiceId, amount }] });
    pay(a.id, "0.10"); pay(a.id, "0.20"); pay(b.id, "40.00");
    const voidedAllocation = pay(a.id, "5.00");
    service.voidPayment({ requestId: randomUUID(), id: voidedAllocation.id, reason: "Exclude voided allocation" });
    const voidedParent = pay(a.id, "6.00");
    db.prepare("UPDATE payment SET status='VOIDED' WHERE id=?").run(voidedParent.id);
    const memory = new InMemoryExactInvoiceRepository(repo.transactionIdentity);
    for (const payment of repo.listPayments()) memory.savePayment(payment);
    for (const adapter of [repo, memory]) {
      expect(adapter.listLiveAllocationAmountsByInvoice(a.id).sort()).toEqual(["0.10", "0.20"]);
      expect(adapter.listLiveAllocationAmountsByInvoice(b.id)).toEqual(["40.00"]);
      expect(adapter.listLiveAllocationAmountsByInvoice(randomUUID())).toEqual([]);
    }
    expect(service.getInvoice(a.id).paidAmount).toBe("6.30");
  } finally { db.close(); }
});

it("normal adapter refuses the experimental graph and experimental adapter refuses the normal graph", async () => {
  const normal = createDatabaseConnection(":memory:", "", { journalMode: "preserve" });
  try {
    await ensureFreshExactApplicationSchema(normal);
    expect(() => new SqliteExperimentalInvoiceRepository(normal, createFifoLock())).toThrow(/marker/i);
  } finally { normal.close(); }
});
