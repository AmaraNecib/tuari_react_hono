import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Money } from "@tuari/contracts";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { bindMoney, prepareMoneyRead } from "../../infrastructure/database/exact-money-storage";
import { exactDebtSchemaStatements } from "./adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { InMemoryExactFinanceRepository } from "./adapters/inmemory-exact-finance.repository";
import { ExactFinanceService } from "./exact-finance.service";
import { exactFinanceJson } from "./exact-finance-json";
import type { ExactFinanceRepository, ExactTransactionParticipant } from "./exact-finance.repository";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const close of cleanups.splice(0)) close(); });
const partyId = "00000000-0000-4000-8000-000000000999";
const invoiceId = "00000000-0000-4000-8000-000000000111";
const producer = { type: "INVOICE" as const, id: invoiceId };
const dependencies = { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" };
const accountInput = { requestId: "account", partyType: "EXTERNAL_COUNTERPARTY" as const, externalCounterpartyId: partyId, direction: "PAYABLE" as const };

function setup(kind: "memory" | "plain" | "keyed") {
  let repo: ExactFinanceRepository;
  let participant: ExactTransactionParticipant;
  let writeDomain: (value: string) => void;
  let readDomain: () => string;
  if (kind === "memory") {
    repo = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [partyId] });
    let amount = "0.00";
    participant = { transactionIdentity: repo.transactionIdentity, withTransaction<T>(work: () => T): T {
      const before = amount;
      try { return work(); } catch (error) { amount = before; throw error; }
    } };
    writeDomain = value => { amount = Money.parse(value).toWire(); };
    readDomain = () => amount;
  } else {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-525-aggregate-")), "fixture.sqlite");
    const db = createDatabaseConnection(path, kind === "keyed" ? "525-public-synthetic-key" : "");
    cleanups.push(() => db.close());
    const lock = createFifoLock();
    db.pragma("foreign_keys=ON");
    db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY, total_minor INTEGER NOT NULL); INSERT INTO external_counterparty VALUES ('${partyId}'); INSERT INTO invoice VALUES ('${invoiceId}',0)`);
    for (const sql of exactDebtSchemaStatements) db.exec(sql);
    repo = new SqliteExactFinanceRepository(db, lock);
    participant = { transactionIdentity: { connection: db, lock }, withTransaction: work => lock.runSync(() => db.transaction(work).immediate()) };
    writeDomain = value => { db.prepare("UPDATE invoice SET total_minor=? WHERE id=?").run(bindMoney(Money.parse(value)), invoiceId); };
    readDomain = () => prepareMoneyRead(db, "SELECT total_minor AS minor_units FROM invoice WHERE id=?").get(invoiceId)!.toWire();
  }
  const finance = new ExactFinanceService(repo, dependencies);
  const input = { requestId: "receive", producer, intent: { amount: "90071992547409.93", orderedLines: ["0.10", "0.20"] }, actorUserId: "operator" };
  const work = () => {
    writeDomain(input.intent.amount);
    const account = finance.createAccount(accountInput);
    const entry = finance.forProducer(producer).postEntry({ requestId: "original", invoiceId, debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: input.intent.amount });
    return { invoiceId, entryId: entry.id, accountId: account.id, amount: input.intent.amount };
  };
  return { repo, finance, participant, input, work, readDomain, writeDomain };
}

it("bounds aggregate JSON depth, node count and serialized size before persisting intent", () => {
  const { finance, participant, input, work, readDomain } = setup("memory");
  let nested: unknown = null;
  for (let depth = 0; depth < 33; depth++) nested = [nested];
  for (const intent of [nested, Array(20001).fill(null), { text: "x".repeat(262144) }]) {
    expect(() => finance.runAggregate({ ...input, intent }, participant, work)).toThrow(/JSON resource limit/);
    expect(readDomain()).toBe("0.00");
    expect(finance.listAccounts()).toEqual([]);
  }
  expect(exactFinanceJson({ z: true, amount: "0.30", ignored: undefined, nested: [null, false, 1] })).toBe('{"amount":"0.30","nested":[null,false,1],"z":true}');
});
it("refuses invalid aggregate identities and async functions before running domain work", () => {
  const { finance, participant, input, work, readDomain } = setup("memory");
  for (const requestId of ["", "space invalid", "x".repeat(129)]) expect(() => finance.runAggregate({ ...input, requestId }, participant, work)).toThrow(/Invalid aggregate request id/);
  expect(() => finance.runAggregate(input, participant, async () => work())).toThrow(/synchronous JSON/);
  expect(readDomain()).toBe("0.00");
  expect(finance.listAccounts()).toEqual([]);
});
it("requires explicit producer original postings and paired immutable attribution", () => {
  const { finance, repo } = setup("memory");
  const port = finance.forProducer(producer);
  expect(() => port.createAccount({ ...accountInput, openingBalanceDzd: "1.00" })).toThrow(/explicit original/);
  expect(finance.listAccounts()).toEqual([]);
  const account = port.createAccount(accountInput);
  const post = { debtAccountId: account.id, entryType: "ADJUSTMENT" as const, signedAmountDzd: "1.00" };
  expect(() => finance.postEntry({ ...post, requestId: "unowned-link", invoiceId })).toThrow(/validated invoice producer/);
  expect(() => port.postEntry({ ...post, requestId: "missing-link" })).toThrow(/Invoice producer linkage mismatch/);
  const original = port.postEntry({ ...post, requestId: "paired", invoiceId });
  expect(() => repo.saveEntry({ ...original, producerId: null })).toThrow(/both type and id/);
  expect(() => repo.saveEntry({ ...original, producerType: null })).toThrow(/both type and id/);
  expect(repo.getEntry(original.id)).toEqual(original);
  expect(finance.remaining(original.id)).toBe("1.00");
});

describe.each(["memory", "plain", "keyed"] as const)("whole aggregate transaction: %s", kind => {
  it("rolls back domain, ledger and nested receipts on aggregate journal failure, then retries and replays exactly", () => {
    const { repo, finance, participant, input, work, readDomain } = setup(kind);
    const save = repo.saveAggregateCommand.bind(repo);
    repo.saveAggregateCommand = () => { throw new Error("Injected aggregate journal failure"); };
    expect(() => finance.runAggregate(input, participant, work)).toThrow(/journal failure/);
    expect(readDomain()).toBe("0.00");
    expect(finance.listAccounts()).toEqual([]);
    expect(repo.getCommand("original")).toBeNull();
    expect(repo.getCommand("account")).toBeNull();
    repo.saveAggregateCommand = save;
    const result = finance.runAggregate(input, participant, work);
    expect(readDomain()).toBe("90071992547409.93");
    expect(finance.runAggregate({ ...input, transactionId: "new-attempt" }, participant, () => { throw new Error("Replay executed work"); })).toEqual(result);
    expect(finance.listEntries(result.accountId)).toHaveLength(1);
    expect(finance.getAccount(result.accountId).currentBalance).toBe("90071992547409.93");
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(() => finance.runAggregate({ ...input, actorUserId: "different" }, participant, work)).toThrow(/conflict/i);
    expect(() => finance.runAggregate({ ...input, intent: { ...input.intent, orderedLines: ["0.20", "0.10"] } }, participant, work)).toThrow(/conflict/i);
  });

  it("rolls back both participants on domain failure and rejects asynchronous or non-JSON results", () => {
    const { finance, participant, input, work, readDomain } = setup(kind);
    expect(() => finance.runAggregate(input, participant, () => { work(); throw new Error("Injected domain failure"); })).toThrow(/domain failure/);
    expect(readDomain()).toBe("0.00");
    expect(finance.listAccounts()).toEqual([]);
    expect(() => finance.runAggregate(input, participant, () => { work(); return Promise.resolve("not synchronous"); })).toThrow(/synchronous JSON/);
    expect(() => finance.runAggregate(input, participant, () => { work(); return { amount: 1n }; })).toThrow(/synchronous JSON/);
    expect(readDomain()).toBe("0.00");
    expect(finance.listAccounts()).toEqual([]);
    expect(finance.runAggregate(input, participant, work).amount).toBe("90071992547409.93");
  });

  it("retains immutable producer attribution and leaves unrelated obligations usable in mixed accounts", () => {
    const { repo, finance } = setup(kind);
    const account = finance.createAccount({ ...accountInput, openingBalanceDzd: "1.00" });
    const unowned = finance.listEntries(account.id)[0]!;
    const port = finance.forProducer(producer);
    const original = port.postEntry({ requestId: "invoice-owned", debtAccountId: account.id, invoiceId, entryType: "ADJUSTMENT", signedAmountDzd: "0.30" });
    expect(() => finance.recordPayment({ requestId: "bypass-pay", debtEntryId: original.id, amountDzd: "0.10" })).toThrow(/producer/);
    expect(() => finance.correctEntry({ requestId: "bypass-correct", entryId: original.id, amountDzd: "0.25", reason: "Bypass" })).toThrow(/producer/);
    expect(() => finance.voidEntry({ requestId: "bypass-void", entryId: original.id, voidReason: "Bypass" })).toThrow(/producer/);
    expect(() => finance.forProducer({ type: "INVENTORY_PURCHASE", id: invoiceId }).recordPayment({ requestId: "wrong-owner", debtEntryId: original.id, amountDzd: "0.10" })).toThrow(/producer/);
    const genericSettlement = finance.settleAccount({ requestId: "settle-unowned", debtAccountId: account.id });
    expect(genericSettlement.map(row => row.targetEntryId)).toEqual([unowned.id]);
    expect(finance.remaining(original.id)).toBe("0.30");
    const paid = port.recordPayment({ requestId: "owned-pay", debtEntryId: original.id, amountDzd: "0.10" });
    const corrected = port.correctEntry({ requestId: "owned-correct", entryId: original.id, amountDzd: "0.25", reason: "Approved document correction" });
    expect([paid, corrected].map(row => [row.producerType, row.producerId, row.invoiceId])).toEqual([["INVOICE", invoiceId, invoiceId], ["INVOICE", invoiceId, invoiceId]]);
    expect(corrected.correctionOfEntryId).toBe(original.id);
    expect(paid.targetEntryId).toBe(original.id);
    expect(() => finance.voidEntry({ requestId: "bypass-payment-void", entryId: paid.id, voidReason: "Bypass" })).toThrow(/producer/);
    expect(() => repo.saveEntry({ ...original, producerId: "another-producer" })).toThrow();
    port.voidEntry({ requestId: "owned-void", entryId: original.id, voidReason: "Document cancelled" });
    expect(finance.remaining(unowned.id)).toBe("0.00");
    expect(finance.getAccount(account.id).currentBalance).toBe("0.00");
    expect(finance.listEntries(account.id).filter(row => row.producerId === invoiceId).map(row => row.status)).toEqual(["VOIDED", "VOIDED", "VOIDED"]);
  });

  it("rejects mismatched connection or lock identity before invoking either participant", () => {
    const { finance, participant, input, work, readDomain } = setup(kind);
    for (const transactionIdentity of [
      { ...participant.transactionIdentity, connection: {} },
      { ...participant.transactionIdentity, lock: {} },
    ]) {
      expect(() => finance.runAggregate(input, { transactionIdentity, withTransaction: () => { throw new Error("Wrong participant entered"); } }, work)).toThrow(/same connection and shared FIFO/);
    }
    expect(readDomain()).toBe("0.00");
    expect(finance.listAccounts()).toEqual([]);
  });
});
