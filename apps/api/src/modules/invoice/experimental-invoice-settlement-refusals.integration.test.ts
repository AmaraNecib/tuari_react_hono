import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { ensureFreshExperimentalInvoiceSettlementSchema } from "../../infrastructure/database/fresh-experimental-invoice-settlement-schema";
import { ExactFinanceService } from "../company/exact-finance.service";
import { SqliteExactFinanceRepository } from "../company/adapters/sqlite-exact-finance.repository";
import { SqliteManualSettlementRepository } from "../company/adapters/sqlite-manual-settlement.repository";
import { ManualSettlementService } from "../company/manual-settlement.service";
import { SqliteExperimentalInvoiceRepository } from "./adapters/sqlite-exact-invoice.repository";
import { ExperimentalExactInvoiceService } from "./experimental-invoice.service";
import { ExperimentalInvoiceSettlementParticipant } from "./experimental-invoice-settlement-participant";

const party = "00000000-0000-4000-8000-000000000981";
const otherParty = "00000000-0000-4000-8000-000000000982";
const worker = "00000000-0000-4000-8000-000000000983";
const date = "2026-11-10T00:00:00.000Z";
const dependencies = { id: () => crypto.randomUUID(), now: () => date };

type Graph = ReturnType<typeof compose>;
function compose(db: ReturnType<typeof createDatabaseConnection>) {
  const lock = createFifoLock();
  const ledger = new SqliteExactFinanceRepository(db, lock);
  const finance = new ExactFinanceService(ledger, dependencies);
  const invoices = new SqliteExperimentalInvoiceRepository(db, lock);
  const invoiceService = new ExperimentalExactInvoiceService(invoices, finance, dependencies);
  const participant = new ExperimentalInvoiceSettlementParticipant(invoices, finance, ledger, dependencies);
  const repository = new SqliteManualSettlementRepository(db, lock, undefined, participant);
  const manual = new ManualSettlementService(finance, ledger, repository, { authorize: () => ({ actorUserId: "internal-proof", actorLabel: "Internal proof" }) }, dependencies, undefined, participant);
  return { db, lock, ledger, finance, invoices, invoiceService, participant, repository, manual };
}
async function openGraph() {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-615-refusal-")), "fixture.sqlite");
  const db = createDatabaseConnection(path, "", { journalMode: "preserve" });
  await ensureFreshExperimentalInvoiceSettlementSchema(db);
  db.prepare("INSERT INTO external_counterparty(id,full_name,phone_number,note,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(party,"Primary","",null,date,date);
  db.prepare("INSERT INTO external_counterparty(id,full_name,phone_number,note,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(otherParty,"Other","",null,date,date);
  db.prepare("INSERT INTO role(id,key,name,description,is_system,created_at,updated_at) VALUES (?,?,?,?,0,?,?)").run("matrix-worker-role","matrix-worker","Matrix worker",null,date,date);
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(worker,"Worker","Test","matrix-worker-phone","matrix-worker-role",date,date);
  return { path, db, graph: compose(db) };
}
function snapshot(graph: Graph) {
  return {
    accounts: graph.finance.listAccounts(),
    entries: graph.finance.listAccounts().flatMap(account => graph.finance.listEntries(account.id)),
    invoices: graph.invoices.listInvoices(), payments: graph.invoiceService.listPayments().items,
    settlements: graph.db.prepare("SELECT * FROM manual_debt_settlement ORDER BY id").all(),
    reversals: graph.db.prepare("SELECT * FROM manual_debt_settlement_reversal ORDER BY id").all(),
    financeCommands: graph.db.prepare("SELECT * FROM exact_finance_command ORDER BY id").all(),
    debtCommands: graph.db.prepare("SELECT * FROM debt_command ORDER BY id").all(),
  };
}
function makeInvoice(graph: Graph, requestId: string, direction: "PURCHASE" | "SALE" = "PURCHASE", paid = "20.00") {
  const id = crypto.randomUUID();
  graph.invoiceService.createInvoice({ requestId: `${requestId}-draft`, id, counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, supplierName: "Primary", direction, lineItems: [{ description: "Goods", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }] });
  const received = graph.invoiceService.receiveInvoice({ requestId: `${requestId}-receive`, id });
  if (paid !== "0.00") graph.invoiceService.createPayment({ requestId: `${requestId}-payment`, counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, direction, paymentDate: date, paymentMethod: "BANK_TRANSFER", totalAmount: paid, allocations: [{ invoiceId: id, amount: paid }] });
  return { id, originalId: received.debtEntryId!, accountId: received.debtAccountId! };
}
function manualAccount(graph: Graph, requestId: string, direction: "PAYABLE" | "RECEIVABLE" = "RECEIVABLE", amount = "80.00", counterparty = party) {
  const account = graph.finance.createAccount({ requestId, partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: counterparty, direction, openingBalanceDzd: amount });
  return { accountId: account.id, originalId: graph.ledger.listEntries(account.id)[0]!.id };
}
const pairInput = (payableOriginalEntryId: string, receivableOriginalEntryId: string, partyId = party) => ({ currency: "DZD" as const, externalCounterpartyId: partyId, payableOriginalEntryId, receivableOriginalEntryId, amountDzd: "80.00" });
const confirmInput = (input: ReturnType<typeof pairInput>, requestId: string, expectedPayableRemainingDzd = "80.00", expectedReceivableRemainingDzd = "80.00") => ({ ...input, requestId, expectedPayableRemainingDzd, expectedReceivableRemainingDzd });

it("refuses a stale preview after a second native connection commits actual invoice payment", async () => {
  const opened = await openGraph();
  let peerDb: ReturnType<typeof createDatabaseConnection> | undefined;
  try {
    const invoice = makeInvoice(opened.graph, "stale-invoice");
    const receivable = manualAccount(opened.graph, "stale-manual");
    const previewInput = pairInput(invoice.originalId, receivable.originalId);
    const preview = opened.graph.manual.preview(previewInput);
    peerDb = createDatabaseConnection(opened.path, "", { journalMode: "preserve" });
    const peer = compose(peerDb);
    const competingPayment = peer.invoiceService.createPayment({ requestId: "stale-peer-payment", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, direction: "PURCHASE", paymentDate: date, paymentMethod: "CHECK", totalAmount: "1.00", allocations: [{ invoiceId: invoice.id, amount: "1.00" }] });
    const afterPeer = snapshot(opened.graph);
    expect(opened.graph.invoiceService.getInvoice(invoice.id)).toMatchObject({ paidAmount: "21.00", remainingAmount: "79.00" });
    expect(() => opened.graph.manual.confirm(confirmInput(previewInput, "stale-confirm"))).toThrow(/exceeds remaining obligation/i);
    expect(snapshot(opened.graph)).toEqual(afterPeer);
    expect(opened.graph.invoiceService.listPayments().items.find(row => row.id === competingPayment.id)).toMatchObject({ totalAmount: "1.00", unallocatedAmount: "0.00" });
    expect(opened.graph.repository.listAccountSettlements(receivable.accountId)).toEqual([]);
  } finally { peerDb?.close(); opened.db.close(); }
});

it("rolls back second-side posting and aggregate-receipt failures for a real invoice pair, then retries once", async () => {
  const opened = await openGraph();
  try {
    const payable = makeInvoice(opened.graph, "rollback-purchase", "PURCHASE");
    const receivable = makeInvoice(opened.graph, "rollback-sale", "SALE");
    const alternateReceivable = makeInvoice(opened.graph, "rollback-alternate-sale", "SALE");
    const previewInput = pairInput(payable.originalId, receivable.originalId);
    opened.graph.manual.preview(previewInput);
    const input = confirmInput(previewInput, "rollback-pair");
    const before = snapshot(opened.graph);
    const saveEntry = opened.graph.ledger.saveEntry.bind(opened.graph.ledger);
    let postings = 0;
    opened.graph.ledger.saveEntry = entry => {
      if (entry.entryType === "SETTLEMENT") { postings += 1; if (postings === 2) throw new Error("Injected second-side posting failure"); }
      saveEntry(entry);
    };
    expect(() => opened.graph.manual.confirm(input)).toThrow(/Injected second-side posting failure/);
    opened.graph.ledger.saveEntry = saveEntry;
    expect(snapshot(opened.graph)).toEqual(before);
    expect(opened.graph.repository.listAccountSettlements(payable.accountId)).toEqual([]);

    const saveReceipt = opened.graph.ledger.saveAggregateCommand.bind(opened.graph.ledger);
    opened.graph.ledger.saveAggregateCommand = () => { throw new Error("Injected mixed aggregate receipt failure"); };
    expect(() => opened.graph.manual.confirm(input)).toThrow(/Injected mixed aggregate receipt failure/);
    opened.graph.ledger.saveAggregateCommand = saveReceipt;
    expect(snapshot(opened.graph)).toEqual(before);
    const confirmed = opened.graph.manual.confirm(input);
    expect(confirmed.settlement.amountDzd).toBe("80.00");
    expect(opened.graph.finance.remaining(payable.originalId)).toBe("0.00");
    expect(opened.graph.finance.remaining(receivable.originalId)).toBe("0.00");
    expect(opened.graph.repository.listAccountSettlements(payable.accountId)).toHaveLength(1);
    const afterConfirm = snapshot(opened.graph);
    expect(() => opened.graph.manual.confirm({ ...input, amountDzd: "79.00" })).toThrow(/replay conflict/i);
    expect(() => opened.graph.manual.confirm({ ...input, receivableOriginalEntryId: alternateReceivable.originalId })).toThrow(/replay conflict/i);
    expect(snapshot(opened.graph)).toEqual(afterConfirm);
  } finally { opened.db.close(); }
});

it.each(["draft", "voided", "exhausted", "wrong-party", "same-direction", "payment-entry", "worker-source"] as const)("refuses reachable ineligible source: %s without writes", async scenario => {
  const opened = await openGraph();
  try {
    const invoice = makeInvoice(opened.graph, `refusal-${scenario}`, "PURCHASE", scenario === "exhausted" ? "100.00" : "20.00");
    const opposite = manualAccount(opened.graph, `refusal-manual-${scenario}`);
    let payableId = invoice.originalId;
    let receivableId = opposite.originalId;
    let requestedParty = party;
    if (scenario === "draft") {
      const id = crypto.randomUUID();
      opened.graph.invoiceService.createInvoice({ requestId: "draft-only", id, counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, supplierName: "Primary", lineItems: [{ description: "Draft", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }] });
      payableId = id;
    } else if (scenario === "voided") {
      opened.graph.invoiceService.voidInvoice({ requestId: "void-source", id: invoice.id, reason: "Reachable source void" });
    } else if (scenario === "wrong-party") {
      const wrong = manualAccount(opened.graph, "wrong-party-account", "RECEIVABLE", "80.00", otherParty);
      receivableId = wrong.originalId;
    } else if (scenario === "same-direction") {
      const second = makeInvoice(opened.graph, "same-side", "PURCHASE");
      receivableId = second.originalId;
    } else if (scenario === "payment-entry") {
      const payment = opened.graph.invoiceService.listPayments().items.find(row => row.allocations.some(allocation => allocation.invoiceId === invoice.id))!;
      receivableId = payment.allocations[0]!.debtEntryId;
    } else if (scenario === "worker-source") {
      const account = opened.graph.finance.createAccount({ requestId: "worker-source-account", partyType: "INTERNAL_WORKER", workerId: worker, direction: "RECEIVABLE", openingBalanceDzd: "80.00" });
      receivableId = opened.graph.ledger.listEntries(account.id)[0]!.id;
    }
    if (scenario === "wrong-party") requestedParty = party;
    const preview = pairInput(payableId, receivableId, requestedParty);
    const before = snapshot(opened.graph);
    expect(() => opened.graph.manual.preview(preview)).toThrow();
    expect(() => opened.graph.manual.confirm(confirmInput(preview, `refuse-confirm-${scenario}`))).toThrow();
    expect(snapshot(opened.graph)).toEqual(before);
  } finally { opened.db.close(); }
});
