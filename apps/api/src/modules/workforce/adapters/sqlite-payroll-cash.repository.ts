import { Money } from "@tuari/contracts";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { runSyncTransaction, type FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { PayrollCashRecord, PayrollCashRepository } from "../payroll-cash.repository";

const LIMIT = 10000;
const required = (value: unknown, label: string): asserts value is string => {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new TypeError(`Invalid payroll cash ${label}`);
};
function validate(row: PayrollCashRecord): void {
  required(row.id, "id"); required(row.employeeId, "employee id"); required(row.actorUserId, "actor"); required(row.transactionId, "transaction id");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(row.paymentDate) ? new Date(`${row.paymentDate}T00:00:00.000Z`) : null;
  if (row.currency !== "DZD" || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.paymentDate) throw new TypeError("Invalid payroll cash currency or date");
  if (typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) throw new TypeError("Invalid payroll cash audit timestamp");
  const amount = Money.parse(row.amount);
  if (amount.toMinorUnits() === "0") throw new TypeError("Payroll cash amount must be positive");
  if (row.wageAllocations.length > LIMIT) throw new TypeError("Payroll cash allocation limit exceeded");
  const ids = new Set<string>(); let total = 0n;
  for (const allocation of row.wageAllocations) {
    required(allocation.id, "allocation id"); required(allocation.source.id, "source id"); required(allocation.debtAccountId, "debt account id"); required(allocation.debtEntryId, "debt entry id"); required(allocation.paymentEntryId, "payment entry id");
    if (allocation.source.kind !== "EARNING" && allocation.source.kind !== "OPENING") throw new TypeError("Invalid payroll cash source kind");
    if (ids.has(allocation.id)) throw new TypeError("Duplicate payroll cash allocation identity"); ids.add(allocation.id);
    const value = Money.parse(allocation.amount); if (value.toMinorUnits() === "0") throw new TypeError("Payroll cash allocation must be positive"); total += BigInt(value.toMinorUnits());
  }
  if (row.advance) {
    required(row.advance.id, "advance id"); required(row.advance.debtAccountId, "advance debt account id"); required(row.advance.debtEntryId, "advance debt entry id");
    const value = Money.parse(row.advance.amount); if (value.toMinorUnits() === "0") throw new TypeError("Payroll cash advance must be positive"); total += BigInt(value.toMinorUnits());
  }
  if (total !== BigInt(amount.toMinorUnits())) throw new TypeError("Payroll cash total does not match allocations and advance");
}

type Header = Omit<PayrollCashRecord, "amount" | "wageAllocations" | "advance">;
export class SqlitePayrollCashRepository implements PayrollCashRepository {
  readonly transactionIdentity: { readonly connection: object; readonly lock: object };
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    this.transactionIdentity = { connection: db, lock };
    for (const table of ["employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance"]) {
      const found = db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table) as { type: string } | undefined;
      if (found?.type !== "table") throw new TypeError(`Prepared payroll cash table required: ${table}`);
    }
  }
  withTransaction<T>(work: () => T): T { return runSyncTransaction(this.lock, this.db, work); }
  private readAmount(table: string, column: string, idColumn: string, id: string): string {
    const result = prepareMoneyRead(this.db, `SELECT ${column} AS minor_units FROM ${table} WHERE ${idColumn}=?`).get(id);
    if (!result) throw new TypeError("Required payroll cash amount is missing"); return result.toWire();
  }
  getCash(id: string): PayrollCashRecord | null {
    return this.withTransaction(() => {
      const header = this.db.prepare("SELECT id,employee_id AS employeeId,currency,payment_date AS paymentDate,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt FROM employee_salary_cash WHERE id=?").get(id) as Header | undefined;
      if (!header) return null;
      this.enforceBudget("WHERE cash_id=?", id);
      const rows = this.db.prepare("SELECT id,source_kind AS sourceKind,source_id AS sourceId,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId,payment_entry_id AS paymentEntryId FROM employee_salary_payment_allocation WHERE cash_id=? ORDER BY ordinal").all(id) as { id: string; sourceKind: "EARNING" | "OPENING"; sourceId: string; debtAccountId: string; debtEntryId: string; paymentEntryId: string }[];
      const wageAllocations = rows.map(row => ({ id: row.id, source: { kind: row.sourceKind, id: row.sourceId }, amount: this.readAmount("employee_salary_payment_allocation", "amount_minor", "id", row.id), debtAccountId: row.debtAccountId, debtEntryId: row.debtEntryId, paymentEntryId: row.paymentEntryId }));
      const advanceRow = this.db.prepare("SELECT id,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId FROM employee_salary_advance WHERE cash_id=?").get(id) as { id: string; debtAccountId: string; debtEntryId: string } | undefined;
      const result: PayrollCashRecord = { ...header, amount: this.readAmount("employee_salary_cash", "amount_minor", "id", id), wageAllocations, advance: advanceRow ? { ...advanceRow, amount: this.readAmount("employee_salary_advance", "amount_minor", "id", advanceRow.id) } : null };
      validate(result); return result;
    });
  }
  private enforceBudget(where: string, ...params: string[]): void {
    const count = this.db.prepare(`SELECT count(*) AS count FROM (SELECT 1 FROM employee_salary_payment_allocation ${where} UNION ALL SELECT 1 FROM employee_salary_advance WHERE cash_id=? LIMIT ${LIMIT + 1})`).get(...params, ...params) as { count: number };
    if (count.count > LIMIT) throw new RangeError("Payroll cash materialization limit exceeded");
  }
  listCash(employeeId: string): PayrollCashRecord[] {
    return this.withTransaction(() => {
      const count = this.db.prepare(`SELECT count(*) AS count FROM (SELECT id FROM employee_salary_cash WHERE employee_id=? UNION ALL SELECT a.id FROM employee_salary_payment_allocation a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=? UNION ALL SELECT a.id FROM employee_salary_advance a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=? LIMIT ${LIMIT + 1})`).get(employeeId, employeeId, employeeId) as { count: number };
      if (count.count > LIMIT) throw new RangeError("Payroll cash materialization limit exceeded");
      return (this.db.prepare("SELECT id FROM employee_salary_cash WHERE employee_id=? ORDER BY created_at,id").all(employeeId) as { id: string }[]).map(({ id }) => this.getCash(id)!);
    });
  }
  saveCash(row: PayrollCashRecord): void {
    validate(row);
    this.withTransaction(() => {
      this.db.prepare("INSERT INTO employee_salary_cash(id,employee_id,currency,amount_minor,payment_date,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(row.id,row.employeeId,row.currency,bindMoney(Money.parse(row.amount)),row.paymentDate,row.actorUserId,row.actorLabel,row.transactionId,row.createdAt);
      const insert = this.db.prepare("INSERT INTO employee_salary_payment_allocation(cash_id,id,ordinal,source_kind,source_id,amount_minor,debt_account_id,debt_entry_id,payment_entry_id) VALUES (?,?,?,?,?,?,?,?,?)");
      row.wageAllocations.forEach((item, ordinal) => insert.run(row.id,item.id,ordinal,item.source.kind,item.source.id,bindMoney(Money.parse(item.amount)),item.debtAccountId,item.debtEntryId,item.paymentEntryId));
      if (row.advance) this.db.prepare("INSERT INTO employee_salary_advance(id,cash_id,amount_minor,debt_account_id,debt_entry_id) VALUES (?,?,?,?,?)").run(row.advance.id,row.id,bindMoney(Money.parse(row.advance.amount)),row.advance.debtAccountId,row.advance.debtEntryId);
    });
  }
}
