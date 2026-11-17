import { Money, exactSalaryCashInputSchema, exactSalaryOpeningReviewInputSchema, exactSalaryAdvanceRepaymentInputSchema, auditActorUserIdSchema, auditTransactionIdSchema, timestampSchema } from "@tuari/contracts";
import { bindMoney, prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { PayrollCash, PayrollCashRepository, PayrollCorrection, PayrollOpeningReview, PayrollSettlement } from "../payroll-cash.repository";
import { ExactDebtError } from "../exact-finance.service";

const projection = "id,employee_id AS employeeId,currency,payment_date AS paymentDate,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt";
type Header = Omit<PayrollCash, "amount" | "wageAllocations" | "advance">;
type Allocation = Omit<PayrollCash["wageAllocations"][number], "source" | "amount"> & { sourceKind: "EARNING" | "OPENING"; sourceId: string };
type Advance = Omit<NonNullable<PayrollCash["advance"]>, "amount">;

export class SqlitePayrollCashRepository implements PayrollCashRepository {
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    this.withTransaction(() => {
      requireExactMoneySchema(db, "workforce");
      for (const [table, names, amounts] of [
        ["employee_salary_correction", ["id", "employee_id", "earning_id", "currency", "reason", "correction_entry_id", "actor_user_id", "actor_label", "transaction_id", "created_at"], ["previous_amount_minor", "new_amount_minor"]],
        ["employee_salary_settlement", ["id", "employee_id", "currency", "source_kind", "source_id", "payment_date", "debt_account_id", "debt_entry_id", "payment_entry_id", "actor_user_id", "actor_label", "transaction_id", "created_at"], ["amount_minor"]],
        ["employee_salary_opening_review", ["id", "employee_id", "currency", "status", "wage_debt_account_id", "wage_debt_entry_id", "advance_debt_account_id", "advance_debt_entry_id", "actor_user_id", "actor_label", "transaction_id", "created_at"], ["wages_owed_minor", "advances_owed_minor"]],
        ["employee_salary_cash", ["id", "employee_id", "currency", "payment_date", "actor_user_id", "actor_label", "transaction_id", "created_at"], ["amount_minor"]],
        ["employee_salary_payment_allocation", ["cash_id", "id", "source_kind", "source_id", "debt_account_id", "debt_entry_id", "payment_entry_id"], ["amount_minor", "ordinal"]],
        ["employee_salary_advance", ["id", "cash_id", "debt_account_id", "debt_entry_id"], ["amount_minor"]],
      ] as const) {
        const source = db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table) as { type: string } | undefined;
        if (source?.type !== "table") throw new TypeError(`Exact payroll cash table required: ${table}`);
        const columns = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
        for (const [type, required] of [["TEXT", names], ["INTEGER", amounts]] as const) for (const name of required) {
          if (columns.find(column => column.name === name)?.type.toUpperCase() !== type) throw new TypeError(`Invalid exact payroll cash column ${table}.${name}`);
        }
      }
    });
  }
  withTransaction<T>(work: () => T): T {
    if (work.constructor.name === "AsyncFunction") throw new TypeError("Payroll cash transaction must be synchronous");
    return this.lock.runSync(() => this.db.transaction(() => {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Payroll cash transaction must be synchronous");
      return result;
    }).immediate());
  }
  private amount(table: "employee_salary_cash" | "employee_salary_payment_allocation" | "employee_salary_advance" | "employee_salary_settlement", predicate: string, ...ids: string[]) {
    const amount = prepareMoneyRead(this.db, `SELECT amount_minor AS minor_units FROM ${table} WHERE ${predicate}`).get(...ids);
    if (!amount) throw new TypeError("Required payroll cash amount is missing");
    return amount.toWire();
  }
  getCash(id: string): PayrollCash | null {
    return this.withTransaction(() => {
      const header = this.db.prepare(`SELECT ${projection} FROM employee_salary_cash WHERE id=?`).get(id) as Header | undefined;
      if (!header) return null;
      const count = this.db.prepare("SELECT count(*) AS count FROM (SELECT id FROM employee_salary_payment_allocation WHERE cash_id=? LIMIT 10001)").get(id) as { count: number };
      if (count.count > 10000) throw new ExactDebtError("Payroll cash read resource limit exceeded");
      const rows = this.db.prepare("SELECT id,source_kind AS sourceKind,source_id AS sourceId,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId,payment_entry_id AS paymentEntryId FROM employee_salary_payment_allocation WHERE cash_id=? ORDER BY ordinal").all(id) as Allocation[];
      const wageAllocations = rows.map(({ sourceKind, sourceId, ...row }) => ({ ...row, source: { kind: sourceKind, id: sourceId }, amount: this.amount("employee_salary_payment_allocation", "cash_id=? AND id=?", id, row.id) }));
      const advanceRow = this.db.prepare("SELECT id,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId FROM employee_salary_advance WHERE cash_id=?").get(id) as Advance | undefined;
      const advance = advanceRow ? { ...advanceRow, amount: this.amount("employee_salary_advance", "id=?", advanceRow.id) } : null;
      const amount = this.amount("employee_salary_cash", "id=?", id);
      exactSalaryCashInputSchema.parse({ requestId: id, employeeId: header.employeeId, currency: header.currency, amount, paymentDate: header.paymentDate, wageAllocations: wageAllocations.map(({ id: allocationId, source, amount: allocated }) => ({ id: allocationId, source, amount: allocated })), advance: advance ? { id: advance.id, amount: advance.amount } : null });
      auditActorUserIdSchema.parse(header.actorUserId); auditTransactionIdSchema.parse(header.transactionId); timestampSchema.parse(header.createdAt);
      return { ...header, amount, wageAllocations, advance };
    });
  }
  listCash(employeeId: string): PayrollCash[] {
    return this.withTransaction(() => {
      const count = this.db.prepare(`SELECT count(*) AS count FROM (
        SELECT id FROM employee_salary_cash WHERE employee_id=?
        UNION ALL SELECT a.id FROM employee_salary_payment_allocation a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=?
        UNION ALL SELECT a.id FROM employee_salary_advance a JOIN employee_salary_cash c ON c.id=a.cash_id WHERE c.employee_id=? LIMIT 10001)`).get(employeeId, employeeId, employeeId) as { count: number };
      if (count.count > 10000) throw new ExactDebtError("Payroll cash read resource limit exceeded");
      return (this.db.prepare("SELECT id FROM employee_salary_cash WHERE employee_id=? ORDER BY created_at,id").all(employeeId) as { id: string }[]).map(row => this.getCash(row.id)!);
    });
  }
  getAdvance(id: string) {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT cash_id AS cashId FROM employee_salary_advance WHERE id=?").get(id) as { cashId: string } | undefined;
      const cash = row ? this.getCash(row.cashId) : null;
      return cash?.advance ? { ...cash.advance, employeeId: cash.employeeId, currency: cash.currency } : null;
    });
  }
  getSettlement(id: string): PayrollSettlement | null {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT id,employee_id AS employeeId,currency,source_kind AS sourceKind,source_id AS sourceId,payment_date AS paymentDate,debt_account_id AS debtAccountId,debt_entry_id AS debtEntryId,payment_entry_id AS paymentEntryId,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt FROM employee_salary_settlement WHERE id=?").get(id) as (Omit<PayrollSettlement, "source" | "amount"> & { sourceKind: PayrollSettlement["source"]["kind"]; sourceId: string }) | undefined;
      if (!row) return null;
      const { sourceKind, sourceId, ...metadata } = row;
      const amount = this.amount("employee_salary_settlement", "id=?", id);
      const parsed = exactSalaryAdvanceRepaymentInputSchema.parse({ requestId: id, employeeId: row.employeeId, currency: row.currency, amount, paymentDate: row.paymentDate, source: { kind: sourceKind, id: sourceId } });
      auditActorUserIdSchema.parse(row.actorUserId); auditTransactionIdSchema.parse(row.transactionId); timestampSchema.parse(row.createdAt);
      return { ...metadata, amount: parsed.amount, source: parsed.source };
    });
  }
  listSettlements(employeeId: string): PayrollSettlement[] {
    return this.withTransaction(() => {
      const rows = this.db.prepare("SELECT id FROM employee_salary_settlement WHERE employee_id=? ORDER BY created_at,id LIMIT 10001").all(employeeId) as { id: string }[];
      if (rows.length > 10000) throw new ExactDebtError("Payroll settlement read resource limit exceeded");
      return rows.map(row => this.getSettlement(row.id)!);
    });
  }
  listCorrections(employeeId: string): PayrollCorrection[] {
    return this.withTransaction(() => {
      const rows = this.db.prepare("SELECT id,employee_id AS employeeId,earning_id AS earningId,currency,reason,correction_entry_id AS correctionEntryId,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt FROM employee_salary_correction WHERE employee_id=? ORDER BY created_at,id LIMIT 10001").all(employeeId) as Omit<PayrollCorrection, "previousAmount" | "newAmount">[];
      if (rows.length > 10000) throw new ExactDebtError("Payroll correction read resource limit exceeded");
      const readAmount = (column: "previous_amount_minor" | "new_amount_minor", id: string) => {
        const amount = prepareMoneyRead(this.db, `SELECT ${column} AS minor_units FROM employee_salary_correction WHERE id=?`).get(id);
        if (!amount) throw new TypeError("Required payroll correction amount is missing");
        return amount.toWire();
      };
      return rows.map(row => ({ ...row, previousAmount: readAmount("previous_amount_minor", row.id), newAmount: readAmount("new_amount_minor", row.id) }));
    });
  }
  saveCorrection(row: PayrollCorrection): void {
    this.withTransaction(() => {
      auditActorUserIdSchema.parse(row.actorUserId); auditTransactionIdSchema.parse(row.transactionId); timestampSchema.parse(row.createdAt);
      const previous = Money.parse(row.previousAmount); const next = Money.parse(row.newAmount);
      if (previous.compare(Money.parse("0")) <= 0 || next.compare(Money.parse("0")) <= 0 || !row.reason.trim() || row.reason.length > 1000) throw new TypeError("Invalid payroll correction source");
      this.db.prepare("INSERT INTO employee_salary_correction(id,employee_id,earning_id,currency,previous_amount_minor,new_amount_minor,reason,correction_entry_id,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(row.id,row.employeeId,row.earningId,row.currency,bindMoney(previous),bindMoney(next),row.reason,row.correctionEntryId,row.actorUserId,row.actorLabel,row.transactionId,row.createdAt);
    });
  }
  saveSettlement(row: PayrollSettlement): void {
    this.withTransaction(() => {
      auditActorUserIdSchema.parse(row.actorUserId); auditTransactionIdSchema.parse(row.transactionId); timestampSchema.parse(row.createdAt);
      const parsed = exactSalaryAdvanceRepaymentInputSchema.parse({ requestId: row.id, employeeId: row.employeeId, currency: row.currency, source: row.source, amount: row.amount, paymentDate: row.paymentDate });
      this.db.prepare("INSERT INTO employee_salary_settlement(id,employee_id,currency,source_kind,source_id,amount_minor,payment_date,debt_account_id,debt_entry_id,payment_entry_id,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(row.id, row.employeeId, row.currency, row.source.kind, row.source.id, bindMoney(Money.parse(parsed.amount)), parsed.paymentDate, row.debtAccountId, row.debtEntryId, row.paymentEntryId, row.actorUserId, row.actorLabel, row.transactionId, row.createdAt);
    });
  }
  getOpening(id: string): PayrollOpeningReview | null {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT id,employee_id AS employeeId,currency,status,wage_debt_account_id AS wageDebtAccountId,wage_debt_entry_id AS wageDebtEntryId,advance_debt_account_id AS advanceDebtAccountId,advance_debt_entry_id AS advanceDebtEntryId,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt FROM employee_salary_opening_review WHERE id=?").get(id) as Omit<PayrollOpeningReview, "wagesOwed" | "advancesOwed"> | undefined;
      if (!row) return null;
      const read = (column: "wages_owed_minor" | "advances_owed_minor") => {
        const amount = prepareMoneyRead(this.db, `SELECT ${column} AS minor_units FROM employee_salary_opening_review WHERE id=?`).get(id);
        if (!amount) throw new TypeError("Required opening amount is missing");
        return amount.toWire();
      };
      const result = { ...row, wagesOwed: row.status === "REVIEWED" ? read("wages_owed_minor") : null, advancesOwed: row.status === "REVIEWED" ? read("advances_owed_minor") : null };
      exactSalaryOpeningReviewInputSchema.parse({ requestId: row.id, employeeId: row.employeeId, currency: row.currency, review: row.status === "REVIEWED" ? { status: row.status, wagesOwed: result.wagesOwed, advancesOwed: result.advancesOwed } : { status: row.status } });
      auditActorUserIdSchema.parse(row.actorUserId); auditTransactionIdSchema.parse(row.transactionId); timestampSchema.parse(row.createdAt);
      return result;
    });
  }
  getEmployeeOpening(employeeId: string): PayrollOpeningReview | null {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT id FROM employee_salary_opening_review WHERE employee_id=? ORDER BY CASE status WHEN 'REVIEWED' THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 1").get(employeeId) as { id: string } | undefined;
      return row ? this.getOpening(row.id) : null;
    });
  }
  saveOpening(row: PayrollOpeningReview): void {
    this.withTransaction(() => {
      auditActorUserIdSchema.parse(row.actorUserId); auditTransactionIdSchema.parse(row.transactionId); timestampSchema.parse(row.createdAt);
      exactSalaryOpeningReviewInputSchema.parse({ requestId: row.id, employeeId: row.employeeId, currency: row.currency, review: row.status === "REVIEWED" ? { status: row.status, wagesOwed: row.wagesOwed, advancesOwed: row.advancesOwed } : { status: row.status } });
      this.db.prepare("INSERT INTO employee_salary_opening_review(id,employee_id,currency,status,wages_owed_minor,advances_owed_minor,wage_debt_account_id,wage_debt_entry_id,advance_debt_account_id,advance_debt_entry_id,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(row.id, row.employeeId, row.currency, row.status, row.wagesOwed === null ? null : bindMoney(Money.parse(row.wagesOwed)), row.advancesOwed === null ? null : bindMoney(Money.parse(row.advancesOwed)), row.wageDebtAccountId, row.wageDebtEntryId, row.advanceDebtAccountId, row.advanceDebtEntryId, row.actorUserId, row.actorLabel, row.transactionId, row.createdAt);
    });
  }
  saveCash(cash: PayrollCash): void {
    this.withTransaction(() => {
      auditActorUserIdSchema.parse(cash.actorUserId); auditTransactionIdSchema.parse(cash.transactionId); timestampSchema.parse(cash.createdAt);
      exactSalaryCashInputSchema.parse({ requestId: cash.id, employeeId: cash.employeeId, currency: cash.currency, amount: cash.amount, paymentDate: cash.paymentDate, wageAllocations: cash.wageAllocations.map(({ id, source, amount }) => ({ id, source, amount })), advance: cash.advance ? { id: cash.advance.id, amount: cash.advance.amount } : null });
      this.db.prepare("INSERT INTO employee_salary_cash(id,employee_id,currency,amount_minor,payment_date,actor_user_id,actor_label,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(cash.id, cash.employeeId, cash.currency, bindMoney(Money.parse(cash.amount)), cash.paymentDate, cash.actorUserId, cash.actorLabel, cash.transactionId, cash.createdAt);
      const insert = this.db.prepare("INSERT INTO employee_salary_payment_allocation(cash_id,id,ordinal,source_kind,source_id,amount_minor,debt_account_id,debt_entry_id,payment_entry_id) VALUES (?,?,?,?,?,?,?,?,?)");
      cash.wageAllocations.forEach((row, ordinal) => insert.run(cash.id, row.id, ordinal, row.source.kind, row.source.id, bindMoney(Money.parse(row.amount)), row.debtAccountId, row.debtEntryId, row.paymentEntryId));
      if (cash.advance) {
        const row = cash.advance;
        this.db.prepare("INSERT INTO employee_salary_advance(id,cash_id,amount_minor,debt_account_id,debt_entry_id) VALUES (?,?,?,?,?)").run(row.id, cash.id, bindMoney(Money.parse(row.amount)), row.debtAccountId, row.debtEntryId);
      }
    });
  }
}
