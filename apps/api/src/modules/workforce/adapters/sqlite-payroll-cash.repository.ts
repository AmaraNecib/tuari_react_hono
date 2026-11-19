import { z } from "zod";
import { Money, auditActorUserIdSchema, auditTransactionIdSchema, timestampSchema } from "@tuari/contracts";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { runSyncTransaction, type FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import { SqliteExactFinanceRepository } from "../../company/adapters/sqlite-exact-finance.repository";
import type { PayrollCashRecord, PayrollCashRepository, PayrollSettlementRecord } from "../payroll-cash.repository";
import { payrollAdvanceLink, payrollAllocationLink, payrollSettlementLink, payrollCashSchemaStatements } from "./payroll-cash-schema";

const LIMIT = 10000;
const id = z.string().trim().min(1).max(128);
const positive = z.string().max(96).superRefine((value, context) => {
  try { if (Money.parse(value).compare(Money.parse("0")) <= 0) throw new Error("not positive"); }
  catch { context.addIssue({ code: "custom", message: "Payroll amount must be positive bounded exact money" }); }
});
const common = { id, employeeId: id, currency: z.literal("DZD"), amount: positive, paymentDate: timestampSchema,
  actorUserId: auditActorUserIdSchema, actorLabel: z.string().max(1000).nullable(), transactionId: auditTransactionIdSchema, createdAt: timestampSchema };
const links = { debtAccountId: id, debtEntryId: id };
const allocation = z.object({ id, source: z.object({ kind: z.enum(["EARNING", "OPENING"]), id }).strict(), amount: positive, ...links, paymentEntryId: id }).strict();
const cashSchema = z.object({ ...common, wageAllocations: z.array(allocation).max(LIMIT), advance: z.object({ id, amount: positive, ...links }).strict().nullable() }).strict().superRefine((row, context) => {
  const amounts = [...row.wageAllocations.map(item => item.amount), ...(row.advance ? [row.advance.amount] : [])];
  try {
    const sum = amounts.reduce((total, value) => total + BigInt(Money.parse(value).toMinorUnits()), 0n);
    if (sum !== BigInt(Money.parse(row.amount).toMinorUnits())) context.addIssue({ code: "custom", message: "Payroll cash total does not match allocations and advance" });
  } catch { context.addIssue({ code: "custom", message: "Invalid payroll cash amounts" }); }
  if (new Set(row.wageAllocations.map(item => item.id)).size !== row.wageAllocations.length) context.addIssue({ code: "custom", message: "Duplicate payroll allocation identity" });
});
const settlementSchema = z.object({ ...common, source: z.object({ kind: z.enum(["ADVANCE", "OPENING_ADVANCE"]), id }).strict(), ...links, paymentEntryId: id }).strict();
const header = "id,employee_id AS employeeId,currency,payment_date AS paymentDate,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt";
const expected = {
  employee_salary_cash: { text: "id employee_id currency payment_date actor_user_id actor_label transaction_id created_at", integer: "amount_minor" },
  employee_salary_payment_allocation: { text: "cash_id id source_kind source_id debt_account_id debt_entry_id payment_entry_id", integer: "amount_minor ordinal" },
  employee_salary_advance: { text: "id cash_id debt_account_id debt_entry_id", integer: "amount_minor" },
  employee_salary_settlement: { text: "id employee_id currency payment_date source_kind source_id debt_account_id debt_entry_id payment_entry_id actor_user_id actor_label transaction_id created_at", integer: "amount_minor" },
} as const;
type Table = keyof typeof expected;
type CashHeader = Omit<PayrollCashRecord, "amount" | "wageAllocations" | "advance">;

export class SqlitePayrollCashRepository implements PayrollCashRepository {
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    this.withTransaction(() => {
      // Validate the real prepared ledger, not merely a marker or synthetic tables.
      new SqliteExactFinanceRepository(db, lock);
      if (db.pragma("foreign_keys", { simple: true }) !== 1) throw new TypeError("Payroll cash foreign keys must be enabled");
      // This isolated schema has one canonical version. Check definitions, not
      // just names, because writes rely on its keys, checks and trigger bodies.
      const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();
      for (const statement of payrollCashSchemaStatements) {
        const object = /^CREATE (TABLE|INDEX|TRIGGER) (\w+)/.exec(statement);
        if (!object) throw new TypeError("Unsupported payroll cash schema statement");
        const installed = db.prepare("SELECT sql FROM sqlite_master WHERE type=? AND name=?").get(object[1]!.toLowerCase(), object[2]!) as { sql: string | null } | undefined;
        if (!installed?.sql || normalize(installed.sql) !== normalize(statement)) throw new TypeError(`Incompatible prepared payroll cash schema: ${object[2]}`);
      }
      for (const [table, columns] of Object.entries(expected)) {
        const actual = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
        for (const [type, names] of [["TEXT", columns.text], ["INTEGER", columns.integer]] as const) {
          for (const name of names.split(" ")) {
            if (actual.find(column => column.name === name)?.type.toUpperCase() !== type) throw new TypeError(`Incompatible prepared payroll cash column ${table}.${name}`);
          }
        }
      }
    });
  }
  withTransaction<T>(work: () => T): T {
    if (work.constructor.name === "AsyncFunction") throw new TypeError("Payroll cash transaction callback must be synchronous");
    return runSyncTransaction(this.lock, this.db, () => {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Payroll cash transaction callback must be synchronous");
      return result;
    });
  }
  private amount(table: Table, predicate: string, ...ids: string[]): string {
    const value = prepareMoneyRead(this.db, `SELECT amount_minor AS minor_units FROM ${table} WHERE ${predicate}`).get(...ids);
    if (!value) throw new TypeError("Required payroll cash amount is missing");
    return value.toWire();
  }
  private checkLinks(table: Table, predicate: string, condition: string, value: string): void {
    if (this.db.prepare(`SELECT 1 FROM ${table} candidate WHERE ${condition} AND NOT ${predicate} LIMIT 1`).get(value)) throw new TypeError("Payroll cash source link mismatch");
  }
  private checkBudget(query: string, ...values: string[]): void {
    const count = this.db.prepare(`SELECT count(*) AS count FROM (${query} LIMIT ${LIMIT + 1})`).get(...values) as { count: number };
    if (count.count > LIMIT) throw new RangeError("Payroll cash materialization limit exceeded");
  }
  getCash(cashId: string): PayrollCashRecord | null {
    return this.withTransaction(() => {
      this.checkBudget("SELECT id FROM employee_salary_cash WHERE id=? UNION ALL SELECT id FROM employee_salary_payment_allocation WHERE cash_id=? UNION ALL SELECT id FROM employee_salary_advance WHERE cash_id=?", cashId, cashId, cashId);
      const row = this.db.prepare(`SELECT ${header} FROM employee_salary_cash WHERE id=?`).get(cashId) as CashHeader | undefined;
      if (!row) return null;
      this.checkLinks("employee_salary_payment_allocation", payrollAllocationLink, "candidate.cash_id=?", cashId);
      this.checkLinks("employee_salary_advance", payrollAdvanceLink, "candidate.cash_id=?", cashId);
      const rows = this.db.prepare("SELECT id,source_kind AS sourceKind,source_id AS sourceId,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId,payment_entry_id AS paymentEntryId FROM employee_salary_payment_allocation WHERE cash_id=? ORDER BY ordinal").all(cashId) as { id: string; sourceKind: "EARNING" | "OPENING"; sourceId: string; debtAccountId: string; debtEntryId: string; paymentEntryId: string }[];
      const wageAllocations = rows.map(({ sourceKind, sourceId, ...item }) => ({ ...item, source: { kind: sourceKind, id: sourceId }, amount: this.amount("employee_salary_payment_allocation", "cash_id=? AND id=?", cashId, item.id) }));
      const advance = this.db.prepare("SELECT id,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId FROM employee_salary_advance WHERE cash_id=?").get(cashId) as { id: string; debtAccountId: string; debtEntryId: string } | undefined;
      const result: PayrollCashRecord = { ...row, amount: this.amount("employee_salary_cash", "id=?", cashId), wageAllocations, advance: advance ? { ...advance, amount: this.amount("employee_salary_advance", "id=?", advance.id) } : null };
      cashSchema.parse(result);
      return result;
    });
  }
  getAdvance(advanceId: string): (PayrollCashRecord & { advance: NonNullable<PayrollCashRecord["advance"]> }) | null {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT cash_id AS cashId FROM employee_salary_advance WHERE id=?").get(advanceId) as { cashId: string } | undefined;
      if (!row) return null;
      const cash = this.getCash(row.cashId);
      if (!cash?.advance || cash.advance.id !== advanceId) throw new TypeError("Payroll advance source link mismatch");
      return { ...cash, advance: cash.advance };
    });
  }
  listCash(employeeId: string): PayrollCashRecord[] {
    return this.withTransaction(() => {
      this.checkBudget("SELECT id FROM employee_salary_cash WHERE employee_id=? UNION ALL SELECT a.id FROM employee_salary_payment_allocation a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=? UNION ALL SELECT a.id FROM employee_salary_advance a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=?", employeeId, employeeId, employeeId);
      return (this.db.prepare("SELECT id FROM employee_salary_cash WHERE employee_id=? ORDER BY created_at,id").all(employeeId) as { id: string }[]).map(row => this.getCash(row.id)!);
    });
  }
  saveCash(row: PayrollCashRecord): void {
    cashSchema.parse(row);
    // Include header and optional advance in the same budget used by reads.
    if (1 + row.wageAllocations.length + (row.advance ? 1 : 0) > LIMIT) throw new RangeError("Payroll cash materialization limit exceeded");
    this.withTransaction(() => {
      this.db.prepare("INSERT INTO employee_salary_cash(id,employee_id,currency,amount_minor,payment_date,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(row.id, row.employeeId, row.currency, bindMoney(Money.parse(row.amount)), row.paymentDate, row.actorUserId, row.actorLabel, row.transactionId, row.createdAt);
      const insert = this.db.prepare("INSERT INTO employee_salary_payment_allocation(cash_id,id,ordinal,source_kind,source_id,amount_minor,debt_account_id,debt_entry_id,payment_entry_id) VALUES (?,?,?,?,?,?,?,?,?)");
      row.wageAllocations.forEach((item, ordinal) => insert.run(row.id, item.id, ordinal, item.source.kind, item.source.id, bindMoney(Money.parse(item.amount)), item.debtAccountId, item.debtEntryId, item.paymentEntryId));
      if (row.advance) this.db.prepare("INSERT INTO employee_salary_advance(id,cash_id,amount_minor,debt_account_id,debt_entry_id) VALUES (?,?,?,?,?)").run(row.advance.id, row.id, bindMoney(Money.parse(row.advance.amount)), row.advance.debtAccountId, row.advance.debtEntryId);
    });
  }
  getSettlement(settlementId: string): PayrollSettlementRecord | null {
    return this.withTransaction(() => {
      const row = this.db.prepare(`SELECT ${header},source_kind AS sourceKind,source_id AS sourceId,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId,payment_entry_id AS paymentEntryId FROM employee_salary_settlement WHERE id=?`).get(settlementId) as (Omit<PayrollSettlementRecord, "amount" | "source"> & { sourceKind: "ADVANCE" | "OPENING_ADVANCE"; sourceId: string }) | undefined;
      if (!row) return null;
      this.checkLinks("employee_salary_settlement", payrollSettlementLink, "candidate.id=?", settlementId);
      const { sourceKind, sourceId, ...metadata } = row;
      const result: PayrollSettlementRecord = { ...metadata, source: { kind: sourceKind, id: sourceId }, amount: this.amount("employee_salary_settlement", "id=?", settlementId) };
      settlementSchema.parse(result);
      return result;
    });
  }
  listSettlements(employeeId: string): PayrollSettlementRecord[] {
    return this.withTransaction(() => {
      this.checkBudget("SELECT id FROM employee_salary_settlement WHERE employee_id=?", employeeId);
      return (this.db.prepare("SELECT id FROM employee_salary_settlement WHERE employee_id=? ORDER BY created_at,id").all(employeeId) as { id: string }[]).map(row => this.getSettlement(row.id)!);
    });
  }
  saveSettlement(row: PayrollSettlementRecord): void {
    settlementSchema.parse(row);
    this.withTransaction(() => {
      this.db.prepare("INSERT INTO employee_salary_settlement(id,employee_id,currency,source_kind,source_id,amount_minor,payment_date,debt_account_id,debt_entry_id,payment_entry_id,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(row.id, row.employeeId, row.currency, row.source.kind, row.source.id, bindMoney(Money.parse(row.amount)), row.paymentDate, row.debtAccountId, row.debtEntryId, row.paymentEntryId, row.actorUserId, row.actorLabel, row.transactionId, row.createdAt);
    });
  }
}
