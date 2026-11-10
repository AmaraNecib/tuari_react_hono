import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { InMemoryExactFinanceRepository } from "../company/adapters/inmemory-exact-finance.repository";
import type { ExactFinanceRepository } from "../company/exact-finance.repository";
import { ExactFinanceService } from "../company/exact-finance.service";
import { InMemoryExactInvoiceRepository } from "./adapters/inmemory-exact-invoice.repository";
import type { ExactInvoiceRepository } from "./invoice-exact.repository";
import { ExactInvoiceService } from "./invoice-exact.service";

const partyId = "00000000-0000-4000-8000-000000000999";
const workerId = "00000000-0000-4000-8000-000000000998";
const otherPartyId = "00000000-0000-4000-8000-000000000997";
const dependencies = { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" };
const source = (total: string) => [{ description: "Recorded total", source: { mode: "agreed-total" as const, total, quantity: "1" } }];
const draftInput = (requestId: string, total = "100.00") => ({ requestId, supplierName: "Test supplier", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: partyId, lineItems: source(total) });
function setup() {
  const ledger: ExactFinanceRepository = new InMemoryExactFinanceRepository({ workerIds: [workerId], externalCounterpartyIds: [partyId, otherPartyId] });
  const repo: ExactInvoiceRepository = new InMemoryExactInvoiceRepository(ledger.transactionIdentity);
  const finance = new ExactFinanceService(ledger, dependencies);
  const invoices = new ExactInvoiceService(repo, finance, dependencies);
  return { ledger, repo, finance, invoices };
}
const command = (requestId: string, id: string) => ({ requestId, id });

it("updates draft metadata by setting, clearing, and omitting fields; line replacement resets totals while metadata edits preserve them", () => {
  const { invoices } = setup();
  const draft = invoices.createInvoice({ ...draftInput("update-create"), invoiceNumber: "INV-1", notes: "Keep" });
  const metadata = invoices.updateInvoice({ ...command("update-set", draft.id), invoiceNumber: "INV-2", supplierPhone: "+213", notes: null });
  expect(metadata).toMatchObject({ invoiceNumber: "INV-2", supplierPhone: "+213", notes: null, totalAmount: "100.00", remainingAmount: "100.00" });
  const omitted = invoices.updateInvoice({ ...command("update-omit", draft.id), invoiceNumber: null });
  expect(omitted).toMatchObject({ invoiceNumber: null, supplierPhone: "+213", notes: null, totalAmount: "100.00" });
  const replaced = invoices.updateInvoice({ ...command("update-lines", draft.id), lineItems: source("37.25") });
  expect(replaced).toMatchObject({ totalAmount: "37.25", remainingAmount: "37.25", paidAmount: "0.00" });
  expect(replaced.lineItems[0]?.id).not.toBe(draft.lineItems[0]?.id);
  const received = invoices.receiveInvoice(command("update-receive", draft.id));
  expect(() => invoices.updateInvoice({ ...command("update-after-receive", draft.id), notes: "Rejected" })).toThrow(/only draft/i);
  expect(invoices.getInvoice(draft.id)).toEqual(received);
});

it("rejects explicit ID conflicts and missing invoice/payment targets without creating records", () => {
  const { invoices } = setup();
  const draft = invoices.createInvoice({ ...draftInput("id-first"), id: "00000000-0000-4000-8000-000000000101" });
  expect(() => invoices.createInvoice({ ...draftInput("id-second"), id: draft.id })).toThrow(/duplicate invoice id/i);
  const paymentInput = { requestId: "payment-id-first", id: "00000000-0000-4000-8000-000000000102", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: partyId, direction: "PURCHASE" as const, paymentMethod: "CASH" as const, paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] };
  invoices.createPayment(paymentInput);
  expect(() => invoices.createPayment({ ...paymentInput, requestId: "payment-id-second" })).toThrow(/duplicate payment id/i);
  expect(() => invoices.getInvoice("00000000-0000-4000-8000-000000000103")).toThrow(/invoice not found/i);
  expect(() => invoices.getPayment("00000000-0000-4000-8000-000000000104")).toThrow(/payment not found/i);
  expect(() => invoices.updateInvoice({ ...command("missing-update", "00000000-0000-4000-8000-000000000105"), notes: "No row" })).toThrow(/invoice not found/i);
  expect(() => invoices.receiveInvoice(command("missing-receive", "00000000-0000-4000-8000-000000000106"))).toThrow(/invoice not found/i);
  expect(() => invoices.deleteDraft(command("missing-delete", "00000000-0000-4000-8000-000000000107"))).toThrow(/invoice not found/i);
  expect(() => invoices.allocatePayment({ ...command("missing-allocation", "00000000-0000-4000-8000-000000000108"), allocations: [{ invoiceId: draft.id, amount: "1.00" }] })).toThrow(/payment not found/i);
  expect(() => invoices.deleteUnallocatedPayment(command("missing-payment-delete", "00000000-0000-4000-8000-000000000109"))).toThrow(/payment not found/i);
  expect(invoices.listInvoices().totalCount).toBe(1);
  expect(invoices.listPayments().totalCount).toBe(1);
});

it("deletes drafts and unallocated payments once, replays command results, and preserves non-drafts and allocation history", () => {
  const { invoices } = setup();
  const draft = invoices.createInvoice(draftInput("delete-draft"));
  const deleteDraft = command("delete-draft-command", draft.id);
  expect(invoices.deleteDraft(deleteDraft)).toEqual({ id: draft.id });
  expect(invoices.deleteDraft(deleteDraft)).toEqual({ id: draft.id });
  expect(() => invoices.getInvoice(draft.id)).toThrow(/invoice not found/i);
  const received = invoices.createInvoice(draftInput("delete-received"));
  invoices.receiveInvoice(command("delete-receive", received.id));
  expect(() => invoices.deleteDraft(command("delete-received-command", received.id))).toThrow(/only draft/i);
  const payment = invoices.createPayment({ requestId: "delete-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] });
  const deletePayment = command("delete-cash-command", payment.id);
  expect(invoices.deleteUnallocatedPayment(deletePayment)).toEqual({ id: payment.id });
  expect(invoices.deleteUnallocatedPayment(deletePayment)).toEqual({ id: payment.id });
  const allocated = invoices.createPayment({ requestId: "history-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [{ invoiceId: received.id, amount: "10.00" }] });
  expect(() => invoices.deleteUnallocatedPayment(command("history-delete", allocated.id))).toThrow(/allocation history/i);
  expect(invoices.getPayment(allocated.id)).toEqual(allocated);
});

it("enforces worker party and sale-direction rules, and receives a zero invoice without posting debt", () => {
  const { invoices, finance } = setup();
  expect(() => invoices.createInvoice({ ...draftInput("worker-sale"), counterpartyType: "WORKER", counterpartyId: workerId, direction: "SALE" })).toThrow(/workers cannot own sale invoices/i);
  const workerDraft = invoices.createInvoice({ ...draftInput("worker-purchase"), counterpartyType: "WORKER", counterpartyId: workerId, direction: "PURCHASE" });
  expect(workerDraft.counterpartyId).toBe(workerId);
  const zeroDraft = invoices.createInvoice(draftInput("zero-receipt", "0.00"));
  const received = invoices.receiveInvoice(command("zero-receive", zeroDraft.id));
  expect(received).toMatchObject({ status: "PAID", totalAmount: "0.00", paidAmount: "0.00", remainingAmount: "0.00", debtEntryId: null });
  expect(finance.listAccounts()).toHaveLength(1);
  expect(finance.listEntries(received.debtAccountId!)).toEqual([]);
  expect(() => invoices.receiveInvoice(command("zero-receive-again", zeroDraft.id))).toThrow(/only draft/i);
});

it("requires distinct split identities and omits shares smaller than one minor unit", () => {
  const { invoices } = setup();
  const ids = ["00000000-0000-4000-8000-000000000201", "00000000-0000-4000-8000-000000000202", "00000000-0000-4000-8000-000000000203"];
  expect(() => invoices.splitPayment("1.00", [ids[0]!, ids[0]!])).toThrow(/distinct/i);
  expect(() => invoices.splitPayment("1.00", [])).toThrow(/distinct/i);
  expect(() => invoices.splitPayment("1.00", Array.from({ length: 1001 }, () => randomUUID()))).toThrow(/distinct/i);
  expect(invoices.splitPayment("0.02", ids)).toEqual([{ invoiceId: ids[0], amount: "0.01" }, { invoiceId: ids[1], amount: "0.01" }]);
});

it("rolls back allocation batches for overflow, mismatches, missing or unavailable invoices, overpay, and ledger drift", () => {
  const { invoices, finance, repo } = setup();
  const one = invoices.receiveInvoice(command("guard-receive-one", invoices.createInvoice(draftInput("guard-one", "10.00")).id));
  const two = invoices.receiveInvoice(command("guard-receive-two", invoices.createInvoice(draftInput("guard-two", "10.00")).id));
  const payment = invoices.createPayment({ requestId: "guard-payment", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] });
  expect(() => invoices.allocatePayment({ ...command("overflow", payment.id), allocations: [{ invoiceId: one.id, amount: "6.00" }, { invoiceId: two.id, amount: "5.00" }] })).toThrow(/allocation sum/i);
  const receivedOther = invoices.receiveInvoice(command("guard-receive-other", invoices.createInvoice({ ...draftInput("guard-other"), counterpartyId: otherPartyId }).id));
  const anotherPayment = invoices.createPayment({ requestId: "guard-other-payment", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] });
  expect(() => invoices.allocatePayment({ ...command("mismatch-party", anotherPayment.id), allocations: [{ invoiceId: receivedOther.id, amount: "1.00" }] })).toThrow(/party.*currency.*direction/i);
  const sale = invoices.receiveInvoice(command("guard-sale-receive", invoices.createInvoice({ ...draftInput("guard-sale"), direction: "SALE" }).id));
  const purchaseCash = invoices.createPayment({ requestId: "guard-sale-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] });
  expect(() => invoices.allocatePayment({ ...command("mismatch-direction", purchaseCash.id), allocations: [{ invoiceId: sale.id, amount: "1.00" }] })).toThrow(/party.*currency.*direction/i);
  expect(() => invoices.allocatePayment({ ...command("missing-target", purchaseCash.id), allocations: [{ invoiceId: "00000000-0000-4000-8000-000000000222", amount: "1.00" }] })).toThrow(/invoice not found/i);
  const draftTarget = invoices.createInvoice(draftInput("unavailable-draft"));
  expect(() => invoices.allocatePayment({ ...command("unavailable-target", purchaseCash.id), allocations: [{ invoiceId: draftTarget.id, amount: "1.00" }] })).toThrow(/not available/i);
  const smallCash = invoices.createPayment({ requestId: "overpay-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "20.00", allocations: [] });
  expect(() => invoices.allocatePayment({ ...command("remaining-overpay", smallCash.id), allocations: [{ invoiceId: one.id, amount: "20.00" }] })).toThrow(/exceeds remaining/i);
  const driftCash = invoices.createPayment({ requestId: "drift-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] });
  const getInvoice = repo.getInvoice.bind(repo);
  repo.getInvoice = id => { const row = getInvoice(id); return row?.id === two.id ? { ...row, remainingAmount: "9.99" } : row; };
  expect(() => invoices.allocatePayment({ ...command("ledger-drift", driftCash.id), allocations: [{ invoiceId: two.id, amount: "1.00" }] })).toThrow(/debt disagree/i);
  repo.getInvoice = getInvoice;
  expect(invoices.getPayment(driftCash.id).unallocatedAmount).toBe("10.00");
  expect(finance.remaining(two.debtEntryId!)).toBe("10.00");
});

it("rolls back a successful first allocation when a later target is unavailable", () => {
  const { invoices, finance } = setup();
  const a = invoices.receiveInvoice(command("rollback-receive-a", invoices.createInvoice(draftInput("rollback-a", "5.00")).id));
  const bDraft = invoices.createInvoice(draftInput("rollback-b", "5.00"));
  const b = invoices.receiveInvoice(command("rollback-receive-b", bDraft.id));
  const cash = invoices.createPayment({ requestId: "rollback-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] });
  invoices.voidInvoice({ ...command("rollback-void-b", b.id), reason: "Unavailable for subsequent allocation" });
  expect(() => invoices.allocatePayment({ ...command("rollback-batch", cash.id), allocations: [{ invoiceId: a.id, amount: "5.00" }, { invoiceId: b.id, amount: "5.00" }] })).toThrow(/not available/i);
  expect(invoices.getPayment(cash.id)).toMatchObject({ unallocatedAmount: "10.00", allocations: [] });
  expect(invoices.getInvoice(a.id)).toMatchObject({ paidAmount: "0.00", remainingAmount: "5.00" });
  expect(finance.remaining(a.debtEntryId!)).toBe("5.00");
});

it("rejects repeat payment voids, allocation of voided cash, and draft or repeated invoice voids", () => {
  const { invoices } = setup();
  const draft = invoices.createInvoice(draftInput("void-draft"));
  expect(() => invoices.voidInvoice({ ...command("void-draft-command", draft.id), reason: "Not received" })).toThrow(/only received or paid/i);
  const received = invoices.receiveInvoice(command("void-receive", draft.id));
  const payment = invoices.createPayment({ requestId: "void-cash", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "10.00", allocations: [] });
  const voidedPayment = invoices.voidPayment({ ...command("void-cash-command", payment.id), reason: "Reversed" });
  expect(voidedPayment.status).toBe("VOIDED");
  expect(() => invoices.voidPayment({ ...command("void-cash-again", payment.id), reason: "Already reversed" })).toThrow(/already voided/i);
  expect(() => invoices.allocatePayment({ ...command("void-cash-allocate", payment.id), allocations: [{ invoiceId: received.id, amount: "1.00" }] })).toThrow(/voided payments/i);
  const voidedInvoice = invoices.voidInvoice({ ...command("void-invoice-command", received.id), reason: "Cancelled" });
  expect(voidedInvoice.status).toBe("VOIDED");
  expect(() => invoices.voidInvoice({ ...command("void-invoice-again", received.id), reason: "Already cancelled" })).toThrow(/only received or paid/i);
});

it("filters invoices and payments, and paginates nulls plus equivalent offset timestamps in either direction", () => {
  const { invoices, repo } = setup();
  const dated = invoices.createInvoice({ ...draftInput("page-dated"), invoiceDate: "2026-11-10T10:00:00.000+01:00" });
  const sameInstant = invoices.createInvoice({ ...draftInput("page-same"), invoiceDate: "2026-11-10T09:00:00Z" });
  const earlier = invoices.createInvoice({ ...draftInput("page-earlier"), invoiceDate: "2026-11-10T08:00:00Z" });
  const received = invoices.receiveInvoice(command("page-receive", dated.id));
  const pagePurchase = invoices.createPayment({ requestId: "page-purchase", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: "2026-11-10T09:00:00Z", totalAmount: "1.00", allocations: [] });
  invoices.createPayment({ requestId: "page-sale", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: otherPartyId, direction: "SALE", paymentMethod: "CASH", paymentDate: "2026-11-10T09:00:00Z", totalAmount: "1.00", allocations: [] });
  expect(invoices.listInvoices({ filters: { status: "RECEIVED" } }).items.map(row => row.id)).toEqual([received.id]);
  const otherInvoice = invoices.createInvoice({ ...draftInput("page-other-party"), counterpartyId: otherPartyId });
  expect(invoices.listInvoices({ filters: { counterpartyId: otherPartyId } }).items.map(row => row.id)).toEqual([otherInvoice.id]);
  expect(invoices.listPayments({ filters: { direction: "SALE" } }).items).toHaveLength(1);
  expect(invoices.listPayments({ filters: { counterpartyId: otherPartyId } }).items[0]?.direction).toBe("SALE");
  // Persistence may contain legacy null dates. Pin null-first ascending and null-last descending.
  repo.saveInvoice({ ...sameInstant, invoiceDate: null });
  for (const direction of ["asc", "desc"] as const) {
    const first = invoices.listInvoices({ sort: { field: "invoiceDate", direction }, limit: 1, filters: { counterpartyId: partyId } });
    const second = invoices.listInvoices({ sort: { field: "invoiceDate", direction }, limit: 1, cursor: first.nextCursor!, filters: { counterpartyId: partyId } });
    const third = invoices.listInvoices({ sort: { field: "invoiceDate", direction }, limit: 1, cursor: second.nextCursor!, filters: { counterpartyId: partyId } });
    const orderedIds = [first.items[0]?.id, second.items[0]?.id, third.items[0]?.id];
    expect(orderedIds).toEqual(direction === "asc" ? [sameInstant.id, earlier.id, dated.id] : [dated.id, earlier.id, sameInstant.id]);
    expect(third.hasMore).toBe(false);
  }
  // Equivalent instants retain a stable ID tie-break across offset and fractional spellings.
  repo.saveInvoice({ ...dated, invoiceDate: "2026-11-10T10:00:00.12+01:00" });
  repo.saveInvoice({ ...earlier, invoiceDate: "2026-11-10T09:00:00.120Z" });
  repo.saveInvoice({ ...sameInstant, invoiceDate: "2026-11-10T09:00:00Z" });
  for (const direction of ["asc", "desc"] as const) {
    const first = invoices.listInvoices({ sort: { field: "invoiceDate", direction }, limit: 1, filters: { counterpartyId: partyId } });
    const second = invoices.listInvoices({ sort: { field: "invoiceDate", direction }, limit: 1, cursor: first.nextCursor!, filters: { counterpartyId: partyId } });
    const third = invoices.listInvoices({ sort: { field: "invoiceDate", direction }, limit: 1, cursor: second.nextCursor!, filters: { counterpartyId: partyId } });
    const equalInstant = [dated, earlier].sort((a, b) => a.id.localeCompare(b.id));
    const expected = direction === "asc" ? [sameInstant.id, ...equalInstant.map(row => row.id)] : [...equalInstant.map(row => row.id).reverse(), sameInstant.id];
    expect([first.items[0]?.id, second.items[0]?.id, third.items[0]?.id]).toEqual(expected);
  }
  const cashOffset = invoices.createPayment({ requestId: "page-cash-offset", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: "2026-11-10T10:00:00.12+01:00", totalAmount: "1.00", allocations: [] });
  const cashUtc = invoices.createPayment({ requestId: "page-cash-utc", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: "2026-11-10T09:00:00.120Z", totalAmount: "1.00", allocations: [] });
  const equalCash = [cashOffset, cashUtc].sort((a, b) => a.id.localeCompare(b.id));
  for (const direction of ["asc", "desc"] as const) {
    const first = invoices.listPayments({ sort: { field: "paymentDate", direction }, limit: 1, filters: { counterpartyId: partyId } });
    const second = invoices.listPayments({ sort: { field: "paymentDate", direction }, limit: 1, cursor: first.nextCursor!, filters: { counterpartyId: partyId } });
    const third = invoices.listPayments({ sort: { field: "paymentDate", direction }, limit: 1, cursor: second.nextCursor!, filters: { counterpartyId: partyId } });
    const expected = direction === "asc" ? [pagePurchase.id, ...equalCash.map(row => row.id)] : [...equalCash.map(row => row.id).reverse(), pagePurchase.id];
    expect([first.items[0]?.id, second.items[0]?.id, third.items[0]?.id]).toEqual(expected);
  }
});

it("ignores malformed, invalid, and mismatched cursors and enforces the read resource cap before paging", () => {
  const { invoices, repo } = setup();
  const row = invoices.createInvoice(draftInput("cursor-base"));
  const baseline = invoices.listInvoices({ sort: { field: "createdAt", direction: "asc" }, limit: 1 });
  const cursors = ["not-base64-json", Buffer.from("{bad", "utf8").toString("base64url"), Buffer.from(JSON.stringify({ v: 1, collection: "payment", field: "createdAt", direction: "asc", sortValue: row.createdAt, id: row.id }), "utf8").toString("base64url"), Buffer.from(JSON.stringify({ v: 1, collection: "invoice", field: "createdAt", direction: "asc", sortValue: "not-a-timestamp", id: row.id }), "utf8").toString("base64url")];
  for (const cursor of cursors) expect(invoices.listInvoices({ sort: { field: "createdAt", direction: "asc" }, limit: 1, cursor }).items[0]?.id).toBe(baseline.items[0]?.id);
  const list = repo.listInvoices.bind(repo);
  repo.listInvoices = () => Array.from({ length: 100001 }, () => row);
  expect(() => invoices.listInvoices({ filters: { counterpartyId: partyId } })).toThrow(/read resource limit/i);
  repo.listInvoices = list;
  const payment = invoices.createPayment({ requestId: "cursor-payment", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "PURCHASE", paymentMethod: "CASH", paymentDate: dependencies.now(), totalAmount: "1.00", allocations: [] });
  const listPayments = repo.listPayments.bind(repo);
  repo.listPayments = () => Array.from({ length: 100001 }, () => payment);
  expect(() => invoices.listPayments({ filters: { counterpartyId: partyId } })).toThrow(/read resource limit/i);
  repo.listPayments = listPayments;
});
