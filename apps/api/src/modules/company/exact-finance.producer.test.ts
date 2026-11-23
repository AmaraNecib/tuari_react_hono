import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ExactFinanceService } from "./exact-finance.service";
import { InMemoryExactFinanceRepository } from "./adapters/inmemory-exact-finance.repository";

const partyId = "00000000-0000-4000-8000-000000000999";
const invoiceId = "00000000-0000-4000-8000-000000000111";
const producer = { type: "INVOICE" as const, id: invoiceId };

describe("exact producer ledger interface", () => {
  it("rolls back domain state and ledger when aggregate receipt persistence fails, then replays once", () => {
    const repo = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [partyId] });
    const finance = new ExactFinanceService(repo, { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" });
    let domain = { total: "0.00" };
    const participant = {
      transactionIdentity: finance.transactionIdentity,
      withTransaction<T>(work: () => T): T {
        const before = structuredClone(domain);
        try { return work(); } catch (error) { domain = before; throw error; }
      },
    };
    const input = { producer, requestId: "receive", intent: { total: "0.30", lines: ["0.10", "0.20"] }, actorUserId: "operator" };
    let calls = 0;
    const work = () => {
      calls++;
      domain.total = "0.30";
      const account = finance.createAccount({ requestId: "aggregate-account", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: partyId, direction: "PAYABLE" });
      return finance.forProducer(producer).postEntry({ requestId: "aggregate-entry", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "0.30", invoiceId });
    };
    const original = repo.saveAggregateCommand.bind(repo);
    repo.saveAggregateCommand = () => { throw new Error("Injected aggregate receipt failure"); };
    expect(() => finance.runAggregate(input, participant, work)).toThrow(/receipt failure/);
    expect(domain.total).toBe("0.00");
    expect(finance.listAccounts()).toEqual([]);
    repo.saveAggregateCommand = original;
    const result = finance.runAggregate(input, participant, work);
    expect(finance.runAggregate({ ...input, transactionId: "retry" }, participant, work)).toEqual(result);
    expect(calls).toBe(2);
    expect(domain.total).toBe("0.30");
    expect(() => finance.runAggregate({ ...input, intent: { ...input.intent, total: "0.31" } }, participant, work)).toThrow(/conflict/i);
    expect(() => finance.runAggregate({ ...input, actorUserId: "other" }, participant, work)).toThrow(/conflict/i);
    expect(finance.listEntries(result.debtAccountId)).toHaveLength(1);
  });
  it("retains validated invoice provenance and rejects generic mutation of an owned original", () => {
    const repo = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [partyId] });
    const finance = new ExactFinanceService(repo, { id: randomUUID, now: () => "2026-11-10T00:00:00.000Z" });
    const account = finance.createAccount({ requestId: "account", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: partyId, direction: "PAYABLE" });
    const port = finance.forProducer(producer);
    const entry = port.postEntry({ requestId: "invoice-post", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "0.30", invoiceId });
    expect(entry).toMatchObject({ invoiceId, producerType: "INVOICE", producerId: invoiceId });
    expect(() => finance.recordPayment({ requestId: "bypass", debtEntryId: entry.id, amountDzd: "0.10" })).toThrow(/producer/i);
    expect(finance.remaining(entry.id)).toBe("0.30");
    const payment = port.recordPayment({ requestId: "pay", debtEntryId: entry.id, amountDzd: "0.10" });
    expect(payment).toMatchObject({ invoiceId, producerType: "INVOICE", producerId: invoiceId, targetEntryId: entry.id });
    expect(finance.remaining(entry.id)).toBe("0.20");
  });
});
