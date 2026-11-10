import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { exactDebtSchemaStatements } from "./adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { InMemoryExactFinanceRepository } from "./adapters/inmemory-exact-finance.repository";
import { ExactFinanceService } from "./exact-finance.service";
import type { ExactFinanceRepository } from "./exact-finance.repository";

const close: (() => void)[] = [];
afterEach(() => { for (const cleanup of close.splice(0)) cleanup(); });
const date = "2026-11-10T10:00:00.000Z";
const partyId = "00000000-0000-4000-8000-000000000999";
const party = { partyType: "EXTERNAL_COUNTERPARTY" as const, externalCounterpartyId: partyId, direction: "PAYABLE" as const };
function setup(kind: "memory" | "plain" | "keyed") {
  let repo: ExactFinanceRepository;
  if (kind === "memory") repo = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [partyId] });
  else {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-524-parity-")), "ledger.sqlite");
    const db = createDatabaseConnection(path, kind === "keyed" ? "524-parity-public-key" : "");
    close.push(() => db.close());
    db.pragma("foreign_keys=ON");
    db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO external_counterparty VALUES ('${partyId}')`);
    for (const sql of exactDebtSchemaStatements) db.exec(sql);
    repo = new SqliteExactFinanceRepository(db, createFifoLock());
  }
  const service = new ExactFinanceService(repo, { id: randomUUID, now: () => date });
  return { repo, service };
}
describe.each(["memory", "plain", "keyed"] as const)("exact debt lifecycle parity: %s", kind => {
  it("rejects nonexistent parties rather than create an orphan or salary-derived balance", () => {
    const { service } = setup(kind);
    expect(() => service.createAccount({ ...party, externalCounterpartyId: randomUUID(), requestId: "orphan", openingBalanceDzd: "1.00" })).toThrow();
    expect(service.listAccounts()).toEqual([]);
  });
  it("replays canonical commands once, conflicts on changed amounts or actor, and preserves identities", () => {
    const { service } = setup(kind);
    const input = { ...party, requestId: "opening", openingBalanceDzd: "0.1", actorUserId: "operator" };
    const account = service.createAccount(input);
    expect(service.createAccount({ ...input, openingBalanceDzd: "0.10", transactionId: "new-attempt" })).toEqual(account);
    expect(service.listEntries(account.id)).toHaveLength(1);
    expect(() => service.createAccount({ ...input, openingBalanceDzd: "0.20" })).toThrow(/replay conflict/);
    expect(() => service.createAccount({ ...input, actorUserId: "other" })).toThrow(/replay conflict/);
    expect(service.createAccount({ ...party, requestId: "reuse" }).id).toBe(account.id);
    expect(service.createAccount({ ...party, direction: "RECEIVABLE", requestId: "opposite" }).id).not.toBe(account.id);
  });
  it.each([
    { amounts: ["-92233720368547758.07", "92233720368547758.07", "92233720368547758.07"], balances: ["-92233720368547758.07", "0.00", "92233720368547758.07"] },
    { amounts: ["92233720368547758.07", "-92233720368547758.07", "-92233720368547758.07"], balances: ["92233720368547758.07", "0.00", "-92233720368547758.07"] },
    { amounts: ["-92233720368547758.07", "92233720368547758.07", "-92233720368547758.07", "92233720368547758.07", "92233720368547758.07"], balances: ["-92233720368547758.07", "0.00", "-92233720368547758.07", "0.00", "92233720368547758.07"] },
    { amounts: ["92233720368547758.07", "-92233720368547758.07", "92233720368547758.07", "-92233720368547758.07", "-92233720368547758.07"], balances: ["92233720368547758.07", "0.00", "92233720368547758.07", "0.00", "-92233720368547758.07"] },
  ])("settles mixed-sign obligations without intermediate overflow: $amounts", ({ amounts, balances }) => {
    const { service } = setup(kind);
    const account = service.createAccount({ ...party, requestId: "mixed-account" });
    const originals = amounts.map((signedAmountDzd, index) => service.postEntry({ requestId: `mixed-${index}`, debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd }));
    expect(service.listEntries(account.id).map(row => row.balanceAfterDzd)).toEqual(balances);
    const settled = service.settleAccount({ requestId: "mixed-settle", debtAccountId: account.id });
    expect(settled).toHaveLength(amounts.length);
    for (const original of originals) {
      expect(settled.find(row => row.targetEntryId === original.id)?.signedAmountDzd).toBe(original.signedAmountDzd.startsWith("-") ? "92233720368547758.07" : "-92233720368547758.07");
      expect(service.remaining(original.id)).toBe("0.00");
    }
    expect(service.getAccount(account.id)).toMatchObject({ currentBalance: "0.00", status: "SETTLED" });
    expect(service.settleAccount({ requestId: "mixed-settle", debtAccountId: account.id })).toEqual(settled);
    expect(service.listEntries(account.id)).toHaveLength(amounts.length * 2);
  });
  it("reports positive payable and receivable gross exposure without netting opposite accounts", () => {
    const { service } = setup(kind);
    service.createAccount({ ...party, requestId: "payable", openingBalanceDzd: "20.10" });
    service.createAccount({ ...party, direction: "RECEIVABLE", requestId: "receivable", openingBalanceDzd: "100.20" });
    expect(service.summary()).toMatchObject({ grossPayableDzd: "20.10", grossReceivableDzd: "100.20" });
  });
  it("uses persisted posting order when UUID display ordering differs and voids only linked effects", () => {
    const { service } = setup(kind);
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "10.00" });
    const original = service.listEntries(account.id)[0]!;
    const other = service.postEntry({ requestId: "other", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "20.00" });
    for (let i = 0; i < 12; i++) service.recordPayment({ requestId: `payment${i}`, debtEntryId: original.id, amountDzd: "0.10" });
    const unrelated = service.recordPayment({ requestId: "unrelated", debtEntryId: other.id, amountDzd: "4.00" });
    const correction = service.correctEntry({ requestId: "correction", entryId: original.id, amountDzd: "8.00", reason: "Agreement corrected" });
    expect(service.remaining(original.id)).toBe("6.80");
    service.voidEntry({ requestId: "void-opening", entryId: original.id, voidReason: "Original cancelled", actorLabel: "Operator" });
    expect(service.getAccount(account.id).currentBalance).toBe("16.00");
    const rows = service.listEntries(account.id);
    expect(rows.map(row => row.postingSequence)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(rows.find(row => row.id === correction.id)?.status).toBe("VOIDED");
    expect(rows.find(row => row.id === unrelated.id)).toMatchObject({ status: "LIVE", balanceAfterDzd: "16.00", targetEntryId: other.id });
    expect(() => JSON.stringify(service.detail(account.id))).not.toThrow();
  });
  it("keeps cents beyond Number safe range and rejects overpayment, overflow, numeric wires and foreign currencies atomically", () => {
    const { service } = setup(kind);
    const account = service.createAccount({ ...party, requestId: "max", openingBalanceDzd: "92233720368547758.07" });
    const opening = service.listEntries(account.id)[0]!;
    expect(() => service.postEntry({ requestId: "overflow", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "0.01" })).toThrow();
    expect(service.listEntries(account.id)).toHaveLength(1);
    service.recordPayment({ requestId: "one-cent", debtEntryId: opening.id, amountDzd: "0.01" });
    expect(service.getAccount(account.id).currentBalance).toBe("92233720368547758.06");
    expect(() => service.recordPayment({ requestId: "over", debtEntryId: opening.id, amountDzd: "92233720368547758.07" })).toThrow(/remaining/);
    for (const amount of ["1.001", "1e2", "-0.01", "0", 1]) {
      expect(() => service.recordPayment({ requestId: "invalid", debtEntryId: opening.id, amountDzd: amount as string })).toThrow();
    }
    expect(() => service.recordPayment({ requestId: "currency", debtEntryId: opening.id, amountDzd: "0.01", currency: "EUR" as "DZD" })).toThrow();
    expect(service.getAccount(account.id).currentBalance).toBe("92233720368547758.06");
    expect(service.listEntries(account.id)).toHaveLength(2);
  });
  it("preserves recorded payment attribution across corrections, reversals and full settlement replay", () => {
    const { service } = setup(kind);
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "10.00" });
    const opening = service.listEntries(account.id)[0]!;
    service.recordPayment({ requestId: "pay", debtEntryId: opening.id, amountDzd: "3.00" });
    const correction = service.correctEntry({ requestId: "increase", entryId: opening.id, amountDzd: "12.00", reason: "Original agreement" });
    const settlement = service.settleAccount({ requestId: "settle", debtAccountId: account.id });
    expect(settlement[0]).toMatchObject({ signedAmountDzd: "-9.00", targetEntryId: opening.id });
    expect(service.settleAccount({ requestId: "settle", debtAccountId: account.id })).toEqual(settlement);
    expect(() => service.voidEntry({ requestId: "bad-void", entryId: correction.id, voidReason: "Would overpay" })).toThrow(/settled/);
    expect(service.getAccount(account.id).currentBalance).toBe("0.00");
    expect(service.listEntries(account.id).find(row => row.id === correction.id)?.status).toBe("LIVE");
    service.voidEntry({ requestId: "undo-settlement", entryId: settlement[0]!.id, voidReason: "Payment reversed" });
    expect(service.remaining(opening.id)).toBe("9.00");
    service.voidEntry({ requestId: "undo-correction", entryId: correction.id, voidReason: "Agreement reversed" });
    expect(service.remaining(opening.id)).toBe("7.00");
  });
  it("preserves signed credit obligations and their recorded correction and settlement reversals", () => {
    const { service } = setup(kind);
    const account = service.createAccount({ ...party, requestId: "account" });
    const credit = service.postEntry({ requestId: "credit", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "-0.30" });
    const correction = service.correctEntry({ requestId: "correct-credit", entryId: credit.id, amountDzd: "-0.20", reason: "Credit corrected" });
    expect(correction.signedAmountDzd).toBe("0.10");
    expect(service.summary()).toMatchObject({ grossPayableDzd: "0.00", grossReceivableDzd: "0.20" });
    const settled = service.settleAccount({ requestId: "settle-credit", debtAccountId: account.id });
    expect(settled[0]).toMatchObject({ signedAmountDzd: "0.20", targetEntryId: credit.id });
    service.voidEntry({ requestId: "reverse", entryId: settled[0]!.id, voidReason: "Recorded reversal" });
    expect(service.remaining(credit.id)).toBe("-0.20");
  });
  it("rolls back a void if any recomputed running balance would overflow", () => {
    const { service } = setup(kind);
    const account = service.createAccount({ ...party, requestId: "max", openingBalanceDzd: "92233720368547758.07" });
    const first = service.listEntries(account.id)[0]!;
    const payment = service.recordPayment({ requestId: "paid", debtEntryId: first.id, amountDzd: "92233720368547758.07" });
    service.postEntry({ requestId: "new", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "92233720368547758.07" });
    expect(() => service.voidEntry({ requestId: "overflow-void", entryId: payment.id, voidReason: "Would overflow" })).toThrow();
    expect(service.getAccount(account.id).currentBalance).toBe("92233720368547758.07");
    expect(service.listEntries(account.id).find(row => row.id === payment.id)?.status).toBe("LIVE");
  });
  it("preserves numeric money ordering and rejects mutations of recorded identity/attribution", () => {
    const { repo, service } = setup(kind);
    const first = service.createAccount({ ...party, requestId: "large", openingBalanceDzd: "90071992547409.93" });
    const second = service.createAccount({ ...party, direction: "RECEIVABLE", requestId: "small", openingBalanceDzd: "90071992547409.92" });
    expect(service.listAccounts().map(row => row.id)).toEqual([second.id, first.id]);
    expect(() => repo.saveAccount({ ...first, direction: "RECEIVABLE" })).toThrow();
    const opening = service.listEntries(first.id)[0]!;
    expect(() => repo.saveEntry({ ...opening, signedAmountDzd: "0.01" })).toThrow(/immutable/);
    expect(() => repo.saveEntry({ ...opening, targetEntryId: service.listEntries(second.id)[0]!.id })).toThrow();
    expect(service.getAccount(first.id).currentBalance).toBe("90071992547409.93");
  });
  it("rolls back postings, account balances and the replay journal when receipt persistence fails", () => {
    const { repo, service } = setup(kind);
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    const original = repo.saveCommand.bind(repo);
    repo.saveCommand = () => { throw new Error("Injected journal failure"); };
    expect(() => service.recordPayment({ requestId: "rollback", debtEntryId: service.listEntries(account.id)[0]!.id, amountDzd: "0.10" })).toThrow(/journal/);
    repo.saveCommand = original;
    expect(service.getAccount(account.id).currentBalance).toBe("1.00");
    expect(service.listEntries(account.id)).toHaveLength(1);
    expect(repo.getCommand("rollback")).toBeNull();
    service.recordPayment({ requestId: "rollback", debtEntryId: service.listEntries(account.id)[0]!.id, amountDzd: "0.10" });
    expect(service.getAccount(account.id).currentBalance).toBe("0.90");
  });
});
