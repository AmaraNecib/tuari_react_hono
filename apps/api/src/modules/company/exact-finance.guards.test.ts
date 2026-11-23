import { describe, expect, it, vi } from "vitest";
import { ExactFinanceService } from "./exact-finance.service";
import { InMemoryExactFinanceRepository } from "./adapters/inmemory-exact-finance.repository";

const external = "00000000-0000-4000-8000-000000000999";
const worker = "00000000-0000-4000-8000-000000000998";
const missing = "00000000-0000-4000-8000-000000000997";
const party = { partyType: "EXTERNAL_COUNTERPARTY" as const, externalCounterpartyId: external, direction: "PAYABLE" as const };
const workerParty = { partyType: "INTERNAL_WORKER" as const, workerId: worker, direction: "RECEIVABLE" as const };
function setup() {
  let id = 0;
  const repo = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [external], workerIds: [worker] });
  const service = new ExactFinanceService(repo, { id: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, now: () => "2026-01-01T00:00:00.000Z" });
  return { repo, service };
}

describe("exact debt command and storage guards", () => {
  it("rejects oversized audit intent before reserving or persisting a command", () => {
    const { repo, service } = setup();
    const transaction = vi.spyOn(repo, "withTransaction");
    expect(() => service.createAccount({ ...party, requestId: "oversized", actorLabel: "x".repeat(16001) })).toThrow(/resource limit/);
    expect(transaction).not.toHaveBeenCalled();
    expect(repo.listAccounts()).toEqual([]);
    expect(repo.getCommand("oversized")).toBeNull();
  });
  it("rejects missing, voided, allocated and zero-value targets without adding a payment", () => {
    const { repo, service } = setup();
    expect(() => service.getAccount(missing)).toThrow(/not found/);
    expect(() => service.remaining(missing)).toThrow(/not found/);
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    const original = service.listEntries(account.id)[0]!;
    const payment = service.recordPayment({ requestId: "payment", debtEntryId: original.id, amountDzd: "0.10" });
    const correction = service.correctEntry({ requestId: "correct", entryId: original.id, amountDzd: "2.00", reason: "Agreement" });
    for (const id of [payment.id, correction.id]) expect(() => service.remaining(id)).toThrow(/original obligation/);
    // Zero historical postings satisfy storage codecs but are not obligations.
    repo.saveEntry({ ...original, id: missing, postingSequence: 4, signedAmountDzd: "0.00", balanceAfterDzd: "1.90" });
    expect(() => service.remaining(missing)).toThrow(/original obligation/);
    service.voidEntry({ requestId: "void", entryId: original.id, voidReason: "Cancelled" });
    expect(() => service.remaining(original.id)).toThrow(/not found/);
    expect(service.listEntries(account.id)).toHaveLength(4);
  });
  it("enforces recorded posting sequence and prevents restoring a voided posting", () => {
    const { repo, service } = setup();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    const original = service.listEntries(account.id)[0]!;
    for (const postingSequence of [0, 1.5, 100001]) expect(() => repo.saveEntry({ ...original, postingSequence })).toThrow(/posting sequence/);
    const voided = service.voidEntry({ requestId: "void", entryId: original.id, voidReason: "Cancelled" });
    expect(() => repo.saveEntry({ ...voided, status: "LIVE" })).toThrow(/cannot be restored/);
    repo.saveEntry(voided);
    expect(repo.getEntry(original.id)?.status).toBe("VOIDED");
  });
  it("uses category direction and requires the detail of an OTHER reason before account creation", () => {
    const { repo, service } = setup();
    expect(() => service.createAccount({ ...party, requestId: "wrong-direction", reasonCategory: "SALARY_ADVANCE" })).toThrow(/direction mismatch/);
    expect(() => service.createAccount({ ...party, requestId: "no-detail", reasonCategory: "OTHER" })).toThrow(/requires detail/);
    expect(repo.listAccounts()).toEqual([]);
    const account = service.createAccount({ ...workerParty, requestId: "worker", openingBalanceDzd: "0.30", reasonCategory: "SALARY_ADVANCE" });
    expect(account).toMatchObject({ workerId: worker, externalCounterpartyId: null, direction: "RECEIVABLE", currentBalance: "0.30" });
    service.createAccount({ ...party, requestId: "other", reasonCategory: "OTHER", reasonDetail: "Documented agreement" });
    service.createAccount({ ...workerParty, requestId: "increase-worker", openingBalanceDzd: "0.20" });
    expect(service.listEntries(account.id).map(row => row.entryType)).toEqual(["OPENING", "ADJUSTMENT"]);
  });
  it("rejects zero, wrong-direction reasons, missing detail and backdated postings atomically", () => {
    const { repo, service } = setup();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    const base = { debtAccountId: account.id, entryType: "ADJUSTMENT" as const, signedAmountDzd: "0.10" };
    for (const [requestId, changes, error] of [
      ["zero", { signedAmountDzd: "0.00" }, /nonzero/],
      ["direction", { reasonCategory: "SALARY_ADVANCE" as const }, /direction mismatch/],
      ["detail", { reasonCategory: "OTHER" as const }, /requires detail/],
      ["date", { entryDate: "2025-12-31T00:00:00.000Z" }, /backdated/],
    ] as const) {
      expect(() => service.postEntry({ ...base, ...changes, requestId })).toThrow(error);
      expect(repo.getCommand(requestId)).toBeNull();
    }
    service.postEntry({ ...base, requestId: "valid", reasonCategory: "OTHER", reasonDetail: "Agreement", entryDate: "2026-01-01T01:00:00+01:00" });
    expect(service.getAccount(account.id).currentBalance).toBe("1.10");
    expect(service.listEntries(account.id)).toHaveLength(2);
  });
  it("permits only positive worker receivable advances and an initial positive opening", () => {
    const { service } = setup();
    const payable = service.createAccount({ ...party, requestId: "payable" });
    const externalReceivable = service.createAccount({ ...party, direction: "RECEIVABLE", requestId: "external-receivable" });
    const workerReceivable = service.createAccount({ ...workerParty, requestId: "worker" });
    const base = { entryType: "ADVANCE" as const, signedAmountDzd: "0.10" };
    for (const [requestId, debtAccountId, signedAmountDzd] of [["payable-advance", payable.id, "0.10"], ["external-advance", externalReceivable.id, "0.10"], ["negative-advance", workerReceivable.id, "-0.10"]] as const) {
      expect(() => service.postEntry({ ...base, requestId, debtAccountId, signedAmountDzd })).toThrow(/positive worker receivable/);
    }
    service.postEntry({ ...base, requestId: "valid-advance", debtAccountId: workerReceivable.id, reasonCategory: "SALARY_ADVANCE" });
    expect(() => service.postEntry({ requestId: "negative-opening", debtAccountId: payable.id, entryType: "OPENING", signedAmountDzd: "-0.10" })).toThrow(/first positive/);
    service.postEntry({ requestId: "opening", debtAccountId: payable.id, entryType: "OPENING", signedAmountDzd: "0.10" });
    expect(() => service.postEntry({ requestId: "second-opening", debtAccountId: payable.id, entryType: "OPENING", signedAmountDzd: "0.10" })).toThrow(/first positive/);
    expect(service.getAccount(workerReceivable.id).currentBalance).toBe("0.10");
    expect(service.getAccount(payable.id).currentBalance).toBe("0.10");
    expect(service.getAccount(externalReceivable.id).currentBalance).toBe("0.00");
  });
  it("rejects repository currency drift before a payment can write", () => {
    const { repo, service } = setup();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    const original = service.listEntries(account.id)[0]!;
    // Untrusted persisted data can drift independently of the DZD wire codec.
    // Check the service/repository seam, not an impossible EUR command codec.
    const read = vi.spyOn(repo, "getAccount").mockReturnValue({ ...account, currency: "EUR" as "DZD" });
    expect(() => service.recordPayment({ requestId: "drift", debtEntryId: original.id, amountDzd: "0.10" })).toThrow(/Currency mismatch/);
    read.mockRestore();
    expect(service.getAccount(account.id).currentBalance).toBe("1.00");
    expect(service.listEntries(account.id)).toHaveLength(1);
    expect(repo.getCommand("drift")).toBeNull();
  });
  it("rejects unchanged and sign-flipping corrections but permits an agreed amount equal to the recorded payment", () => {
    const { service } = setup();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    const original = service.listEntries(account.id)[0]!;
    const base = { entryId: original.id, reason: "Agreement" };
    expect(() => service.correctEntry({ ...base, requestId: "unchanged", amountDzd: "1.00" })).toThrow(/must change/);
    expect(() => service.correctEntry({ ...base, requestId: "sign", amountDzd: "-1.00" })).toThrow(/direction/);
    service.recordPayment({ requestId: "payment", debtEntryId: original.id, amountDzd: "0.30" });
    service.correctEntry({ ...base, requestId: "correct", amountDzd: "0.30" });
    expect(service.remaining(original.id)).toBe("0.00");
    expect(service.getAccount(account.id).status).toBe("SETTLED");
  });
  it("skips fully paid obligations and rejects a second distinct settlement without posting anything", () => {
    const { repo, service } = setup();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "0.30" });
    const original = service.listEntries(account.id)[0]!;
    const other = service.postEntry({ requestId: "other", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "2.00" });
    service.recordPayment({ requestId: "pay", debtEntryId: original.id, amountDzd: "0.30" });
    const settlement = service.settleAccount({ requestId: "settle", debtAccountId: account.id });
    expect(settlement.map(row => [row.targetEntryId, row.signedAmountDzd])).toEqual([[other.id, "-2.00"]]);
    expect(() => service.settleAccount({ requestId: "again", debtAccountId: account.id })).toThrow(/already settled/);
    expect(repo.getCommand("again")).toBeNull();
    expect(service.listEntries(account.id)).toHaveLength(4);
  });
  it("enforces account and entry read/write resource limits before mutation", () => {
    const { repo, service } = setup();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    const entry = service.listEntries(account.id)[0]!;
    // The public repository read seam can return oversized buffers. The guards
    // reject their size before consulting rows or attempting any mutation.
    const accounts = Array(100001).fill(account);
    const accountRead = vi.spyOn(repo, "listAccounts").mockReturnValue(accounts);
    expect(() => service.listAccounts()).toThrow(/account read limit/);
    accountRead.mockReturnValue(accounts.slice(0, 100000));
    expect(() => service.createAccount({ ...workerParty, requestId: "account-limit" })).toThrow(/account write resource limit/);
    accountRead.mockRestore();
    const entries = Array(100001).fill(entry);
    const entryRead = vi.spyOn(repo, "listEntries").mockReturnValue(entries);
    expect(() => service.listEntries(account.id)).toThrow(/entry read limit/);
    entryRead.mockReturnValue(entries.slice(0, 100000));
    expect(() => service.postEntry({ requestId: "entry-limit", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "0.01" })).toThrow(/entry write resource limit/);
    entryRead.mockRestore();
    expect(service.listAccounts()).toHaveLength(1);
    expect(service.listEntries(account.id)).toHaveLength(1);
    expect(repo.getCommand("account-limit")).toBeNull();
    expect(repo.getCommand("entry-limit")).toBeNull();
  });
});
