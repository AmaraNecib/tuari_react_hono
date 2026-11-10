import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { exactDebtSchemaStatements } from "../company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../company/adapters/sqlite-exact-finance.repository";
import { exactInvoiceSchemaStatements } from "./adapters/exact-invoice-schema";
import { SqliteExactInvoiceRepository } from "./adapters/sqlite-exact-invoice.repository";
import type { ExactFinanceRepository } from "../company/exact-finance.repository";
import type { ExactInvoiceRepository } from "./invoice-exact.repository";
import { ExactFinanceService } from "../company/exact-finance.service";
import { InMemoryExactFinanceRepository } from "../company/adapters/inmemory-exact-finance.repository";
import { InMemoryExactInvoiceRepository } from "./adapters/inmemory-exact-invoice.repository";
import { ExactInvoiceService } from "./invoice-exact.service";

const partyId = "00000000-0000-4000-8000-000000000999";
const dependencies = { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" };
const draftInput = (requestId: string, total = "100.00") => ({ requestId, supplierName: "Synthetic supplier", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: partyId, lineItems: [{ description: "Agreed total", source: { mode: "agreed-total", total, quantity: "300" } }] });
const closes: (() => void)[] = [];
afterEach(() => { for (const close of closes.splice(0)) close(); });
function setup(kind: "memory" | "plain" | "keyed") {
  let ledger: ExactFinanceRepository;
  let repo: ExactInvoiceRepository;
  let openPeer: (() => ExactInvoiceService) | undefined;
  if (kind === "memory") {
    ledger = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [partyId] });
    repo = new InMemoryExactInvoiceRepository(ledger.transactionIdentity);
  } else {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-525-invoice-")), "fixture.sqlite");
    const key = kind === "keyed" ? "525-public-invoice-key" : "";
    const db = createDatabaseConnection(path, key);
    closes.push(() => db.close());
    db.pragma("foreign_keys=ON");
    db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); INSERT INTO external_counterparty VALUES ('${partyId}')`);
    for (const sql of exactInvoiceSchemaStatements) db.exec(sql);
    for (const sql of exactDebtSchemaStatements) db.exec(sql);
    const lock = createFifoLock();
    ledger = new SqliteExactFinanceRepository(db, lock);
    repo = new SqliteExactInvoiceRepository(db, lock);
    openPeer = () => {
      const peerDb = createDatabaseConnection(path, key);
      peerDb.pragma("foreign_keys=ON");
      peerDb.pragma("busy_timeout=1");
      closes.push(() => peerDb.close());
      const peerLock = createFifoLock();
      const peerFinance = new ExactFinanceService(new SqliteExactFinanceRepository(peerDb, peerLock), dependencies);
      return new ExactInvoiceService(new SqliteExactInvoiceRepository(peerDb, peerLock), peerFinance, dependencies);
    };
  }
  const finance = new ExactFinanceService(ledger, dependencies);
  return { ledger, repo, finance, openPeer, invoices: new ExactInvoiceService(repo, finance, dependencies) };
}
it.each(["memory", "plain", "keyed"] as const)("%s: finalizes source lines once and pays only the linked invoice through a replayable aggregate", kind => {
  const { invoices, finance } = setup(kind);
  const draft = invoices.createInvoice({ requestId: "draft", supplierName: "Synthetic supplier", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, lineItems: [
    { description: "First fraction", source: { mode: "unit-price", price: "1.5000", quantity: "0.25" } },
    { description: "Second fraction", source: { mode: "unit-price", price: "1.5000", quantity: "0.25" } },
  ] });
  expect(draft.totalAmount).toBe("0.75");
  const received = invoices.receiveInvoice({ requestId: "receive", id: draft.id });
  expect(finance.remaining(received.debtEntryId!)).toBe("0.75");
  const cash = { requestId: "cash", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: partyId, direction: "PURCHASE" as const, paymentMethod: "CASH" as const, paymentDate: dependencies.now(), totalAmount: "0.30", allocations: [{ invoiceId: draft.id, amount: "0.10" }, { invoiceId: draft.id, amount: "0.20" }] };
  const payment = invoices.createPayment(cash);
  expect(payment.unallocatedAmount).toBe("0.00");
  expect(invoices.createPayment(cash)).toEqual(payment);
  expect(invoices.getInvoice(draft.id)).toMatchObject({ paidAmount: "0.30", remainingAmount: "0.45", status: "RECEIVED" });
  expect(finance.remaining(received.debtEntryId!)).toBe("0.45");
});

it.each(["memory", "plain", "keyed"] as const)("%s: preserves partial unallocated cash, recorded remainder order and unrelated allocations through invoice/payment void", kind => {
  const { invoices, finance } = setup(kind);
  const records = ["first", "second", "third"].map(id => {
    const draft = invoices.createInvoice(draftInput(id));
    return invoices.receiveInvoice({ requestId: `receive-${id}`, id: draft.id });
  });
  expect(invoices.splitPayment("100.00", records.map(row => row.id)).map(row => row.amount)).toEqual(["33.34", "33.33", "33.33"]);
  const payment = invoices.createPayment({ requestId: "cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "100.00", allocations: [] });
  expect(payment.unallocatedAmount).toBe("100.00");
  const allocated = invoices.allocatePayment({ requestId: "split", id: payment.id, allocations: invoices.splitPayment("100.00", records.map(row => row.id)) });
  expect(allocated.unallocatedAmount).toBe("0.00");
  expect(records.map(row => finance.remaining(row.debtEntryId!))).toEqual(["66.66", "66.67", "66.67"]);
  const targetIds = allocated.allocations.map(row => row.debtEntryId);
  invoices.voidInvoice({ requestId: "cancel-first", id: records[0]!.id, reason: "Wrong document" });
  const after = invoices.getPayment(payment.id);
  expect(after.unallocatedAmount).toBe("33.34");
  expect(after.allocations.map(row => row.status)).toEqual(["VOIDED", "LIVE", "LIVE"]);
  expect(after.allocations.map(row => row.debtEntryId)).toEqual(targetIds);
  expect(finance.remaining(records[1]!.debtEntryId!)).toBe("66.67");
  invoices.voidPayment({ requestId: "cancel-payment", id: payment.id, reason: "Cash reversed" });
  expect(invoices.getInvoice(records[0]!.id).status).toBe("VOIDED");
  expect(invoices.getInvoice(records[1]!.id)).toMatchObject({ paidAmount: "0.00", remainingAmount: "100.00", status: "RECEIVED" });
  expect(finance.remaining(records[1]!.debtEntryId!)).toBe("100.00");
  expect(invoices.getPayment(payment.id)).toMatchObject({ unallocatedAmount: "100.00", status: "VOIDED" });
});

it.each(["memory", "plain", "keyed"] as const)("%s: rolls back invoice receive and multi-allocation ledger writes when any aggregate persistence fails", kind => {
  const { invoices, finance, ledger, repo } = setup(kind);
  const draft = invoices.createInvoice(draftInput("draft", "0.75"));
  const originalSave = repo.saveInvoice.bind(repo);
  repo.saveInvoice = () => { throw new Error("Injected invoice persistence failure"); };
  expect(() => invoices.receiveInvoice({ requestId: "receive", id: draft.id })).toThrow(/persistence failure/);
  expect(finance.listAccounts()).toEqual([]);
  expect(invoices.getInvoice(draft.id).status).toBe("DRAFT");
  repo.saveInvoice = originalSave;
  const received = invoices.receiveInvoice({ requestId: "receive", id: draft.id });
  const cash = { requestId: "cash", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: partyId, direction: "PURCHASE" as const, paymentMethod: "CASH" as const, paymentDate: dependencies.now(), totalAmount: "0.75", allocations: [{ invoiceId: draft.id, amount: "0.25" }, { invoiceId: draft.id, amount: "0.50" }] };
  const saveReceipt = ledger.saveAggregateCommand.bind(ledger);
  ledger.saveAggregateCommand = () => { throw new Error("Injected aggregate receipt failure"); };
  expect(() => invoices.createPayment(cash)).toThrow(/receipt failure/);
  expect(invoices.listPayments().items).toEqual([]);
  expect(invoices.getInvoice(draft.id)).toMatchObject({ paidAmount: "0.00", remainingAmount: "0.75" });
  expect(finance.remaining(received.debtEntryId!)).toBe("0.75");
  expect(finance.listEntries(received.debtAccountId!)).toHaveLength(1);
  ledger.saveAggregateCommand = saveReceipt;
  const paid = invoices.createPayment(cash);
  expect(invoices.getInvoice(draft.id).status).toBe("PAID");
  expect(invoices.createPayment({ ...cash, transactionId: "retry" })).toEqual(paid);
  expect(() => invoices.createPayment({ ...cash, actorUserId: "different" })).toThrow(/conflict/i);
  expect(finance.remaining(received.debtEntryId!)).toBe("0.00");
});

it.each(["plain", "keyed"] as const)("%s: reserves the shared native transaction before receipt reads and rechecks a competing allocation after commit", kind => {
  const { invoices, finance, ledger, openPeer } = setup(kind);
  const peer = openPeer!();
  const draft = invoices.createInvoice(draftInput("draft", "0.75"));
  const invoice = invoices.receiveInvoice({ requestId: "receive", id: draft.id });
  const cash = { requestId: "winner", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: partyId, direction: "PURCHASE" as const, paymentMethod: "CASH" as const, paymentDate: dependencies.now(), totalAmount: "0.50", allocations: [{ invoiceId: invoice.id, amount: "0.50" }] };
  const readReceipt = ledger.getAggregateCommand.bind(ledger);
  let attempted = false;
  ledger.getAggregateCommand = id => {
    if (id.includes("winner")) {
      attempted = true;
      expect(() => peer.createPayment({ ...cash, requestId: "contender" })).toThrow(/locked|busy/i);
    }
    return readReceipt(id);
  };
  invoices.createPayment(cash);
  expect(attempted).toBe(true);
  expect(() => peer.createPayment({ ...cash, requestId: "contender" })).toThrow(/remaining/);
  peer.createPayment({ ...cash, requestId: "contender", totalAmount: "0.25", allocations: [{ invoiceId: invoice.id, amount: "0.25" }] });
  expect(finance.remaining(invoice.debtEntryId!)).toBe("0.00");
  expect(invoices.getInvoice(invoice.id)).toMatchObject({ status: "PAID", paidAmount: "0.75" });
  expect(invoices.listPayments().items).toHaveLength(2);
});

it.each(["memory", "plain", "keyed"] as const)("%s: refuses nonexistent parties even for draft invoices and entirely unallocated cash", kind => {
  const { invoices } = setup(kind);
  expect(() => invoices.createInvoice({ ...draftInput("orphan"), counterpartyId: "missing-party" })).toThrow(/party not found/i);
  expect(() => invoices.createPayment({ requestId: "orphan-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "missing-party", direction: "PURCHASE", paymentDate: dependencies.now(), paymentMethod: "CASH", totalAmount: "0.10", allocations: [] })).toThrow(/party not found/i);
  expect(invoices.listInvoices().items).toEqual([]);
  expect(invoices.listPayments().items).toEqual([]);
});

it.each(["memory", "plain", "keyed"] as const)("%s: keeps large money cursor digits, exact numeric ordering and field-bound cursor fallback", kind => {
  const { invoices } = setup(kind);
  for (const [id, total] of [["large-a", "90071992547409.93"], ["large-b", "90071992547409.92"], ["small", "10.00"]]) invoices.createInvoice(draftInput(id!, total!));
  const first = invoices.listInvoices({ sort: { field: "totalAmount", direction: "asc" }, limit: 1 });
  expect(first.items[0]?.totalAmount).toBe("10.00");
  const second = invoices.listInvoices({ sort: { field: "totalAmount", direction: "asc" }, limit: 1, cursor: first.nextCursor! });
  expect(second.items[0]?.totalAmount).toBe("90071992547409.92");
  const cursor = JSON.parse(Buffer.from(second.nextCursor!, "base64url").toString("utf8"));
  expect(cursor.sortValue).toBe("90071992547409.92");
  const third = invoices.listInvoices({ sort: { field: "totalAmount", direction: "asc" }, limit: 1, cursor: second.nextCursor! });
  expect(third.items[0]?.totalAmount).toBe("90071992547409.93");
  expect(third.nextCursor).toBeNull();
  const reused = invoices.listInvoices({ sort: { field: "createdAt", direction: "asc" }, limit: 1, cursor: second.nextCursor! });
  expect(reused.items).toEqual(invoices.listInvoices({ sort: { field: "createdAt", direction: "asc" }, limit: 1 }).items);
});
