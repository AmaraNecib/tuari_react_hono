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

function fixture() {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-payroll-coverage-")), "fixture.sqlite");
  const db = createDatabaseConnection(path, "");
  close.push(() => db.close());
  const lock = createFifoLock();
  let id = 0;
  const deps = { id: () => `coverage-${++id}`, now: () => now };
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE role(id TEXT PRIMARY KEY); CREATE TABLE project(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO role VALUES ('worker-role'); INSERT INTO project VALUES ('A')");
  for (const sql of [...exactWorkforceSchemaStatements, ...exactDebtSchemaStatements, ...exactWorkforceEarningSchemaStatements]) db.exec(sql);
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('worker','First','Worker','0550000000','worker-role','ACTIVE',?,?)").run(now, now);
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('other-worker','Other','Worker','0550000001','worker-role','ACTIVE',?,?)").run(now, now);
  const ledger = new SqliteExactFinanceRepository(db, lock);
  const finance = new ExactFinanceService(ledger, deps);
  const earnings = new SqliteExactWorkforceRepository(db, lock);
  const cash = new SqlitePayrollCashRepository(db, lock);
  const workforce = new ExactWorkforceService(earnings, finance, deps);
  const service = new PayrollCashService(cash, earnings, finance, deps);
  return { db, ledger, finance, earnings, cash, workforce, service };
}

const approve = { requestId: "coverage-earning", employeeId: "worker", currency: "DZD" as const, periodStart: "2026-10-01", periodEnd: "2026-10-31", approvedAmount: "35000", unallocatedAmount: "0", segments: [{ id: "project", projectId: "A", amount: "35000" }], ...audit };

describe("payroll cash source validation", () => {
  it("rejects missing employees and sources through every lifecycle mutation", () => {
    const f = fixture();
    expect(() => f.service.listEmployeeLifecycle("missing")).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Employee not found" }));
    expect(() => f.service.getOpeningStatus("missing")).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Employee not found" }));
    expect(() => f.service.reviewOpening({ requestId: "missing-review", employeeId: "missing", currency: "DZD", review: { status: "UNREVIEWED" }, ...audit })).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Employee not found" }));
    expect(() => f.service.repayAdvance({ requestId: "missing-repayment", employeeId: "missing", currency: "DZD", source: { kind: "ADVANCE", id: "absent" }, amount: "1", paymentDate: now, ...audit })).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Employee not found" }));
    expect(() => f.service.repayAdvance({ requestId: "missing-advance", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "absent" }, amount: "1", paymentDate: now, ...audit })).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Advance source not found" }));
    expect(() => f.service.correctEarning({ requestId: "missing-correction", employeeId: "worker", currency: "DZD", earningId: "absent", newAmount: "1", reason: "Missing earning", ...audit })).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Positive original earning not found" }));
    expect(() => f.service.recordCash({ requestId: "missing-wage-source", employeeId: "worker", currency: "DZD", amount: "1", paymentDate: now, wageAllocations: [{ id: "missing-allocation", source: { kind: "EARNING", id: "absent" }, amount: "1" }], advance: null, ...audit })).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Wage source not found" }));
    expect(f.cash.listCash("worker")).toEqual([]);
    expect(f.finance.listAccounts()).toEqual([]);
  });

  it("lists zero earnings and unreviewed or zero-reviewed opening balances without inventing debt", () => {
    const f = fixture();
    f.workforce.approveEarnings({ ...approve, requestId: "zero-earning", approvedAmount: "0", unallocatedAmount: "0", segments: [] });
    const empty = f.service.listEmployeeLifecycle("worker");
    expect(empty.opening).toBeNull();
    expect(empty.earnings).toMatchObject([{ remainingAmount: "0.00" }]);
    expect(empty.advances).toEqual([]);

    const unreviewed = f.service.reviewOpening({ requestId: "unreviewed-opening", employeeId: "other-worker", currency: "DZD", review: { status: "UNREVIEWED" }, ...audit });
    expect(f.service.getOpeningStatus("other-worker")).toEqual({ status: "UNREVIEWED", reminder: true, review: unreviewed });
    expect(f.service.listEmployeeLifecycle("other-worker").opening).toMatchObject({ wagesRemaining: null, advancesRemaining: null, reminder: true });
    expect(f.finance.listAccounts()).toEqual([]);

    const zeroReview = f.service.reviewOpening({ requestId: "zero-opening", employeeId: "worker", currency: "DZD", review: { status: "REVIEWED", wagesOwed: "0", advancesOwed: "0" }, ...audit });
    expect(f.service.listEmployeeLifecycle("worker").opening).toMatchObject({ id: zeroReview.id, wagesRemaining: "0.00", advancesRemaining: "0.00", reminder: false });
    expect(f.finance.listAccounts()).toEqual([]);
  });

  it("caches lifecycle debt detail across distinct earnings for the same worker account", () => {
    const f = fixture();
    const first = f.workforce.approveEarnings({ ...approve, requestId: "cached-earning-one" });
    const second = f.workforce.approveEarnings({ ...approve, requestId: "cached-earning-two", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
    const detail = vi.spyOn(f.finance, "detail");
    const lifecycle = f.service.listEmployeeLifecycle("worker");
    expect(lifecycle.earnings.map(row => row.earning.id)).toEqual([first.id, second.id]);
    expect(lifecycle.earnings.map(row => row.remainingAmount)).toEqual(["35000.00", "35000.00"]);
    expect(detail.mock.calls.filter(([accountId]) => accountId === first.debtAccountId)).toHaveLength(1);
  });

  it("rejects correction below the amount already paid and repays an opening advance by its explicit source", () => {
    const f = fixture();
    const earning = f.workforce.approveEarnings(approve);
    f.service.recordCash({ requestId: "paid-wage", employeeId: "worker", currency: "DZD", amount: "10000", paymentDate: now, wageAllocations: [{ id: "paid-allocation", source: { kind: "EARNING", id: earning.id }, amount: "10000" }], advance: null, ...audit });
    expect(() => f.service.correctEarning({ requestId: "below-paid", employeeId: "worker", currency: "DZD", earningId: earning.id, newAmount: "9999", reason: "Below cash paid", ...audit })).toThrow(expect.objectContaining({ code: "CONFLICT", message: "Correction below paid amount requires an owner-selected treatment" }));
    expect(f.finance.remaining(earning.debtEntryId!)).toBe("25000.00");

    const opening = f.service.reviewOpening({ requestId: "opening-advance", employeeId: "other-worker", currency: "DZD", review: { status: "REVIEWED", wagesOwed: "0", advancesOwed: "1000" }, ...audit });
    const settlement = f.service.repayAdvance({ requestId: "opening-advance-repay", employeeId: "other-worker", currency: "DZD", source: { kind: "OPENING_ADVANCE", id: opening.id }, amount: "250", paymentDate: now, ...audit });
    expect(settlement).toMatchObject({ source: { kind: "OPENING_ADVANCE", id: opening.id }, amount: "250.00" });
    expect(f.finance.remaining(opening.advanceDebtEntryId!)).toBe("750.00");
    expect(f.service.listEmployeeLifecycle("other-worker").settlements).toEqual([settlement]);
  });

  it("rejects a service composition whose repositories do not share one FIFO", () => {
    const f = fixture();
    const financeWithDifferentLock = new ExactFinanceService(new SqliteExactFinanceRepository(f.db, createFifoLock()), { id: () => "unused", now: () => now });
    const mismatched = new PayrollCashService(f.cash, f.earnings, financeWithDifferentLock, { id: () => "unused", now: () => now });
    expect(() => mismatched.listEmployeeLifecycle("worker")).toThrow("Payroll cash requires the same connection and shared FIFO");
  });

  it("refuses mismatched advance and wage ledger reads without recording a settlement or cash receipt", () => {
    const advanceFixture = fixture();
    const cash = advanceFixture.service.recordCash({ requestId: "guarded-advance", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [], advance: { id: "guarded-advance-source", amount: "500" }, ...audit });
    const advanceDetail = advanceFixture.finance.detail(cash.advance!.debtAccountId);
    vi.spyOn(advanceFixture.finance, "detail").mockReturnValue({ ...advanceDetail, account: { ...advanceDetail.account, workerId: "other-worker" } });
    expect(() => advanceFixture.service.repayAdvance({ requestId: "mismatched-advance-account", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "guarded-advance-source" }, amount: "100", paymentDate: now, ...audit })).toThrow("Advance source account mismatch");
    expect(advanceFixture.cash.listSettlements("worker")).toEqual([]);

    const wageFixture = fixture();
    const earning = wageFixture.workforce.approveEarnings(approve);
    const detail = wageFixture.finance.detail(earning.debtAccountId!);
    vi.spyOn(wageFixture.finance, "detail").mockReturnValue({ ...detail, entries: detail.entries.map(entry => entry.id === earning.debtEntryId ? { ...entry, signedAmountDzd: "34999.00" } : entry) });
    expect(() => wageFixture.service.recordCash({ requestId: "mismatched-wage-ledger", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [{ id: "guarded-allocation", source: { kind: "EARNING", id: earning.id }, amount: "500" }], advance: null, ...audit })).toThrow("Wage source ledger mismatch");
    expect(wageFixture.finance.remaining(earning.debtEntryId!)).toBe("35000.00");
    expect(wageFixture.cash.listCash("worker")).toEqual([]);
  });
  it("rejects a missing employee before creating cash or a ledger account", () => {
    const f = fixture();
    const command = { requestId: "missing-worker-cash", employeeId: "missing-worker", currency: "DZD" as const, amount: "100", paymentDate: now, wageAllocations: [], advance: { id: "unused-advance", amount: "100" }, ...audit };
    expect(() => f.service.recordCash(command)).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Employee not found" }));
    expect(f.cash.listCash("missing-worker")).toEqual([]);
    expect(f.finance.listAccounts()).toEqual([]);
  });

  it("refuses inconsistent opening and cash reads at the repository trust boundary", () => {
    const openingFixture = fixture();
    const opening = openingFixture.service.reviewOpening({ requestId: "guard-opening", employeeId: "worker", currency: "DZD", review: { status: "REVIEWED", wagesOwed: "500", advancesOwed: "0" }, ...audit });
    vi.spyOn(openingFixture.cash, "getEmployeeOpening").mockReturnValue({ ...opening, wageDebtEntryId: null });
    expect(() => openingFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll opening source link mismatch");

    const openingLedgerFixture = fixture();
    const linkedOpening = openingLedgerFixture.service.reviewOpening({ requestId: "guard-opening-ledger", employeeId: "worker", currency: "DZD", review: { status: "REVIEWED", wagesOwed: "500", advancesOwed: "0" }, ...audit });
    const openingDetail = openingLedgerFixture.finance.detail(linkedOpening.wageDebtAccountId!);
    vi.spyOn(openingLedgerFixture.finance, "detail").mockReturnValue({ ...openingDetail, entries: openingDetail.entries.map(entry => entry.id === linkedOpening.wageDebtEntryId ? { ...entry, producerId: "wrong-opening" } : entry) });
    expect(() => openingLedgerFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll opening source ledger mismatch");

    const openingDefaultFixture = fixture();
    const defaultOpening = openingDefaultFixture.service.reviewOpening({ requestId: "guard-opening-default", employeeId: "worker", currency: "DZD", review: { status: "REVIEWED", wagesOwed: "500", advancesOwed: "500" }, ...audit });
    const defaultDetail = openingDefaultFixture.finance.detail(defaultOpening.wageDebtAccountId!);
    vi.spyOn(openingDefaultFixture.finance, "detail").mockReturnValue({ ...defaultDetail, entries: [] });
    expect(() => openingDefaultFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll opening source ledger mismatch");

    const cashFixture = fixture();
    const earning = cashFixture.workforce.approveEarnings(approve);
    const payment = cashFixture.service.recordCash({ requestId: "guard-cash-source", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [{ id: "guard-allocation", source: { kind: "EARNING", id: earning.id }, amount: "500" }], advance: null, ...audit });
    vi.spyOn(cashFixture.cash, "listCash").mockReturnValue([{ ...payment, wageAllocations: payment.wageAllocations.map(allocation => ({ ...allocation, source: { kind: "EARNING", id: "missing-earning" } })) }]);
    expect(() => cashFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll cash source ledger mismatch");
  });

  it("refuses incomplete settlement targets at the repository trust boundary", () => {
    const f = fixture();
    const payment = f.service.recordCash({ requestId: "incomplete-settlement-target", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [], advance: { id: "incomplete-target-advance", amount: "500" }, ...audit });
    f.service.repayAdvance({ requestId: "incomplete-settlement-payment", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "incomplete-target-advance" }, amount: "100", paymentDate: now, ...audit });
    const advance = f.cash.getAdvance(payment.advance!.id)!;
    const readAdvance = f.cash.getAdvance.bind(f.cash);
    vi.spyOn(f.cash, "getAdvance").mockImplementation(id => id === advance.id ? { ...advance, debtAccountId: undefined } as never : readAdvance(id));
    expect(() => f.service.listEmployeeLifecycle("worker")).toThrow("Payroll settlement source ledger mismatch");
  });

  it("refuses mismatched ledger provenance for advances, settlements, and corrections", () => {
    const advanceFixture = fixture();
    const advanceCash = advanceFixture.service.recordCash({ requestId: "guard-advance-source", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [], advance: { id: "guard-advance", amount: "500" }, ...audit });
    const advanceDetail = advanceFixture.finance.detail(advanceCash.advance!.debtAccountId);
    vi.spyOn(advanceFixture.finance, "detail").mockReturnValue({ ...advanceDetail, entries: advanceDetail.entries.map(entry => entry.id === advanceCash.advance!.debtEntryId ? { ...entry, producerId: "other-producer" } : entry) });
    expect(() => advanceFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll advance source ledger mismatch");

    const advanceEntryFixture = fixture();
    const advanceEntryCash = advanceEntryFixture.service.recordCash({ requestId: "guard-advance-entry", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [], advance: { id: "guard-advance-entry-source", amount: "500" }, ...audit });
    const advanceEntryDetail = advanceEntryFixture.finance.detail(advanceEntryCash.advance!.debtAccountId);
    vi.spyOn(advanceEntryFixture.finance, "detail").mockReturnValue({ ...advanceEntryDetail, entries: advanceEntryDetail.entries.map(entry => entry.id === advanceEntryCash.advance!.debtEntryId ? { ...entry, producerId: "wrong-advance" } : entry) });
    expect(() => advanceEntryFixture.service.repayAdvance({ requestId: "guard-advance-entry-repay", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "guard-advance-entry-source" }, amount: "100", paymentDate: now, ...audit })).toThrow("Advance source ledger mismatch");
    expect(advanceEntryFixture.cash.listSettlements("worker")).toEqual([]);

    const settlementFixture = fixture();
    settlementFixture.service.recordCash({ requestId: "settlement-advance", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [], advance: { id: "settlement-source", amount: "500" }, ...audit });
    settlementFixture.service.repayAdvance({ requestId: "settlement-payment", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "settlement-source" }, amount: "100", paymentDate: now, ...audit });
    const settlement = settlementFixture.cash.listSettlements("worker")[0]!;
    vi.spyOn(settlementFixture.cash, "listSettlements").mockReturnValue([{ ...settlement, debtEntryId: "mismatched-entry" }]);
    expect(() => settlementFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll settlement source ledger mismatch");

    const settlementAccountFixture = fixture();
    settlementAccountFixture.service.recordCash({ requestId: "settlement-account-advance", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [], advance: { id: "settlement-account-source", amount: "500" }, ...audit });
    settlementAccountFixture.service.repayAdvance({ requestId: "settlement-account-payment", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "settlement-account-source" }, amount: "100", paymentDate: now, ...audit });
    const settlementAccount = settlementAccountFixture.cash.listSettlements("worker")[0]!.debtAccountId;
    vi.spyOn(settlementAccountFixture.cash, "listCash").mockReturnValue([]);
    const correctAccount = settlementAccountFixture.finance.getAccount(settlementAccount);
    const readAccount = settlementAccountFixture.finance.getAccount.bind(settlementAccountFixture.finance);
    vi.spyOn(settlementAccountFixture.finance, "getAccount").mockImplementation(id => id === settlementAccount ? { ...correctAccount, workerId: "other-worker" } : readAccount(id));
    expect(() => settlementAccountFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll settlement account mismatch");

    const correctionFixture = fixture();
    const earning = correctionFixture.workforce.approveEarnings(approve);
    correctionFixture.service.correctEarning({ requestId: "correction-source", employeeId: "worker", currency: "DZD", earningId: earning.id, newAmount: "36000", reason: "Create lifecycle correction", ...audit });
    const correction = correctionFixture.cash.listCorrections("worker")[0]!;
    vi.spyOn(correctionFixture.cash, "listCorrections").mockReturnValue([{ ...correction, earningId: "missing-earning" }]);
    expect(() => correctionFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll correction source ledger mismatch");

    const correctionAccountFixture = fixture();
    const accountEarning = correctionAccountFixture.workforce.approveEarnings(approve);
    correctionAccountFixture.service.correctEarning({ requestId: "correction-account-source", employeeId: "worker", currency: "DZD", earningId: accountEarning.id, newAmount: "36000", reason: "Check correction account", ...audit });
    const correctionAccount = correctionAccountFixture.finance.getAccount(accountEarning.debtAccountId!);
    vi.spyOn(correctionAccountFixture.finance, "getAccount").mockReturnValue({ ...correctionAccount, direction: "RECEIVABLE" });
    expect(() => correctionAccountFixture.service.listEmployeeLifecycle("worker")).toThrow("Payroll correction account mismatch");
  });

  it("rejects missing earning ledger links and a missing live advance balance from repository reads", () => {
    const missingAccount = fixture();
    const zeroEarning = missingAccount.workforce.approveEarnings({ ...approve, requestId: "missing-account-earning", approvedAmount: "0", unallocatedAmount: "0", segments: [] });
    vi.spyOn(missingAccount.earnings, "listEarnings").mockReturnValue([{ ...zeroEarning, debtEntryId: "unexpected-entry", debtAccountId: null }]);
    expect(() => missingAccount.service.listEmployeeLifecycle("worker")).toThrow("Live debt entry not found");

    const missingEntry = fixture();
    const earning = missingEntry.workforce.approveEarnings(approve);
    vi.spyOn(missingEntry.earnings, "listEarnings").mockReturnValue([{ ...earning, debtEntryId: "missing-entry" }]);
    expect(() => missingEntry.service.listEmployeeLifecycle("worker")).toThrow("Live debt entry not found");

    const missingAdvanceBalance = fixture();
    const payment = missingAdvanceBalance.service.recordCash({ requestId: "missing-advance-balance", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [], advance: { id: "missing-balance-advance", amount: "500" }, ...audit });
    const detail = missingAdvanceBalance.finance.detail(payment.advance!.debtAccountId);
    vi.spyOn(missingAdvanceBalance.finance, "detail").mockReturnValue({ ...detail, entries: detail.entries.map(entry => entry.id === payment.advance!.debtEntryId ? { ...entry, remainingDzd: null } : entry) });
    expect(() => missingAdvanceBalance.service.listEmployeeLifecycle("worker")).toThrow("Payroll advance source ledger mismatch");
  });

  it("rejects a mismatched wage account and earning-ledger read without payment or correction", () => {
    const accountFixture = fixture();
    const earning = accountFixture.workforce.approveEarnings(approve);
    const account = accountFixture.finance.getAccount(earning.debtAccountId!);
    vi.spyOn(accountFixture.finance, "getAccount").mockReturnValue({ ...account, direction: "RECEIVABLE" });
    expect(() => accountFixture.service.recordCash({ requestId: "wrong-wage-account", employeeId: "worker", currency: "DZD", amount: "500", paymentDate: now, wageAllocations: [{ id: "wrong-account-allocation", source: { kind: "EARNING", id: earning.id }, amount: "500" }], advance: null, ...audit })).toThrow("Wage source account mismatch");
    expect(accountFixture.finance.remaining(earning.debtEntryId!)).toBe("35000.00");
    expect(accountFixture.cash.listCash("worker")).toEqual([]);

    const ledgerFixture = fixture();
    const ledgerEarning = ledgerFixture.workforce.approveEarnings(approve);
    const detail = ledgerFixture.finance.detail(ledgerEarning.debtAccountId!);
    vi.spyOn(ledgerFixture.finance, "detail").mockReturnValue({ ...detail, entries: detail.entries.map(entry => entry.id === ledgerEarning.debtEntryId ? { ...entry, producerId: "unexpected-producer" } : entry) });
    expect(() => ledgerFixture.service.correctEarning({ requestId: "wrong-correction-ledger", employeeId: "worker", currency: "DZD", earningId: ledgerEarning.id, newAmount: "36000", reason: "Mismatched source read", ...audit })).toThrow("Earning source ledger mismatch");
    expect(ledgerFixture.cash.listCorrections("worker")).toEqual([]);
    expect(ledgerFixture.finance.remaining(ledgerEarning.debtEntryId!)).toBe("35000.00");
  });

  it("rejects an earning owned by another employee without paying down its debt", () => {
    const f = fixture();
    const earning = f.workforce.approveEarnings(approve);
    const command = { requestId: "foreign-earning-cash", employeeId: "other-worker", currency: "DZD" as const, amount: "500", paymentDate: now, wageAllocations: [{ id: "foreign-allocation", source: { kind: "EARNING" as const, id: earning.id }, amount: "500" }], advance: null, ...audit };
    expect(() => f.service.recordCash(command)).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Wage source not found" }));
    expect(f.finance.remaining(earning.debtEntryId!)).toBe("35000.00");
    expect(f.cash.listCash("other-worker")).toEqual([]);
  });

  it("returns reviewed opening, corrected earning, cash, advance, and settlement lifecycle amounts", () => {
    const f = fixture();
    const opening = f.service.reviewOpening({ requestId: "lifecycle-opening", employeeId: "worker", currency: "DZD", review: { status: "REVIEWED", wagesOwed: "5000", advancesOwed: "1000" }, ...audit });
    f.service.recordCash({ requestId: "lifecycle-cash", employeeId: "worker", currency: "DZD", amount: "1500", paymentDate: now, wageAllocations: [{ id: "opening-allocation", source: { kind: "OPENING", id: opening.id }, amount: "1000" }], advance: { id: "lifecycle-advance", amount: "500" }, ...audit });
    f.service.repayAdvance({ requestId: "lifecycle-repayment", employeeId: "worker", currency: "DZD", source: { kind: "ADVANCE", id: "lifecycle-advance" }, amount: "200", paymentDate: now, ...audit });
    const earning = f.workforce.approveEarnings(approve);
    f.service.correctEarning({ requestId: "lifecycle-correction", employeeId: "worker", currency: "DZD", earningId: earning.id, newAmount: "36000", reason: "Lifecycle correction", ...audit });

    const lifecycle = f.service.listEmployeeLifecycle("worker");
    expect(lifecycle.opening).toMatchObject({ id: opening.id, wagesRemaining: "4000.00", advancesRemaining: "1000.00", reminder: false });
    expect(lifecycle.earnings).toMatchObject([{ earning: { id: earning.id }, remainingAmount: "36000.00" }]);
    expect(lifecycle.cash).toHaveLength(1);
    expect(lifecycle.advances).toMatchObject([{ id: "lifecycle-advance", amount: "500.00", remainingAmount: "300.00" }]);
    expect(lifecycle.settlements).toMatchObject([{ source: { kind: "ADVANCE", id: "lifecycle-advance" }, amount: "200.00" }]);
    expect(lifecycle.corrections).toMatchObject([{ earningId: earning.id, previousAmount: "35000.00", newAmount: "36000.00" }]);
  });
});
