import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { schemaStatements } from "../../../infrastructure/database/schema-definitions";
import { exactDebtSchemaStatements } from "../../company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../../company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../../company/exact-finance.service";
import type { PayrollCashRecord } from "../payroll-cash.repository";
import { payrollCashSchemaStatements } from "./payroll-cash-schema";
import { SqlitePayrollCashRepository } from "./sqlite-payroll-cash.repository";
import { SqlitePayrollSourceRepository } from "./sqlite-payroll-source.repository";
import { PayrollService } from "../payroll.service";

const postingDate = "2026-11-19T10:00:00.000Z";
const cashDate = "2026-11-18T09:00:00.000Z";
const close: (() => void)[] = [];
afterEach(() => { for (const cleanup of close.splice(0)) cleanup(); });
function fixture(key: string, payrollStatements: readonly string[] = payrollCashSchemaStatements) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-558-cash-")), "fixture.sqlite");
  const db = createDatabaseConnection(path, key);
  close.push(() => { if (db.open) db.close(); });
  db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY)");
  const earningDdl = schemaStatements.find(statement => statement.includes('CREATE TABLE IF NOT EXISTS "employee_earning" ('));
  if (!earningDdl) throw new Error("Current employee_earning DDL is missing");
  db.exec(earningDdl);
  const employeeId = randomUUID();
  db.prepare("INSERT INTO employee VALUES (?)").run(employeeId);
  for (const sql of [...exactDebtSchemaStatements, ...payrollStatements]) db.exec(sql);
  const lock = createFifoLock();
  const finance = new ExactFinanceService(new SqliteExactFinanceRepository(db, lock), { id: randomUUID, now: () => postingDate });
  const repository = new SqlitePayrollCashRepository(db, lock);
  const audit = { actorUserId: randomUUID(), actorLabel: "Operator", transactionId: randomUUID(), createdAt: postingDate };
  function source(amount = "35000.00", paid = "25000.00", advance = false) {
    const sourceId = randomUUID();
    const scoped = finance.forProducer({ type: advance ? "PAYROLL_ADVANCE" : "PAYROLL_EARNINGS", id: sourceId });
    const account = scoped.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: employeeId, direction: advance ? "RECEIVABLE" : "PAYABLE", currency: "DZD" });
    const original = scoped.postEntry({ requestId: randomUUID(), debtAccountId: account.id, currency: "DZD", entryType: advance ? "ADVANCE" : "ADJUSTMENT", signedAmountDzd: amount });
    const payment = paid === "0.00" ? null : scoped.recordPayment({ requestId: randomUUID(), debtEntryId: original.id, amountDzd: paid, currency: "DZD" });
    return { sourceId, account, original, payment, scoped };
  }
  function cash(amount = "25000.00"): PayrollCashRecord {
    const wage = source(amount, amount);
    return { id: randomUUID(), employeeId, currency: "DZD", amount, paymentDate: cashDate, ...audit,
      wageAllocations: [{ id: "row-1", source: { kind: "EARNING", id: wage.sourceId }, amount, debtAccountId: wage.account.id, debtEntryId: wage.original.id, paymentEntryId: wage.payment!.id }], advance: null };
  }
  const sources = new SqlitePayrollSourceRepository(db, lock, new SqliteExactFinanceRepository(db, lock));
  const payroll = new PayrollService(finance, repository, sources, { id: randomUUID, now: () => postingDate });
  function earning(id: string, totalMinor: number) { db.prepare(`INSERT INTO employee_earning(id,employee_id,request_id,request_hash,period_start,period_end,currency_code,total_minor,unallocated_minor,reference_salary_period,reference_salary_units,approved_at,actor_user_id,transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, employeeId, `request-${id}`, "hash", "2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z", "DZD", totalMinor, 0, null, null, postingDate, null, null, postingDate); }
  return { db, path, repository, finance, lock, employeeId, source, cash, audit, sources, payroll, earning };
}

describe.each([["plain", ""], ["keyed", "558-native-key"]])("payroll cash storage %s", (_driver, key) => {
  it("persists ordered exact cash and advance provenance across native close/reopen", () => {
    const f = fixture(key);
    const row = f.cash("90071992547409.93");
    const second = f.source("0.06", "0.06");
    const advance = f.source("0.01", "0.00", true);
    const cash: PayrollCashRecord = { ...row, amount: "90071992547410.00", wageAllocations: [...row.wageAllocations, { id: "row-2", source: { kind: "EARNING", id: second.sourceId }, amount: "0.06", debtAccountId: second.account.id, debtEntryId: second.original.id, paymentEntryId: second.payment!.id }], advance: { id: advance.sourceId, amount: "0.01", debtAccountId: advance.account.id, debtEntryId: advance.original.id } };
    f.repository.saveCash(cash);
    expect(f.repository.getCash(cash.id)).toEqual(cash);
    expect(f.finance.getAccount(advance.account.id).currentBalance).toBe("0.01");
    expect(f.finance.listEntries(second.account.id).find(entry => entry.id === second.payment!.id)?.entryDate).toBe(postingDate);
    f.db.close();
    const reopened = createDatabaseConnection(f.path, key);
    close.push(() => reopened.close());
    const restored = new SqlitePayrollCashRepository(reopened, createFifoLock());
    expect(restored.listCash(f.employeeId)).toEqual([cash]);
    expect(restored.getCash(randomUUID())).toBeNull();
  });

  it.each(["-1.00", "0.00", "1.001", "1e2", "92233720368547758.08"])("refuses invalid cash amount %s without writing", amount => {
    const f = fixture(key); const cash = f.cash();
    expect(() => f.repository.saveCash({ ...cash, amount })).toThrow();
    expect(f.repository.listCash(f.employeeId)).toEqual([]);
  });

  it("rejects invalid audit, dates, negative children, currency and total reconciliation", () => {
    const f = fixture(key); const cash = f.cash();
    for (const patch of [{ transactionId: "not-a-uuid" }, { paymentDate: "2026-11-18" }, { actorUserId: "" }, { currency: "EUR" }, { amount: "25000.01" }, { wageAllocations: [{ ...cash.wageAllocations[0]!, amount: "-25000.00" }] }]) {
      expect(() => f.repository.saveCash({ ...cash, ...patch } as PayrollCashRecord)).toThrow();
    }
    expect(f.repository.listCash(f.employeeId)).toEqual([]);
  });

  it("checks exact ledger amount and worker/source attribution and rolls back failed children", () => {
    const f = fixture(key); const cash = f.cash(); const item = cash.wageAllocations[0]!;
    for (const patch of [{ amount: "24999.00" }, { source: { kind: "EARNING" as const, id: randomUUID() } }, { debtEntryId: item.paymentEntryId }, { paymentEntryId: item.debtEntryId }]) {
      const allocation = { ...item, ...patch };
      expect(() => f.repository.saveCash({ ...cash, amount: allocation.amount, wageAllocations: [allocation] })).toThrow();
      expect(f.repository.getCash(cash.id)).toBeNull();
    }
    const wrongEmployee = randomUUID(); f.db.prepare("INSERT INTO employee VALUES (?)").run(wrongEmployee);
    expect(() => f.repository.saveCash({ ...cash, employeeId: wrongEmployee })).toThrow();
    f.repository.saveCash(cash);
    expect(f.repository.getCash(cash.id)).toEqual(cash);
  });

  it("preserves composite allocation identity but refuses a reused ledger payment across cash events", () => {
    const f = fixture(key); const first = f.cash(); const second = f.cash("1.00");
    f.repository.saveCash(first); f.repository.saveCash(second);
    expect(f.repository.listCash(f.employeeId)).toHaveLength(2);
    expect(() => f.repository.saveCash({ ...first, id: randomUUID() })).toThrow();
    expect(f.repository.listCash(f.employeeId)).toHaveLength(2);
  });

  it("rolls back a header and earlier children when a later allocation fails", () => {
    const f = fixture(key); const first = f.cash("1.00"); const second = f.cash("2.00");
    expect(() => f.repository.saveCash({ ...first, amount: "3.00", wageAllocations: [first.wageAllocations[0]!, { ...second.wageAllocations[0]!, id: "row-2", paymentEntryId: randomUUID() }] })).toThrow();
    expect(f.repository.getCash(first.id)).toBeNull();
    expect(f.db.prepare("SELECT count(*) AS count FROM employee_salary_payment_allocation").get()).toEqual({ count: 0 });
    f.repository.saveCash(first);
  });

  it("refuses a malformed prepared ledger and REAL provenance columns", () => {
    const f = fixture(key);
    f.db.exec("ALTER TABLE employee_salary_cash ADD COLUMN wrong_amount REAL");
    // The active exact amount column must itself have the correct physical type.
    f.db.exec("ALTER TABLE employee_salary_cash RENAME COLUMN amount_minor TO old_amount_minor; ALTER TABLE employee_salary_cash ADD COLUMN amount_minor REAL");
    expect(() => new SqlitePayrollCashRepository(f.db, f.lock)).toThrow(/schema|column/);
  });

  it("refuses missing or weakened integrity schema even when all column types match", () => {
    for (const statements of [
      payrollCashSchemaStatements.filter(sql => !sql.startsWith("CREATE TRIGGER employee_salary_payment_allocation_link_insert")),
      payrollCashSchemaStatements.map(sql => sql.startsWith("CREATE TABLE employee_salary_payment_allocation") ? sql.replace("payment_entry_id TEXT NOT NULL UNIQUE", "payment_entry_id TEXT NOT NULL") : sql),
      payrollCashSchemaStatements.map(sql => sql.startsWith("CREATE TABLE employee_salary_cash") ? sql.replace("CHECK(currency='DZD')", "") : sql),
      payrollCashSchemaStatements.map(sql => sql.startsWith("CREATE TRIGGER employee_salary_cash_immutable_update") ? "CREATE TRIGGER employee_salary_cash_immutable_update BEFORE UPDATE ON employee_salary_cash WHEN 0 BEGIN SELECT RAISE(ABORT,'disabled'); END" : sql),
    ]) expect(() => fixture(key, statements)).toThrow(/schema/);
    const f = fixture(key);
    f.db.pragma("foreign_keys=OFF");
    expect(() => new SqlitePayrollCashRepository(f.db, f.lock)).toThrow(/foreign keys/);
  });

  it("rejects a voided advance original during cash hydration", () => {
    const f = fixture(key); const advance = f.source("5000.00", "0.00", true);
    const cash: PayrollCashRecord = { id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "5000.00", paymentDate: cashDate, ...f.audit, wageAllocations: [], advance: { id: advance.sourceId, amount: "5000.00", debtAccountId: advance.account.id, debtEntryId: advance.original.id } };
    f.repository.saveCash(cash);
    advance.scoped.voidEntry({ requestId: randomUUID(), entryId: advance.original.id, voidReason: "Advance cancelled" });
    expect(() => f.repository.getCash(cash.id)).toThrow("Payroll cash source link mismatch");
    expect(() => f.repository.listCash(f.employeeId)).toThrow("Payroll cash source link mismatch");
  });

  it("rejects a voided advance repayment during direct and collection hydration", () => {
    const f = fixture(key); const advance = f.source("5000.00", "0.00", true);
    f.repository.saveCash({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "5000.00", paymentDate: cashDate, ...f.audit, wageAllocations: [], advance: { id: advance.sourceId, amount: "5000.00", debtAccountId: advance.account.id, debtEntryId: advance.original.id } });
    const payment = advance.scoped.recordPayment({ requestId: randomUUID(), debtEntryId: advance.original.id, amountDzd: "2000.00", currency: "DZD" });
    const settlement = { id: randomUUID(), employeeId: f.employeeId, currency: "DZD" as const, amount: "2000.00", paymentDate: cashDate, ...f.audit, source: { kind: "ADVANCE" as const, id: advance.sourceId }, debtAccountId: advance.account.id, debtEntryId: advance.original.id, paymentEntryId: payment.id };
    f.repository.saveSettlement(settlement);
    advance.scoped.voidEntry({ requestId: randomUUID(), entryId: payment.id, voidReason: "Cash repayment reversed" });
    expect(() => f.repository.getSettlement(settlement.id)).toThrow("Payroll cash source link mismatch");
    expect(() => f.repository.listSettlements(f.employeeId)).toThrow("Payroll cash source link mismatch");
    expect(f.finance.remaining(advance.original.id)).toBe("5000.00");
  });

  it("rejects changed live ledger links on read rather than returning fabricated cash", () => {
    const f = fixture(key); const cash = f.cash(); f.repository.saveCash(cash);
    const allocation = cash.wageAllocations[0]!;
    f.finance.forProducer({ type: "PAYROLL_EARNINGS", id: allocation.source.id }).voidEntry({ requestId: randomUUID(), entryId: allocation.paymentEntryId, voidReason: "Recorded payment reversed" });
    expect(() => f.repository.getCash(cash.id)).toThrow(/link/);
  });

  it("persists explicit advance repayment without consuming wages and detects wrong direction", () => {
    const f = fixture(key); const advance = f.source("5000.00", "0.00", true);
    const cash: PayrollCashRecord = { id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "5000.00", paymentDate: cashDate, ...f.audit, wageAllocations: [], advance: { id: advance.sourceId, amount: "5000.00", debtAccountId: advance.account.id, debtEntryId: advance.original.id } };
    f.repository.saveCash(cash);
    const payment = advance.scoped.recordPayment({ requestId: randomUUID(), debtEntryId: advance.original.id, amountDzd: "2000.00", currency: "DZD" });
    const settlement = { id: randomUUID(), employeeId: f.employeeId, currency: "DZD" as const, amount: "2000.00", paymentDate: cashDate, ...f.audit, source: { kind: "ADVANCE" as const, id: advance.sourceId }, debtAccountId: advance.account.id, debtEntryId: advance.original.id, paymentEntryId: payment.id };
    f.repository.saveSettlement(settlement);
    expect(f.repository.getSettlement(settlement.id)).toEqual(settlement);
    expect(f.repository.listSettlements(f.employeeId)).toEqual([settlement]);
    expect(f.finance.remaining(advance.original.id)).toBe("3000.00");
    expect(() => f.repository.saveSettlement({ ...settlement, id: randomUUID() })).toThrow();
    const wages = f.source("2000.00", "2000.00");
    expect(() => f.repository.saveSettlement({ ...settlement, id: randomUUID(), debtAccountId: wages.account.id, debtEntryId: wages.original.id, paymentEntryId: wages.payment!.id })).toThrow();
    expect(f.repository.listSettlements(f.employeeId)).toHaveLength(1);
    f.db.pragma("recursive_triggers=OFF");
    for (const table of ["employee_salary_advance", "employee_salary_settlement"]) {
      expect(() => f.db.exec(`UPDATE ${table} SET amount_minor=1`)).toThrow();
      expect(() => f.db.exec(`DELETE FROM ${table}`)).toThrow();
      expect(() => f.db.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`)).toThrow();
    }
    f.db.close();
    const reopened = createDatabaseConnection(f.path, key); close.push(() => reopened.close());
    expect(new SqlitePayrollCashRepository(reopened, createFifoLock()).getSettlement(settlement.id)).toEqual(settlement);
  });

  it("rolls back cash, finance balance and receipts when aggregate source persistence fails", () => {
    const f = fixture(key); const wage = f.source("35000.00", "0.00");
    f.db.exec("CREATE TRIGGER fail_cash BEFORE INSERT ON employee_salary_cash BEGIN SELECT RAISE(ABORT,'injected cash failure'); END");
    expect(() => f.finance.runAggregate({ requestId: "cash-command", producer: { type: "PAYROLL_EARNINGS", id: wage.sourceId }, intent: { amount: "25000.00" } }, f.repository, () => {
      const payment = wage.scoped.recordPayment({ requestId: "linked-payment", debtEntryId: wage.original.id, amountDzd: "25000.00", currency: "DZD" });
      f.repository.saveCash({ id: randomUUID(), employeeId: f.employeeId, currency: "DZD", amount: "25000.00", paymentDate: cashDate, ...f.audit, advance: null, wageAllocations: [{ id: "row", source: { kind: "EARNING", id: wage.sourceId }, amount: "25000.00", debtAccountId: wage.account.id, debtEntryId: wage.original.id, paymentEntryId: payment.id }] });
    })).toThrow("injected cash failure");
    expect(f.finance.remaining(wage.original.id)).toBe("35000.00");
    expect(f.db.prepare("SELECT count(*) AS count FROM exact_finance_command").get()).toEqual({ count: 0 });
    expect(f.finance.listEntries(wage.account.id)).toHaveLength(1);
  });

  it("keeps provenance immutable for update/delete/replace with recursive triggers disabled", () => {
    const f = fixture(key); const cash = f.cash(); f.repository.saveCash(cash); f.db.pragma("recursive_triggers=OFF");
    for (const table of ["employee_salary_cash", "employee_salary_payment_allocation"]) {
      expect(() => f.db.exec(`UPDATE ${table} SET amount_minor=1`)).toThrow();
      expect(() => f.db.exec(`DELETE FROM ${table}`)).toThrow();
      expect(() => f.db.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`)).toThrow();
    }
    expect(f.repository.getCash(cash.id)).toEqual(cash);
  });

  it("refuses asynchronous transaction callbacks before invocation and rolls back thenables", () => {
    const f = fixture(key); const cash = f.cash(); let called = false;
    expect(() => f.repository.withTransaction(async () => { called = true; })).toThrow(/synchronous/);
    expect(called).toBe(false);
    expect(() => f.repository.withTransaction(() => { f.repository.saveCash(cash); return Promise.resolve(); })).toThrow(/synchronous/);
    expect(f.repository.getCash(cash.id)).toBeNull();
    expect(() => f.repository.withTransaction(() => { f.repository.saveCash(cash); throw new Error("outer rollback"); })).toThrow("outer rollback");
    expect(f.repository.getCash(cash.id)).toBeNull();
  });

  it("refuses a foreign async flow while its shared FIFO is held", async () => {
    const f = fixture(key); const cash = f.cash(); let release!: () => void; let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const held = f.lock.run(async () => { started(); await gate; });
    await entered;
    try { expect(() => f.repository.saveCash(cash)).toThrow(/busy/); } finally { release(); await held; }
    expect(f.repository.getCash(cash.id)).toBeNull();
    f.repository.saveCash(cash);
  });

  it.each(["allocations", "advances"] as const)("accepts exactly 10000 combined rows and counts %s before overflow hydration", kind => {
    const f = fixture(key);
    const isAdvance = kind === "advances";
    const source = f.source(isAdvance ? "0.01" : "50.00", isAdvance ? "0.00" : "0.01", isAdvance);
    const seed = isAdvance ? source.original : source.payment!;
    // Bulk fixture uses real ledger columns and constraints, avoiding quadratic
    // command setup. It records distinct postings with independently known cents.
    const columns = f.db.pragma("table_info(debt_entry)") as { name: string }[];
    const replacements = new Set(["id", "posting_sequence", "balance_after_minor", ...(isAdvance ? ["producer_id"] : [])]);
    const clone = f.db.prepare(`INSERT INTO debt_entry SELECT ${columns.map(column => replacements.has(column.name) ? "?" : column.name).join(",")} FROM debt_entry WHERE id=?`);
    const firstCashId = "budget-cash-0";
    f.db.transaction(() => {
      for (let index = 0; index < 5000; index++) {
        const sourceId = isAdvance && index > 0 ? `budget-advance-${index}` : source.sourceId;
        const entryId = index === 0 ? seed.id : `budget-entry-${index}`;
        if (index > 0) {
          const values = columns.filter(column => replacements.has(column.name)).map(column => {
            if (column.name === "id") return entryId;
            if (column.name === "posting_sequence") return index + (isAdvance ? 1 : 2);
            if (column.name === "producer_id") return sourceId;
            return BigInt(isAdvance ? index + 1 : 4999 - index);
          });
          clone.run(...values, seed.id);
        }
        f.repository.saveCash({ id: `budget-cash-${index}`, employeeId: f.employeeId, currency: "DZD", amount: "0.01", paymentDate: cashDate, ...f.audit,
          wageAllocations: isAdvance ? [] : [{ id: "row", source: { kind: "EARNING", id: sourceId }, amount: "0.01", debtAccountId: source.account.id, debtEntryId: source.original.id, paymentEntryId: entryId }],
          advance: isAdvance ? { id: sourceId, amount: "0.01", debtAccountId: source.account.id, debtEntryId: entryId } : null });
      }
      f.db.prepare("UPDATE debt_account SET current_balance_minor=?,status=? WHERE id=?").run(isAdvance ? 5000n : 0n, isAdvance ? "OPEN" : "SETTLED", source.account.id);
    }).immediate();
    const rows = f.repository.listCash(f.employeeId);
    expect(rows).toHaveLength(5000);
    expect(rows.find(row => row.id === firstCashId)?.amount).toBe("0.01");
    expect(f.finance.getAccount(source.account.id).currentBalance).toBe(isAdvance ? "50.00" : "0.00");
    f.db.prepare("INSERT INTO employee_salary_cash VALUES (?,?,?,?,?,?,?,?,?)").run("budget-overflow", f.employeeId, "DZD", 1n, "bad-date", null, null, null, "bad-date");
    expect(() => f.repository.listCash(f.employeeId)).toThrow("Payroll cash materialization limit exceeded");
  }, 30000);

  it("registers only the current approved amount and leaves 10000 after 25000 cash", () => {
    const f = fixture(key); const earningId = randomUUID(); f.earning(earningId, 3_500_000);
    const audit = { actorUserId: f.audit.actorUserId, actorLabel: f.audit.actorLabel, transactionId: f.audit.transactionId };
    const original = f.payroll.registerEarning({ ...audit, requestId: "register-earning", earningId });
    expect(original?.signedAmountDzd).toBe("35000.00");
    const record = f.payroll.recordCash({ ...audit, requestId: "cash-earning", employeeId: f.employeeId, amount: "25000.00", paymentDate: cashDate, wages: [{ earningId, amount: "25000.00" }] });
    expect(record.wageAllocations[0]?.amount).toBe("25000.00");
    expect(f.finance.remaining(original!.id)).toBe("10000.00");
    expect(f.db.prepare("SELECT total_minor FROM employee_earning WHERE id=?").get(earningId)).toEqual({ total_minor: 3_500_000 });
    expect(f.payroll.registerEarning({ ...audit, requestId: "register-earning", earningId })).toEqual(original);
  });

  it("requires an explicit advance for cash above approved wages and repays it separately", () => {
    const f = fixture(key); const earningId = randomUUID(); f.earning(earningId, 3_500_000);
    const audit = { actorUserId: f.audit.actorUserId, actorLabel: f.audit.actorLabel, transactionId: f.audit.transactionId };
    expect(() => f.payroll.recordCash({ ...audit, requestId: "too-much", employeeId: f.employeeId, amount: "40000.00", paymentDate: cashDate, wages: [{ earningId, amount: "40000.00" }] })).toThrow();
    const record = f.payroll.recordCash({ ...audit, requestId: "with-advance", employeeId: f.employeeId, amount: "40000.00", paymentDate: cashDate, wages: [{ earningId, amount: "35000.00" }], advanceAmount: "5000.00" });
    expect(record.advance?.amount).toBe("5000.00");
    const repayment = f.payroll.repayAdvance({ ...audit, requestId: "repay", employeeId: f.employeeId, advanceId: record.advance!.id, amount: "2000.00", paymentDate: cashDate });
    expect(repayment?.amount).toBe("2000.00");
    expect(f.finance.remaining(record.advance!.debtEntryId)).toBe("3000.00");
    expect(f.repository.getAdvance(record.advance!.id)?.advance.id).toBe(record.advance!.id);
  });

  it("checks the combined row budget before hydrating malformed cash headers", () => {
    const f = fixture(key);
    f.db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10001)
      INSERT INTO employee_salary_cash SELECT 'bulk-'||x,'${f.employeeId}','DZD',1,'invalid-date','actor',NULL,'invalid-transaction','invalid-date' FROM n`);
    expect(() => f.repository.listCash(f.employeeId)).toThrow(/materialization limit/);
  });
});
