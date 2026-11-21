import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import { exactDebtSchemaStatements } from "../company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../company/exact-finance.service";
import { SqliteProjectCostRepository } from "../project-cost/adapters/sqlite-project-cost.repository";
import { SqliteEmployeeEarningRepository } from "./adapters/sqlite-employee-earning.repository";
import { payrollCashSchemaStatements } from "./adapters/payroll-cash-schema";
import { SqlitePayrollCashRepository } from "./adapters/sqlite-payroll-cash.repository";
import { SqlitePayrollSourceRepository } from "./adapters/sqlite-payroll-source.repository";
import { PayrollService, PayrollNotCommittedError } from "./payroll.service";

const now = "2026-11-19T10:00:00.000Z";
const paidAt = "2026-11-18T09:00:00.000Z";
const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });
function fixture(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-558-command-")), "payroll.sqlite");
  const db = createDatabaseConnection(path, key);
  cleanup.push(() => { if (db.open) db.close(); });
  for (const table of ["user", "role", "employee", "project", "employee_earning", "employee_earning_segment"]) {
    const ddl = schemaStatements.find(sql => sql.startsWith(`CREATE TABLE IF NOT EXISTS "${table}" (`));
    if (!ddl) throw new Error(`Missing current table ${table}`);
    db.exec(ddl);
  }
  db.exec("CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY)");
  for (const sql of [...exactDebtSchemaStatements, ...payrollCashSchemaStatements]) db.exec(sql);
  const roleId = randomUUID();
  db.prepare('INSERT INTO role(id,key,name,created_at,updated_at) VALUES (?,?,?,?,?)').run(roleId, "worker", "Worker", now, now);
  function employee() {
    const id = randomUUID();
    db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,salary_reference_period,salary_reference_amount,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE','MONTHLY','30000.00',?,?)").run(id, "Worker", "Name", id, roleId, now, now);
    return id;
  }
  const employeeId = employee(); const projectId = randomUUID();
  db.prepare("INSERT INTO project(id,name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)").run(projectId, "Project", now, now);
  const lock = createFifoLock();
  const financeRepository = new SqliteExactFinanceRepository(db, lock);
  const finance = new ExactFinanceService(financeRepository, { id: randomUUID, now: () => now });
  const cash = new SqlitePayrollCashRepository(db, lock);
  const sources = new SqlitePayrollSourceRepository(db, lock, financeRepository);
  const service = new PayrollService(finance, cash, sources, { id: randomUUID, now: () => now });
  const earnings = new SqliteEmployeeEarningRepository(db, lock);
  const audit = { actorUserId: randomUUID(), actorLabel: "Operator", transactionId: randomUUID() };
  function earning(total = "35000.00", workerId = employeeId) {
    return earnings.create({ requestId: randomUUID(), employeeId: workerId, currencyCode: "DZD", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", totalAmount: total, unallocatedAmount: "0.00", referenceSalary: { period: "MONTHLY", amount: "30000.00" }, segments: [{ id: randomUUID(), projectId, days: 30, amount: total }] }, "approved-intent", now, audit);
  }
  const cost = () => new SqliteProjectCostRepository(db).listProjectSalarySplits(projectId).map(row => row.amount);
  return { db, path, lock, financeRepository, finance, cash, sources, service, audit, employeeId, employee, earning, earnings, cost };
}

describe.each([["plain", ""], ["keyed", "558-command-public-key"]])("payroll command integration %s", (_driver, key) => {
  it("refuses offset commands when offset storage is not configured", () => {
    const f = fixture(key);
    expect(() => f.service.offsetAdvance({ ...f.audit, requestId: "no-offset-store", employeeId: f.employeeId, amount: "1", settlementDate: paidAt, wageSource: { kind: "EARNING", id: "missing" }, advanceSource: { kind: "ADVANCE", id: "missing" } })).toThrow(/persistence is not configured/);
    expect(f.finance.listAccounts()).toEqual([]);
  });

  it("refuses registering or paying missing earnings without creating debt", () => {
    const f = fixture(key);
    expect(() => f.service.registerEarning({ ...f.audit, requestId: "missing-earning", earningId: "missing" })).toThrow(/not found/);
    expect(() => f.service.recordCash({ ...f.audit, requestId: "pay-missing", employeeId: f.employeeId, amount: "1", paymentDate: paidAt, wages: [{ earningId: "missing", amount: "1" }] })).toThrow(/not found/);
    expect(f.finance.listAccounts()).toEqual([]);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
  });

  it("refuses missing opening sources without creating cash or settlements", () => {
    const f = fixture(key);
    expect(() => f.service.recordCash({ ...f.audit, requestId: "missing-opening-wage", employeeId: f.employeeId, amount: "1", paymentDate: paidAt, wages: [{ openingId: "missing", amount: "1" }] })).toThrow(/Reviewed opening source/);
    expect(() => f.service.repayAdvance({ ...f.audit, requestId: "missing-opening-advance", employeeId: f.employeeId, openingAdvanceId: "missing", amount: "1", paymentDate: paidAt })).toThrow(/Reviewed opening source/);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
    expect(f.cash.listSettlements(f.employeeId)).toEqual([]);
    expect(f.finance.listAccounts()).toEqual([]);
  });

  it("confirms only rolled-back absent-receipt refusals and accepts a corrected request", () => {
    const f = fixture(key); const earning = f.earning("100.00");
    const input = { ...f.audit, requestId: "stale-balance", employeeId: f.employeeId, amount: "101.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "101.00" }] };
    expect(() => f.service.recordCash(input)).toThrow(PayrollNotCommittedError);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
    expect(f.financeRepository.listAccounts()).toEqual([]);
    expect(f.db.prepare("SELECT count(*) AS count FROM exact_finance_command").get()).toEqual({ count: 0 });
    const corrected = { ...input, requestId: "corrected-balance", amount: "100.00", wages: [{ earningId: earning.id, amount: "100.00" }] };
    const recorded = f.service.recordCash(corrected);
    expect(f.service.recordCash(corrected)).toEqual(recorded);
    try { f.service.recordCash({ ...corrected, amount: "99.00", wages: [{ earningId: earning.id, amount: "99.00" }] }); throw new Error("expected conflict"); }
    catch (cause) { expect(cause).not.toBeInstanceOf(PayrollNotCommittedError); expect(cause).toHaveProperty("code", "CONFLICT"); }
    expect(f.cash.listCash(f.employeeId)).toHaveLength(1);
  });

  it("keeps reference, approval, repeated cash and project labor cost independent", () => {
    const f = fixture(key); const earning = f.earning();
    const original = f.service.registerEarning({ ...f.audit, requestId: "registration", earningId: earning.id });
    expect(original?.signedAmountDzd).toBe("35000.00");
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
    expect(f.cost()).toEqual(["35000.00"]);
    for (const [requestId, amount, remaining] of [["first", "25000.00", "10000.00"], ["later", "5000.00", "5000.00"], ["last", "5000.00", "0.00"]]) {
      f.service.recordCash({ ...f.audit, requestId: requestId!, employeeId: f.employeeId, amount: amount!, paymentDate: paidAt, wages: [{ earningId: earning.id, amount: amount! }] });
      expect(f.finance.remaining(original!.id)).toBe(remaining);
      expect(f.cost()).toEqual(["35000.00"]);
    }
    expect(f.cash.listCash(f.employeeId)).toHaveLength(3);
    expect(f.earnings.list(f.employeeId)[0]?.referenceSalary).toEqual({ period: "MONTHLY", amount: "30000.00" });
    expect(f.earnings.list(f.employeeId)[0]?.totalAmount).toBe("35000.00");
  });

  it("replays canonical cash timestamps and rejects changed actor, amount or employee", () => {
    const f = fixture(key); const earning = f.earning();
    const input = { ...f.audit, requestId: "uncertain-cash", employeeId: f.employeeId, amount: "25000", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "25000" }] };
    const recorded = f.service.recordCash(input);
    expect(f.service.recordCash({ ...input, amount: "25000.00", wages: [{ earningId: earning.id, amount: "25000.00" }], paymentDate: "2026-11-18T10:00:00+01:00", transactionId: randomUUID() })).toEqual(recorded);
    expect(() => f.service.recordCash({ ...input, actorUserId: randomUUID() })).toThrow(/conflict/);
    expect(() => f.service.recordCash({ ...input, amount: "1.00", wages: [{ earningId: earning.id, amount: "1.00" }] })).toThrow(/conflict/);
    const otherWorker = f.employee(); const otherEarning = f.earning("35000.00", otherWorker);
    expect(() => f.service.recordCash({ ...input, employeeId: otherWorker, wages: [{ earningId: otherEarning.id, amount: "25000.00" }] })).toThrow(/conflict/);
    expect(f.cash.listCash(f.employeeId)).toEqual([recorded]);
    expect(f.cash.listCash(otherWorker)).toEqual([]);
  });

  it("scopes registration retry identity to the command rather than a changed earning", () => {
    const f = fixture(key); const first = f.earning(); const second = f.earning("1000.00");
    const input = { ...f.audit, requestId: "register-once", earningId: first.id };
    const original = f.service.registerEarning(input);
    expect(f.service.registerEarning({ ...input, transactionId: randomUUID() })).toEqual(original);
    expect(() => f.service.registerEarning({ ...input, earningId: second.id })).toThrow(/conflict/);
    expect(() => f.service.registerEarning({ ...input, actorUserId: randomUUID() })).toThrow(/conflict/);
    expect(f.sources.getEarning(second.id)?.original).toBeNull();
  });

  it("accepts a bounded 128-character command key without overflowing derived keys", () => {
    const f = fixture(key); const earning = f.earning();
    const result = f.service.recordCash({ ...f.audit, requestId: "r".repeat(128), employeeId: f.employeeId, amount: "1.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "1.00" }] });
    expect(result.amount).toBe("1.00");
    expect(f.finance.remaining(result.wageAllocations[0]!.debtEntryId)).toBe("34999.00");
  });

  it.each(["source", "receipt"])("rolls back every original, payment and receipt when %s persistence fails", failure => {
    const f = fixture(key); const earning = f.earning();
    if (failure === "source") f.db.exec("CREATE TRIGGER injected_failure AFTER INSERT ON employee_salary_payment_allocation BEGIN SELECT RAISE(ABORT,'injected source failure'); END");
    else f.db.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON exact_finance_command WHEN json_type(NEW.result_json,'$.wageAllocations')='array' BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END");
    const input = { ...f.audit, requestId: "retry-after-rollback", employeeId: f.employeeId, amount: "25000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "25000.00" }] };
    expect(() => f.service.recordCash(input)).toThrow(/injected/);
    expect(f.finance.listAccounts()).toEqual([]);
    for (const table of ["employee_salary_cash", "employee_salary_payment_allocation", "debt_entry", "debt_command", "exact_finance_command"]) expect(f.db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    expect(f.cost()).toEqual(["35000.00"]);
    f.db.exec("DROP TRIGGER injected_failure");
    const result = f.service.recordCash(input);
    expect(f.finance.remaining(result.wageAllocations[0]!.debtEntryId)).toBe("10000.00");
    expect(f.service.recordCash(input)).toEqual(result);
  });

  it.each(["worker", "direction", "amount", "voided", "duplicate"])("refuses a mislinked %s earning original without cash", fault => {
    const f = fixture(key); const earning = f.earning();
    const producer = f.finance.forProducer({ type: "PAYROLL_EARNINGS", id: earning.id });
    const account = producer.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: fault === "worker" ? f.employee() : f.employeeId, direction: fault === "direction" ? "RECEIVABLE" : "PAYABLE", currency: "DZD" });
    const original = producer.postEntry({ requestId: randomUUID(), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: fault === "amount" ? "1.00" : "35000.00", currency: "DZD" });
    if (fault === "voided") producer.voidEntry({ requestId: randomUUID(), entryId: original.id, voidReason: "Cancelled source" });
    if (fault === "duplicate") producer.postEntry({ requestId: randomUUID(), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "35000.00", currency: "DZD" });
    expect(() => f.service.registerEarning({ ...f.audit, requestId: "invalid-source", earningId: earning.id })).toThrow(/linkage|Duplicate/);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
  });

  it("requires the selected worker and rejects malformed money or audit before writing", () => {
    const f = fixture(key); const earning = f.earning();
    const input = { ...f.audit, requestId: "invalid", employeeId: f.employeeId, amount: "1.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "1.00" }] };
    for (const amount of ["0", "-1", "1.001", "1e2", "92233720368547758.08"]) expect(() => f.service.recordCash({ ...input, amount, wages: [{ earningId: earning.id, amount }] })).toThrow();
    expect(() => f.service.recordCash({ ...input, employeeId: f.employee() })).toThrow();
    expect(() => f.service.recordCash({ ...input, transactionId: "not-a-uuid" })).toThrow();
    expect(() => f.service.registerEarning({ ...f.audit, transactionId: "not-a-uuid", requestId: "invalid-registration", earningId: earning.id })).toThrow();
    expect(f.finance.listAccounts()).toEqual([]);
  });

  it("rejects duplicate allocations and unreconciled totals before registering debt", () => {
    const f = fixture(key); const earning = f.earning("100.00");
    const input = { ...f.audit, requestId: "bad-allocation", employeeId: f.employeeId, amount: "2.00", paymentDate: paidAt };
    expect(() => f.service.recordCash({ ...input, wages: [{ earningId: earning.id, amount: "1.00" }, { earningId: earning.id, amount: "1.00" }] })).toThrow(/Duplicate earning allocation/);
    expect(() => f.service.recordCash({ ...input, wages: [{ earningId: earning.id, amount: "1.00" }] })).toThrow(/Cash total must equal/);
    expect(f.finance.listAccounts()).toEqual([]);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
    expect(f.sources.getEarning(earning.id)?.original).toBeNull();
  });

  it("refuses cash materialization above 10000 rows before any financial writes", () => {
    const f = fixture(key);
    const wages = Array.from({ length: 9999 }, (_, index) => ({ earningId: `earning-${index}`, amount: "1.00" }));
    // One cash row, 9999 allocations and one advance exceed the aggregate budget.
    expect(() => f.service.recordCash({ ...f.audit, requestId: "over-budget", employeeId: f.employeeId, amount: "10000.00", paymentDate: paidAt, wages, advanceAmount: "1.00" })).toThrow(/Payroll cash materialization limit exceeded/);
    expect(f.finance.listAccounts()).toEqual([]);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
    expect(f.db.prepare("SELECT count(*) AS count FROM exact_finance_command").get()).toEqual({ count: 0 });
  });

  it("refuses absent earnings and advances without creating cash or debt", () => {
    const f = fixture(key);
    expect(() => f.service.registerEarning({ ...f.audit, requestId: "missing-registration", earningId: randomUUID() })).toThrow(/not found/);
    expect(() => f.service.repayAdvance({ ...f.audit, requestId: "missing-advance", employeeId: f.employeeId, advanceId: randomUUID(), amount: "1.00", paymentDate: paidAt })).toThrow(/not found/);
    expect(f.finance.listAccounts()).toEqual([]);
    expect(f.cash.listCash(f.employeeId)).toEqual([]);
    expect(f.cash.listSettlements(f.employeeId)).toEqual([]);
  });

  it("preserves response-loss cash replay after closing and reopening a real database", () => {
    const f = fixture(key); const earning = f.earning();
    const input = { ...f.audit, requestId: "reopen", employeeId: f.employeeId, amount: "25000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "25000.00" }] };
    const result = f.service.recordCash(input);
    f.db.close();
    const db = createDatabaseConnection(f.path, key); cleanup.push(() => db.close());
    const lock = createFifoLock(); const financeRepository = new SqliteExactFinanceRepository(db, lock);
    const finance = new ExactFinanceService(financeRepository, { id: randomUUID, now: () => now });
    const cash = new SqlitePayrollCashRepository(db, lock);
    const service = new PayrollService(finance, cash, new SqlitePayrollSourceRepository(db, lock, financeRepository), { id: randomUUID, now: () => now });
    expect(service.recordCash({ ...input, transactionId: randomUUID() })).toEqual(result);
    expect(cash.listCash(f.employeeId)).toEqual([result]);
    expect(finance.remaining(result.wageAllocations[0]!.debtEntryId)).toBe("10000.00");
    expect(new SqliteProjectCostRepository(db).listProjectSalarySplits(earning.segments[0]!.projectId).map(row => row.amount)).toEqual(["35000.00"]);
  });

  it("keeps advance repayment explicit, worker-scoped and replayable", () => {
    const f = fixture(key); const earning = f.earning();
    const cash = f.service.recordCash({ ...f.audit, requestId: "advance", employeeId: f.employeeId, amount: "40000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "35000.00" }], advanceAmount: "5000.00" });
    const input = { ...f.audit, requestId: "repayment", employeeId: f.employeeId, advanceId: cash.advance!.id, amount: "2000.00", paymentDate: paidAt };
    expect(() => f.service.repayAdvance({ ...input, employeeId: f.employee() })).toThrow();
    const settlement = f.service.repayAdvance(input);
    expect(f.service.repayAdvance({ ...input, paymentDate: "2026-11-18T10:00:00+01:00" })).toEqual(settlement);
    expect(f.finance.remaining(cash.advance!.debtEntryId)).toBe("3000.00");
    expect(f.finance.remaining(cash.wageAllocations[0]!.debtEntryId)).toBe("0.00");
    expect(f.cost()).toEqual(["35000.00"]);
    expect(() => f.service.repayAdvance({ ...input, actorUserId: randomUUID() })).toThrow(/conflict/);
    expect(() => f.service.repayAdvance({ ...input, requestId: "too-large", amount: "3000.01" })).toThrow();
  });

  it.each(["source", "receipt"])("rolls back an advance repayment when its %s persistence fails", failure => {
    const f = fixture(key); const earning = f.earning();
    const cash = f.service.recordCash({ ...f.audit, requestId: "cash-before-failure", employeeId: f.employeeId, amount: "40000.00", paymentDate: paidAt, wages: [{ earningId: earning.id, amount: "35000.00" }], advanceAmount: "5000.00" });
    if (failure === "source") f.db.exec("CREATE TRIGGER fail_repayment AFTER INSERT ON employee_salary_settlement BEGIN SELECT RAISE(ABORT,'injected repayment source failure'); END");
    else f.db.exec("CREATE TRIGGER fail_repayment BEFORE INSERT ON exact_finance_command WHEN json_extract(NEW.result_json,'$.source.kind')='ADVANCE' BEGIN SELECT RAISE(ABORT,'injected repayment receipt failure'); END");
    const beforeEntries = f.finance.listEntries(cash.advance!.debtAccountId);
    const input = { ...f.audit, requestId: "repayment-after-failure", employeeId: f.employeeId, advanceId: cash.advance!.id, amount: "2000.00", paymentDate: paidAt };
    expect(() => f.service.repayAdvance(input)).toThrow(/injected/);
    expect(f.finance.remaining(cash.advance!.debtEntryId)).toBe("5000.00");
    expect(f.finance.listEntries(cash.advance!.debtAccountId)).toEqual(beforeEntries);
    expect(f.cash.listSettlements(f.employeeId)).toEqual([]);
    expect(f.cash.listCash(f.employeeId)).toEqual([cash]);
    f.db.exec("DROP TRIGGER fail_repayment");
    const settlement = f.service.repayAdvance(input);
    expect(f.service.repayAdvance(input)).toEqual(settlement);
    expect(f.finance.remaining(cash.advance!.debtEntryId)).toBe("3000.00");
    f.db.close();
    const db = createDatabaseConnection(f.path, key); cleanup.push(() => db.close());
    const lock = createFifoLock(); const financeRepository = new SqliteExactFinanceRepository(db, lock);
    const finance = new ExactFinanceService(financeRepository, { id: randomUUID, now: () => now });
    const repository = new SqlitePayrollCashRepository(db, lock);
    const service = new PayrollService(finance, repository, new SqlitePayrollSourceRepository(db, lock, financeRepository), { id: randomUUID, now: () => now });
    expect(service.repayAdvance(input)).toEqual(settlement);
    expect(repository.listSettlements(f.employeeId)).toEqual([settlement]);
    expect(finance.remaining(cash.advance!.debtEntryId)).toBe("3000.00");
  });

  it("rejects foreign transaction identities and async source callbacks before invocation", () => {
    const f = fixture(key);
    expect(() => new SqlitePayrollSourceRepository(f.db, createFifoLock(), f.financeRepository)).toThrow(/connection|FIFO/);
    const other = fixture(key);
    expect(() => new PayrollService(f.finance, other.cash, f.sources, { id: randomUUID, now: () => now })).toThrow(/connection|FIFO/);
    let invoked = false;
    expect(() => f.sources.withTransaction(async () => { invoked = true; })).toThrow(/synchronous/);
    expect(invoked).toBe(false);
  });
});
