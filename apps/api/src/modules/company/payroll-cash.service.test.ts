import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { exactDebtSchemaStatements } from "./adapters/exact-finance-schema";
import { exactWorkforceSchemaStatements } from "./adapters/exact-workforce-schema";
import { exactWorkforceEarningSchemaStatements } from "./adapters/exact-workforce-earning-schema";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { SqliteExactWorkforceRepository } from "./adapters/sqlite-exact-workforce.repository";
import { SqlitePayrollCashRepository } from "./adapters/sqlite-payroll-cash.repository";
import { ExactFinanceService } from "./exact-finance.service";
import { ExactWorkforceService } from "./workforce-exact.service";
import { PayrollCashService } from "./payroll-cash.service";

const now = "2026-11-12T10:00:00.000Z";
const audit = { actorUserId: "operator", actorLabel: "Owner", transactionId: "00000000-0000-4000-8000-000000000001" };
const close: (() => void)[] = [];
afterEach(() => { for (const fn of close.splice(0)) fn(); vi.restoreAllMocks(); });
function fixture(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-payroll-cash-")), "fixture.sqlite");
  let db = createDatabaseConnection(path, key);
  close.push(() => db.close());
  const lock = createFifoLock(); let id = 0;
  const deps = { id: () => `source-${++id}`, now: () => now };
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE role(id TEXT PRIMARY KEY); CREATE TABLE project(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO role VALUES ('worker-role'); INSERT INTO project VALUES ('A')");
  for (const sql of [...exactWorkforceSchemaStatements, ...exactDebtSchemaStatements, ...exactWorkforceEarningSchemaStatements]) db.exec(sql);
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('worker','First','Worker','0550000000','worker-role','ACTIVE',?,?)").run(now, now);
  const compose = () => {
    const ledger = new SqliteExactFinanceRepository(db, lock);
    const finance = new ExactFinanceService(ledger, deps);
    const earnings = new SqliteExactWorkforceRepository(db, lock);
    const cash = new SqlitePayrollCashRepository(db, lock);
    return { finance, ledger, earnings, cash, workforce: new ExactWorkforceService(earnings, finance, deps), service: new PayrollCashService(cash, earnings, finance, deps) };
  };
  return { get db() { return db; }, path, compose, reopen() { db.close(); db = createDatabaseConnection(path, key); db.pragma("foreign_keys=ON"); return compose(); } };
}
const approve = { requestId: "approve", employeeId: "worker", currency: "DZD" as const, periodStart: "2026-10-01", periodEnd: "2026-10-31", approvedAmount: "35000", unallocatedAmount: "0", segments: [{ id: "project", projectId: "A", amount: "35000" }], ...audit };

describe.each([["plain", ""], ["keyed", "527-cash-public-fixture-key"]])("actual payroll cash %s", (_kind, key) => {
  it("refuses malformed payroll cash physical columns on both native drivers", () => {
    const f = fixture(key);
    f.db.exec("DROP TABLE employee_salary_cash; CREATE TABLE employee_salary_cash(id TEXT PRIMARY KEY,employee_id TEXT,currency TEXT,amount_minor TEXT,payment_date TEXT,actor_user_id TEXT,actor_label TEXT,transaction_id TEXT,created_at TEXT)");
    expect(() => new SqlitePayrollCashRepository(f.db, createFifoLock())).toThrow(/Invalid exact payroll cash column employee_salary_cash.amount_minor/);
  });

  it("blocks update, delete and INSERT OR REPLACE on every payroll source with recursive triggers off", () => {
    const f = fixture(key); const c = f.compose();
    c.service.reviewOpening({ requestId: "review-immutable", employeeId: "worker", currency: "DZD", review: { status: "REVIEWED", wagesOwed: "500", advancesOwed: "1000" }, ...audit });
    const cash = c.service.recordCash({ requestId: "cash-immutable", employeeId: "worker", currency: "DZD", amount: "1500", paymentDate: now, wageAllocations: [{ id: "wage", source: { kind: "OPENING", id: "source-1" }, amount: "500" }], advance: { id: "advance-immutable", amount: "1000" }, ...audit });
    c.service.repayAdvance({ requestId: "repay-immutable", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "advance-immutable" }, amount: "250", paymentDate: now, ...audit });
    const earning = c.workforce.approveEarnings(approve);
    const correction = c.service.correctEarning({ requestId: "correct-immutable", employeeId: "worker", currency: "DZD", earningId: earning.id, newAmount: "36000", reason: "Correction source guard", ...audit });
    f.db.pragma("recursive_triggers=OFF");
    const cases = [
      ["employee_salary_opening_review", "id='source-1'"],
      ["employee_salary_correction", `id='${correction.id}'`],
      ["employee_salary_cash", `id='${cash.id}'`],
      ["employee_salary_payment_allocation", `cash_id='${cash.id}' AND id='wage'`],
      ["employee_salary_advance", "id='advance-immutable'"],
      ["employee_salary_settlement", "source_id='advance-immutable'"],
    ] as const;
    for (const [table, where] of cases) {
      expect(() => f.db.exec(`UPDATE ${table} SET created_at=created_at WHERE ${where}`)).toThrow();
      expect(() => f.db.exec(`DELETE FROM ${table} WHERE ${where}`)).toThrow();
      expect(() => f.db.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE ${where}`)).toThrow();
    }
  });

  it("hydrates each distinct finance account once for lifecycle rows with repeated allocations", () => {
    const f = fixture(key); const c = f.compose();
    const earning = c.workforce.approveEarnings({ ...approve, approvedAmount: "1000", segments: [{ id: "project", projectId: "A", amount: "1000" }] });
    c.service.recordCash({ requestId: "repeat-account", employeeId: "worker", currency: "DZD", amount: "200", paymentDate: now, wageAllocations: [{ id: "first", source: { kind: "EARNING", id: earning.id }, amount: "100" }, { id: "second", source: { kind: "EARNING", id: earning.id }, amount: "100" }], advance: null, ...audit });
    const detail = vi.spyOn(c.finance, "detail");
    const lifecycle = c.service.listEmployeeLifecycle("worker");
    expect(lifecycle.earnings[0]?.remainingAmount).toBe("800.00");
    expect(detail.mock.calls.filter(([accountId]) => accountId === earning.debtAccountId)).toHaveLength(1);
  });

  it("records actual cash against an explicit earning without fabricating a salary period or expected wage, and replays after reopening", () => {
    const f = fixture(key); const c = f.compose(); const earned = c.workforce.approveEarnings(approve);
    const command = { requestId: "cash", employeeId: "worker", currency: "DZD" as const, amount: "25000", paymentDate: "2026-11-11T09:00:00.000Z", wageAllocations: [{ id: "allocation", source: { kind: "EARNING" as const, id: earned.id }, amount: "25000" }], advance: null, ...audit };
    const result = c.service.recordCash(command);
    expect(result).toMatchObject({ employeeId: "worker", amount: "25000.00", paymentDate: command.paymentDate, actorUserId: "operator", createdAt: now, advance: null, wageAllocations: [{ id: "allocation", amount: "25000.00", source: { kind: "EARNING", id: earned.id } }] });
    expect(result).not.toHaveProperty("periodType"); expect(result).not.toHaveProperty("expectedAmountDzd"); expect(result).not.toHaveProperty("days");
    expect(c.finance.remaining(earned.debtEntryId!)).toBe("10000.00");
    expect(c.workforce.getProjectSalaryCost("A").totalAmount).toBe("35000.00");
    expect(c.cash.listCash("worker")).toEqual([result]);
    const reopened = f.reopen(); expect(reopened.service.recordCash({ ...command, transactionId: "00000000-0000-4000-8000-000000000002" })).toEqual(result);
    expect(reopened.cash.listCash("worker")).toEqual([result]);
    expect(reopened.finance.detail(earned.debtAccountId!).entries).toHaveLength(2);
    expect(() => reopened.service.recordCash({ ...command, amount: "20000", wageAllocations: [{ ...command.wageAllocations[0]!, amount: "20000" }] })).toThrow(/replay conflict/);
  });

  it("keeps the opening reminder nonblocking after cash, then records separate wage and advance originals with durable review", () => {
    const f = fixture(key); const c = f.compose(); const earned = c.workforce.approveEarnings(approve);
    expect(c.service.getOpeningStatus("worker")).toEqual({ status: "UNREVIEWED", reminder: true, review: null });
    c.service.recordCash({ requestId: "before-review", employeeId: "worker", currency: "DZD", amount: "1000", paymentDate: now, wageAllocations: [{ id: "pay", source: { kind: "EARNING", id: earned.id }, amount: "1000" }], advance: null, ...audit });
    expect(c.service.getOpeningStatus("worker").reminder).toBe(true);
    const command = { requestId: "opening-review", employeeId: "worker", currency: "DZD" as const, review: { status: "REVIEWED" as const, wagesOwed: "5000", advancesOwed: "2000" }, ...audit };
    const reviewed = c.service.reviewOpening(command);
    expect(reviewed).toMatchObject({ status: "REVIEWED", wagesOwed: "5000.00", advancesOwed: "2000.00", employeeId: "worker", actorUserId: "operator" });
    expect(c.service.getOpeningStatus("worker")).toEqual({ status: "REVIEWED", reminder: false, review: reviewed });
    expect(c.finance.remaining(reviewed.wageDebtEntryId!)).toBe("5000.00");
    expect(c.finance.remaining(reviewed.advanceDebtEntryId!)).toBe("2000.00");
    expect(c.workforce.getProjectSalaryCost("A").totalAmount).toBe("35000.00");
    const reopened = f.reopen(); expect(reopened.service.reviewOpening(command)).toEqual(reviewed);
    expect(() => reopened.service.reviewOpening({ ...command, requestId: "duplicate-review" })).toThrow(/already reviewed/);
    const cash = reopened.service.recordCash({ requestId: "opening-cash", employeeId: "worker", currency: "DZD", amount: "2000", paymentDate: now, wageAllocations: [{ id: "opening-wage", source: { kind: "OPENING", id: reviewed.id }, amount: "2000" }], advance: null, ...audit });
    expect(cash.wageAllocations[0]).toMatchObject({ source: { kind: "OPENING", id: reviewed.id }, amount: "2000.00" });
    expect(reopened.finance.remaining(reviewed.wageDebtEntryId!)).toBe("3000.00");
    expect(reopened.finance.remaining(reviewed.advanceDebtEntryId!)).toBe("2000.00");
  });

  it("classifies above-earned cash only as an explicit recoverable advance without changing approved project cost", () => {
    const f = fixture(key); const c = f.compose(); const earned = c.workforce.approveEarnings(approve);
    const command = { requestId: "above-earned", employeeId: "worker", currency: "DZD" as const, amount: "40000", paymentDate: now, wageAllocations: [{ id: "pay-wage", source: { kind: "EARNING" as const, id: earned.id }, amount: "35000" }], advance: { id: "declared-advance", amount: "5000" }, ...audit };
    expect(() => c.service.recordCash({ ...command, advance: null })).toThrow();
    expect(c.cash.listCash("worker")).toEqual([]);
    expect(c.finance.remaining(earned.debtEntryId!)).toBe("35000.00");
    const result = c.service.recordCash(command);
    expect(result.advance).toMatchObject({ id: "declared-advance", amount: "5000.00" });
    expect(c.finance.remaining(earned.debtEntryId!)).toBe("0.00");
    const account = c.finance.detail(result.advance!.debtAccountId);
    expect(account.account).toMatchObject({ direction: "RECEIVABLE", workerId: "worker", currentBalance: "5000.00" });
    expect(account.entries).toMatchObject([{ entryType: "ADVANCE", signedAmountDzd: "5000.00", remainingDzd: "5000.00", producerType: "PAYROLL_ADVANCE", producerId: "declared-advance" }]);
    expect(c.workforce.getProjectSalaryCost("A").totalAmount).toBe("35000.00");
    const reopened = f.reopen(); expect(reopened.service.recordCash(command)).toEqual(result);
    expect(reopened.cash.listCash("worker")).toEqual([result]);
    expect(reopened.finance.summary()).toMatchObject({ grossPayableDzd: "0.00", grossReceivableDzd: "5000.00" });
  });

  it("repays only the explicitly selected advance and persists its own receipt without netting wages", () => {
    const f = fixture(key); const c = f.compose(); const earned = c.workforce.approveEarnings(approve);
    const cash = c.service.recordCash({ requestId: "advance-only", employeeId: "worker", currency: "DZD", amount: "5000", paymentDate: now, wageAllocations: [], advance: { id: "recoverable", amount: "5000" }, ...audit });
    const command = { requestId: "repay", employeeId: "worker", currency: "DZD" as const, source: { kind: "ADVANCE" as const, id: "recoverable" }, amount: "2000", paymentDate: "2026-11-12T08:00:00.000Z", ...audit };
    const repaid = c.service.repayAdvance(command);
    expect(repaid).toMatchObject({ employeeId: "worker", source: command.source, amount: "2000.00", paymentDate: command.paymentDate, actorUserId: "operator" });
    expect(c.finance.remaining(cash.advance!.debtEntryId)).toBe("3000.00");
    expect(c.finance.remaining(earned.debtEntryId!)).toBe("35000.00");
    const reopened = f.reopen(); expect(reopened.service.repayAdvance(command)).toEqual(repaid);
    expect(reopened.service.repayAdvance({ ...command, requestId: "repay-rest", amount: "3000" }).amount).toBe("3000.00");
    expect(reopened.finance.remaining(cash.advance!.debtEntryId)).toBe("0.00");
    expect(reopened.finance.remaining(earned.debtEntryId!)).toBe("35000.00");
    expect(() => reopened.service.repayAdvance({ ...command, requestId: "paid-again", amount: "0.01" })).toThrow();
    expect(reopened.workforce.getProjectSalaryCost("A").totalAmount).toBe("35000.00");
  });

  it("rolls back earlier wage payments and receipts if a later explicit allocation fails", () => {
    const f = fixture(key); const c = f.compose(); const earned = c.workforce.approveEarnings(approve);
    const command = { requestId: "two-targets", employeeId: "worker", currency: "DZD" as const, amount: "25000", paymentDate: now, wageAllocations: [{ id: "valid", source: { kind: "EARNING" as const, id: earned.id }, amount: "20000" }, { id: "missing", source: { kind: "EARNING" as const, id: "absent" }, amount: "5000" }], advance: null, ...audit };
    expect(() => c.service.recordCash(command)).toThrow(/Wage source not found/);
    expect(c.finance.detail(earned.debtAccountId!).entries).toHaveLength(1);
    expect(c.finance.remaining(earned.debtEntryId!)).toBe("35000.00");
    expect(c.cash.listCash("worker")).toEqual([]);
    expect(c.service.recordCash({ ...command, amount: "20000", wageAllocations: [command.wageAllocations[0]!] }).amount).toBe("20000.00");
  });

  it("rolls back opening, repayment and correction sources when the aggregate receipt fails", () => {
    const f = fixture(key); const c = f.compose();
    const openingCommand = { requestId: "opening-receipt-failure", employeeId: "worker", currency: "DZD" as const, review: { status: "REVIEWED" as const, wagesOwed: "0", advancesOwed: "1000" }, ...audit };
    vi.spyOn(c.ledger, "saveAggregateCommand").mockImplementationOnce(() => { throw new Error("opening receipt failure"); });
    expect(() => c.service.reviewOpening(openingCommand)).toThrow("opening receipt failure");
    expect(c.cash.getEmployeeOpening("worker")).toBeNull();
    expect(c.finance.listAccounts()).toEqual([]);
    const opening = c.service.reviewOpening(openingCommand);
    const repayCommand = { requestId: "repayment-receipt-failure", employeeId: "worker", currency: "DZD" as const, source: { kind: "OPENING_ADVANCE" as const, id: opening.id }, amount: "250", paymentDate: now, ...audit };
    vi.spyOn(c.ledger, "saveAggregateCommand").mockImplementationOnce(() => { throw new Error("repayment receipt failure"); });
    expect(() => c.service.repayAdvance(repayCommand)).toThrow("repayment receipt failure");
    expect(c.cash.listSettlements("worker")).toEqual([]);
    expect(c.finance.remaining(opening.advanceDebtEntryId!)).toBe("1000.00");
    const settlement = c.service.repayAdvance(repayCommand);
    expect(settlement.amount).toBe("250.00");
    const earning = c.workforce.approveEarnings(approve);
    const correctionCommand = { requestId: "correction-receipt-failure", employeeId: "worker", currency: "DZD" as const, earningId: earning.id, newAmount: "36000", reason: "Receipt retry", ...audit };
    vi.spyOn(c.ledger, "saveAggregateCommand").mockImplementationOnce(() => { throw new Error("correction receipt failure"); });
    expect(() => c.service.correctEarning(correctionCommand)).toThrow("correction receipt failure");
    expect(c.cash.listCorrections("worker")).toEqual([]);
    expect(c.finance.remaining(earning.debtEntryId!)).toBe("35000.00");
    const correction = c.service.correctEarning(correctionCommand);
    expect(correction.newAmount).toBe("36000.00");
    expect(c.finance.remaining(earning.debtEntryId!)).toBe("36000.00");
  });

  it("rolls back source, wage payments, advances and child receipts if the aggregate receipt cannot persist", () => {
    const f = fixture(key); const c = f.compose(); const earned = c.workforce.approveEarnings(approve);
    const command = { requestId: "receipt-failure", employeeId: "worker", currency: "DZD" as const, amount: "40000", paymentDate: now, wageAllocations: [{ id: "wage", source: { kind: "EARNING" as const, id: earned.id }, amount: "35000" }], advance: { id: "advance", amount: "5000" }, ...audit };
    vi.spyOn(c.ledger, "saveAggregateCommand").mockImplementationOnce(() => { throw new Error("cash receipt failure"); });
    expect(() => c.service.recordCash(command)).toThrow("cash receipt failure");
    expect(c.cash.listCash("worker")).toEqual([]);
    expect(c.finance.detail(earned.debtAccountId!).entries).toHaveLength(1);
    expect(c.finance.listAccounts()).toHaveLength(1);
    const reopened = f.reopen(); const result = reopened.service.recordCash(command);
    expect(reopened.cash.listCash("worker")).toEqual([result]);
    expect(reopened.finance.listAccounts()).toHaveLength(2);
  });
});
