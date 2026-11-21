import type { ExactDebtAccount, ExactDebtEntry, ExactFinanceRepository } from "../company/exact-finance.repository";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import type { FifoLock } from "../../infrastructure/database/fifo-lock";

export type DebtReportSnapshot = { accounts: { account: ExactDebtAccount; entries: ExactDebtEntry[]; partyName: string }[] };
/** A whole report owns one connection snapshot, including names and budget checks. */
export class SqliteExactDebtReportSnapshot {
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock, private readonly finance: ExactFinanceRepository) {
    const identity = finance.transactionIdentity;
    if (identity.connection !== db || identity.lock !== lock) throw new Error("Debt report requires the same connection and shared FIFO");
  }
  read<T>(project: (snapshot: DebtReportSnapshot) => T): T {
    return this.lock.runSync(() => this.db.transaction(() => {
      // Check all rows, including void history, before any ledger hydration.
      for (const table of ["debt_account", "debt_entry"]) {
        const row = this.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
        if (row.count > 10000) throw new Error("Debt report resource limit exceeded");
      }
      const accounts = this.finance.listAccounts().map(account => {
        const name = account.workerId
          ? this.db.prepare("SELECT first_name || ' ' || last_name AS name FROM employee WHERE id=?").get(account.workerId)
          : this.db.prepare("SELECT full_name AS name FROM external_counterparty WHERE id=?").get(account.externalCounterpartyId);
        return { account, entries: this.finance.listEntries(account.id), partyName: (name as { name: string } | undefined)?.name ?? account.id };
      });
      return project({ accounts });
    }).deferred());
  }
}
