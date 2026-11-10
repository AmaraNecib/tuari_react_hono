import type { ExactDebtAccount, ExactDebtEntry } from "@tuari/contracts";
export type { ExactDebtAccount, ExactDebtEntry };

/** Opt-in records use exact wire amounts and the existing ledger identities. */
export function assertExactEntryUpdate(previous: ExactDebtEntry | null, entry: ExactDebtEntry): void {
  if (!Number.isSafeInteger(entry.postingSequence) || entry.postingSequence < 1 || entry.postingSequence > 100000) throw new Error("Invalid debt posting sequence");
  const immutable = (row: ExactDebtEntry) => JSON.stringify([row.debtAccountId, row.currency, row.postingSequence, row.signedAmountDzd, row.targetEntryId, row.correctionOfEntryId, row.entryType, row.invoiceId, row.entryDate]);
  if (previous && immutable(previous) !== immutable(entry)) throw new Error("Debt posting is immutable");
  if (previous?.status === "VOIDED" && entry.status !== "VOIDED") throw new Error("Voided debt posting cannot be restored");
}

export type ExactDebtCommand = {
  id: string;
  fingerprint: string;
  resultJson: string;
};

/** All reads used to decide writes run inside the immediate transaction callback. */
export interface ExactFinanceRepository {
  withTransaction<T>(work: () => T): T;
  partyExists(partyType: ExactDebtAccount["partyType"], id: string): boolean;
  getAccount(id: string): ExactDebtAccount | null;
  listAccounts(): ExactDebtAccount[];
  saveAccount(account: ExactDebtAccount): void;
  getEntry(id: string): ExactDebtEntry | null;
  listEntries(accountId: string): ExactDebtEntry[];
  saveEntry(entry: ExactDebtEntry): void;
  getCommand(id: string): ExactDebtCommand | null;
  saveCommand(command: ExactDebtCommand): void;
}
