import { describe, expect, it } from "vitest";
import { ExactFinanceService } from "./exact-finance.service";
import { InMemoryExactFinanceRepository } from "./adapters/inmemory-exact-finance.repository";

function harness() {
  let id = 0;
  const repo = new InMemoryExactFinanceRepository({ externalCounterpartyIds: ["00000000-0000-4000-8000-000000000999"] });
  const service = new ExactFinanceService(repo, { id: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, now: () => "2026-01-01T00:00:00.000Z" });
  return { repo, service };
}
const party = { partyType: "EXTERNAL_COUNTERPARTY" as const, externalCounterpartyId: "00000000-0000-4000-8000-000000000999", direction: "PAYABLE" as const, currency: "DZD" as const };

describe("opt-in exact debt lifecycle", () => {
  it("corrects a selected obligation without reassigning payments and voids only linked effects", () => {
    const { service } = harness();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "10.00" });
    const opening = service.listEntries(account.id)[0]!;
    service.recordPayment({ requestId: "partial", debtEntryId: opening.id, amountDzd: "3.00" });
    const unrelated = service.postEntry({ requestId: "other", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "20.00" });
    const correction = service.correctEntry({ requestId: "correct", entryId: opening.id, amountDzd: "8.00", reason: "Corrected agreement" });
    expect(correction.correctionOfEntryId).toBe(opening.id);
    expect(correction.signedAmountDzd).toBe("-2.00");
    expect(service.remaining(opening.id)).toBe("5.00");
    expect(() => service.correctEntry({ requestId: "invalid", entryId: opening.id, amountDzd: "2.00", reason: "Too small" })).toThrow(/settled/);
    expect(service.remaining(unrelated.id)).toBe("20.00");
    service.voidEntry({ requestId: "void-correction", entryId: correction.id, voidReason: "Wrong correction" });
    expect(service.remaining(opening.id)).toBe("7.00");
  });

  it("settles each recorded obligation with attribution, and never nets opposite ledgers", () => {
    const { service } = harness();
    const payable = service.createAccount({ ...party, requestId: "payable", openingBalanceDzd: "90071992547409.93" });
    const receivable = service.createAccount({ ...party, direction: "RECEIVABLE", requestId: "receivable", openingBalanceDzd: "90071992547409.92" });
    expect(service.summary()).toMatchObject({ grossPayableDzd: "90071992547409.93", grossReceivableDzd: "90071992547409.92" });
    const result = service.settleAccount({ requestId: "settle", debtAccountId: payable.id });
    expect(result).toHaveLength(1);
    expect(result[0]?.targetEntryId).toBe(service.listEntries(payable.id)[0]?.id);
    expect(service.getAccount(payable.id).currentBalance).toBe("0.00");
    expect(service.getAccount(receivable.id).currentBalance).toBe("90071992547409.92");
  });

  it("reads a recorded history beyond the one-document operation cap without changing per-posting bounds", () => {
    const { repo, service } = harness();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "100.01" });
    const target = service.listEntries(account.id)[0]!;
    const history = [target, ...Array.from({ length: 10001 }, (_, index) => {
      const cents = 10000n - BigInt(index);
      return { ...target, id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, postingSequence: index + 2,
        entryType: "PAYMENT" as const, signedAmountDzd: "-0.01", balanceAfterDzd: `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`, targetEntryId: target.id };
    })];
    repo.saveAccount({ ...account, currentBalance: "0.00", status: "SETTLED", settledAt: account.updatedAt });
    repo.listEntries = () => history;
    expect(service.remaining(target.id)).toBe("0.00");
  });
  it("preserves exact partial and multiple settlements without affecting another obligation", () => {
    const { service } = harness();
    const account = service.createAccount({ ...party, requestId: "account" });
    const first = service.postEntry({ requestId: "first", debtAccountId: account.id, entryType: "OPENING", signedAmountDzd: "0.30" });
    const second = service.postEntry({ requestId: "second", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "2.00" });
    service.recordPayment({ requestId: "pay1", debtEntryId: first.id, amountDzd: "0.10" });
    service.recordPayment({ requestId: "pay2", debtEntryId: first.id, amountDzd: "0.20" });
    expect(service.getAccount(account.id).currentBalance).toBe("2.00");
    expect(service.remaining(first.id)).toBe("0.00");
    expect(service.remaining(second.id)).toBe("2.00");
    expect(() => service.recordPayment({ requestId: "extra", debtEntryId: first.id, amountDzd: "0.01" })).toThrow(/remaining/);
  });

  it("voids only a selected opening and its attributed payments, preserving unrelated payments", () => {
    const { service } = harness();
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "10.00" });
    const first = service.listEntries(account.id)[0]!;
    const second = service.postEntry({ requestId: "second", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "20.00" });
    const payment1 = service.recordPayment({ requestId: "pay1", debtEntryId: first.id, amountDzd: "3.00" });
    const payment2 = service.recordPayment({ requestId: "pay2", debtEntryId: second.id, amountDzd: "4.00" });
    service.voidEntry({ requestId: "void", entryId: first.id, voidReason: "Wrong opening", actorLabel: "Accountant" });
    expect(service.getAccount(account.id).currentBalance).toBe("16.00");
    const rows = service.listEntries(account.id);
    expect(rows.find(row => row.id === payment1.id)?.status).toBe("VOIDED");
    expect(rows.find(row => row.id === payment2.id)?.status).toBe("LIVE");
    expect(rows.find(row => row.id === payment2.id)?.balanceAfterDzd).toBe("16.00");
    expect(rows.find(row => row.id === first.id)?.voidedBy).toBe("Accountant");
  });
});
