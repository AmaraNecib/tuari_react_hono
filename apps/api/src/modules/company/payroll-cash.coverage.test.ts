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
  it("rejects a missing employee before creating cash or a ledger account", () => {
    const f = fixture();
    const command = { requestId: "missing-worker-cash", employeeId: "missing-worker", currency: "DZD" as const, amount: "100", paymentDate: now, wageAllocations: [], advance: { id: "unused-advance", amount: "100" }, ...audit };
    expect(() => f.service.recordCash(command)).toThrow(expect.objectContaining({ code: "NOT_FOUND", message: "Employee not found" }));
    expect(f.cash.listCash("missing-worker")).toEqual([]);
    expect(f.finance.listAccounts()).toEqual([]);
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
