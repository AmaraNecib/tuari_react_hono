import { Money } from "@tuari/contracts";
import { assertExactEntryUpdate } from "../exact-finance.repository";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { ExactDebtAccount, ExactDebtCommand, ExactDebtEntry, ExactFinanceRepository } from "../exact-finance.repository";

const accountFields = {
  id: "id", partyType: "party_type", workerId: "worker_id", externalCounterpartyId: "external_counterparty_id", direction: "direction", currency: "currency", status: "status", note: "note", settledAt: "settled_at", actorUserId: "actor_user_id", actorLabel: "actor_label", transactionId: "transaction_id", createdAt: "created_at", updatedAt: "updated_at",
} as const;
const entryFields = {
  id: "id", debtAccountId: "debt_account_id", postingSequence: "posting_sequence", invoiceId: "invoice_id", producerType: "producer_type", producerId: "producer_id", targetEntryId: "target_entry_id", correctionOfEntryId: "correction_of_entry_id", currency: "currency", entryType: "entry_type", entryDate: "entry_date", note: "note", reasonCategory: "reason_category", reasonDetail: "reason_detail", paymentMethod: "payment_method", status: "status", voidedAt: "voided_at", voidedBy: "voided_by", voidReason: "void_reason", actorUserId: "actor_user_id", actorLabel: "actor_label", transactionId: "transaction_id", createdAt: "created_at", updatedAt: "updated_at",
} as const;
const projection = (fields: Record<string, string>) => Object.entries(fields).map(([property, column]) => `"${column}" AS "${property}"`).join(",");

/** Exact adapter is never selected by production dependencies. */
export class SqliteExactFinanceRepository implements ExactFinanceRepository {
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    requireExactMoneySchema(db, "debt");
    for (const [table, required] of [
      ["debt_account", { ...Object.fromEntries(Object.values(accountFields).map(name => [name, "TEXT"])), current_balance_minor: "INTEGER" }],
      ["debt_entry", { ...Object.fromEntries(Object.values(entryFields).map(name => [name, name === "posting_sequence" ? "INTEGER" : "TEXT"])), signed_amount_minor: "INTEGER", balance_after_minor: "INTEGER" }],
      ["debt_command", { id: "TEXT", fingerprint: "TEXT", result_json: "TEXT" }],
      ["exact_finance_command", { id: "TEXT", fingerprint: "TEXT", result_json: "TEXT" }],
    ] as const) {
      const columns = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
      for (const [name, type] of Object.entries(required)) {
        const actual = columns.find(column => column.name === name)?.type.toUpperCase();
        // Legacy metadata timestamps use DATETIME, still returned as strings.
        if (actual !== type && !(type === "TEXT" && actual === "DATETIME")) throw new Error(`Invalid exact ledger column ${table}.${name}`);
      }
      if (columns.some(column => ["current_balance", "signed_amount", "balance_after"].includes(column.name))) throw new Error("Legacy monetary columns cannot coexist with exact ledger storage");
    }
  }

  withTransaction<T>(work: () => T): T {
    return this.lock.runSync(() => this.db.transaction(work).immediate());
  }

  private money(table: "debt_account" | "debt_entry", column: string, id: string, currency: unknown): string {
    if (currency !== "DZD") throw new TypeError("Debt currency mismatch");
    const value = prepareMoneyRead(this.db, `SELECT "${column}" AS minor_units FROM "${table}" WHERE id=?`).get(id);
    if (!value) throw new Error("Required exact ledger amount is missing");
    return value.toWire();
  }

  partyExists(partyType: ExactDebtAccount["partyType"], id: string): boolean {
    const table = partyType === "INTERNAL_WORKER" ? "employee" : "external_counterparty";
    return this.lock.runSync(() => Boolean(this.db.prepare(`SELECT id FROM "${table}" WHERE id=?`).get(id)));
  }

  getAccount(id: string): ExactDebtAccount | null {
    return this.withTransaction(() => {
      const metadata = this.db.prepare(`SELECT ${projection(accountFields)} FROM debt_account WHERE id=?`).get(id) as Omit<ExactDebtAccount, "currentBalance"> | undefined;
      return metadata ? { ...metadata, currentBalance: this.money("debt_account", "current_balance_minor", id, metadata.currency) } : null;
    });
  }

  listAccounts(): ExactDebtAccount[] {
    return this.withTransaction(() => (this.db.prepare("SELECT id FROM debt_account ORDER BY current_balance_minor,id").all() as { id: string }[]).map(row => this.getAccount(row.id)!));
  }

  saveAccount(account: ExactDebtAccount): void {
    this.withTransaction(() => {
      if (!this.partyExists(account.partyType, account.workerId ?? account.externalCounterpartyId ?? "")) throw new Error("Debt party not found");
      const amount = Money.parse(account.currentBalance, account.currency);
      const fields = Object.entries(accountFields);
      const columns = [...fields.map(([, name]) => name), "current_balance_minor"];
      const values = [...fields.map(([property]) => account[property as keyof typeof accountFields]), bindMoney(amount)];
      this.upsert("debt_account", columns, values);
    });
  }

  getEntry(id: string): ExactDebtEntry | null {
    return this.withTransaction(() => {
      const metadata = this.db.prepare(`SELECT ${projection(entryFields)} FROM debt_entry WHERE id=?`).get(id) as Omit<ExactDebtEntry, "signedAmountDzd" | "balanceAfterDzd"> | undefined;
      return metadata ? { ...metadata,
        signedAmountDzd: this.money("debt_entry", "signed_amount_minor", id, metadata.currency),
        balanceAfterDzd: this.money("debt_entry", "balance_after_minor", id, metadata.currency),
      } : null;
    });
  }

  listEntries(accountId: string): ExactDebtEntry[] {
    return this.withTransaction(() => (this.db.prepare("SELECT id FROM debt_entry WHERE debt_account_id=? ORDER BY posting_sequence").all(accountId) as { id: string }[]).map(row => this.getEntry(row.id)!));
  }

  saveEntry(entry: ExactDebtEntry): void {
    this.withTransaction(() => {
      assertExactEntryUpdate(this.getEntry(entry.id), entry);
      const account = this.getAccount(entry.debtAccountId);
      if (!account || account.currency !== entry.currency) throw new Error("Debt entry currency mismatch");
      for (const targetId of [entry.targetEntryId, entry.correctionOfEntryId]) {
        if (targetId && this.getEntry(targetId)?.debtAccountId !== account.id) throw new Error("Debt attribution must reference the same account");
      }
      const fields = Object.entries(entryFields);
      const columns = [...fields.map(([, name]) => name), "signed_amount_minor", "balance_after_minor"];
      const values = [...fields.map(([property]) => entry[property as keyof typeof entryFields]), bindMoney(Money.parse(entry.signedAmountDzd, entry.currency)), bindMoney(Money.parse(entry.balanceAfterDzd, entry.currency))];
      this.upsert("debt_entry", columns, values);
    });
  }

  getAggregateCommand(id: string): ExactDebtCommand | null {
    return this.lock.runSync(() => this.db.prepare("SELECT id,fingerprint,result_json AS resultJson FROM exact_finance_command WHERE id=?").get(id) as ExactDebtCommand | undefined ?? null);
  }
  saveAggregateCommand(command: ExactDebtCommand): void {
    this.withTransaction(() => { this.db.prepare("INSERT INTO exact_finance_command(id,fingerprint,result_json) VALUES (?,?,?)").run(command.id, command.fingerprint, command.resultJson); });
  }
  getCommand(id: string): ExactDebtCommand | null {
    return this.lock.runSync(() => this.db.prepare("SELECT id,fingerprint,result_json AS resultJson FROM debt_command WHERE id=?").get(id) as ExactDebtCommand | undefined ?? null);
  }

  saveCommand(command: ExactDebtCommand): void {
    this.withTransaction(() => {
      this.db.prepare("INSERT INTO debt_command(id,fingerprint,result_json) VALUES (?,?,?)").run(command.id, command.fingerprint, command.resultJson);
    });
  }

  private upsert(table: string, columns: string[], values: unknown[]): void {
    this.db.prepare(`INSERT INTO "${table}" (${columns.map(name => `"${name}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(name => name !== "id").map(name => `"${name}"=excluded."${name}"`).join(",")}`).run(...values);
  }
}
