import { Money } from "@tuari/contracts";
import { assertExactEntryUpdate } from "../exact-finance.repository";
import type { ExactDebtAccount, ExactDebtCommand, ExactDebtEntry, ExactFinanceRepository } from "../exact-finance.repository";

export class InMemoryExactFinanceRepository implements ExactFinanceRepository {
  private readonly workers: Set<string>;
  private readonly externalParties: Set<string>;
  constructor(references: { workerIds?: readonly string[]; externalCounterpartyIds?: readonly string[] } = {}) {
    this.workers = new Set(references.workerIds);
    this.externalParties = new Set(references.externalCounterpartyIds);
  }
  partyExists(partyType: ExactDebtAccount["partyType"], id: string): boolean {
    return (partyType === "INTERNAL_WORKER" ? this.workers : this.externalParties).has(id);
  }
  private accounts = new Map<string, ExactDebtAccount>();
  private entries = new Map<string, ExactDebtEntry>();
  private commands = new Map<string, ExactDebtCommand>();
  withTransaction<T>(work: () => T): T {
    const snapshot = structuredClone([this.accounts, this.entries, this.commands] as const);
    try {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Exact ledger transaction must be synchronous");
      return result;
    } catch (error) {
      [this.accounts, this.entries, this.commands] = snapshot;
      throw error;
    }
  }
  getAccount(id: string): ExactDebtAccount | null { return structuredClone(this.accounts.get(id) ?? null); }
  listAccounts(): ExactDebtAccount[] { return [...this.accounts.values()].map(row => structuredClone(row)).sort((a, b) => Money.parse(a.currentBalance).compare(Money.parse(b.currentBalance)) || a.id.localeCompare(b.id)); }
  saveAccount(account: ExactDebtAccount): void {
    if (!this.partyExists(account.partyType, account.workerId ?? account.externalCounterpartyId ?? "")) throw new Error("Debt party not found");
    account = { ...account, currentBalance: Money.parse(account.currentBalance, account.currency).toWire() };
    const old = this.accounts.get(account.id);
    const identity = (value: ExactDebtAccount) => JSON.stringify([value.partyType, value.workerId, value.externalCounterpartyId, value.direction, value.currency]);
    if (old && identity(old) !== identity(account)) throw new Error("Debt account identity is immutable");
    if ([...this.accounts.values()].some(row => row.id !== account.id && identity(row) === identity(account))) throw new Error("Duplicate debt account identity");
    this.accounts.set(account.id, structuredClone(account));
  }
  getEntry(id: string): ExactDebtEntry | null { return structuredClone(this.entries.get(id) ?? null); }
  listEntries(accountId: string): ExactDebtEntry[] {
    return [...this.entries.values()].filter(row => row.debtAccountId === accountId).map(row => structuredClone(row)).sort((a, b) => a.postingSequence - b.postingSequence);
  }
  saveEntry(entry: ExactDebtEntry): void {
    entry = { ...entry, signedAmountDzd: Money.parse(entry.signedAmountDzd, entry.currency).toWire(), balanceAfterDzd: Money.parse(entry.balanceAfterDzd, entry.currency).toWire() };
    const previous = this.entries.get(entry.id);
    assertExactEntryUpdate(previous ?? null, entry);
    if ([...this.entries.values()].some(row => row.id !== entry.id && row.debtAccountId === entry.debtAccountId && row.postingSequence === entry.postingSequence)) throw new Error("Duplicate debt posting sequence");
    if (this.accounts.get(entry.debtAccountId)?.currency !== entry.currency) throw new Error("Debt entry currency mismatch");
    Money.parse(entry.signedAmountDzd, entry.currency); Money.parse(entry.balanceAfterDzd, entry.currency);
    for (const id of [entry.targetEntryId, entry.correctionOfEntryId]) {
      if (id && this.entries.get(id)?.debtAccountId !== entry.debtAccountId) throw new Error("Debt attribution must reference the same account");
    }
    this.entries.set(entry.id, structuredClone(entry));
  }
  getCommand(id: string): ExactDebtCommand | null { return structuredClone(this.commands.get(id) ?? null); }
  saveCommand(command: ExactDebtCommand): void {
    if (this.commands.has(command.id)) throw new Error("Duplicate debt command");
    this.commands.set(command.id, structuredClone(command));
  }
}
