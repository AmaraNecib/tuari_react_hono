import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { exactWorkforceSchemaStatements } from "./exact-workforce-schema";
import { exactWorkforceEarningSchemaStatements } from "./exact-workforce-earning-schema";
import { exactDebtSchemaStatements } from "./exact-finance-schema";
import { SqliteExactFinanceRepository } from "./sqlite-exact-finance.repository";
import { SqliteExactWorkforceRepository } from "./sqlite-exact-workforce.repository";
import { ExactFinanceService } from "../exact-finance.service";
import { ExactWorkforceService } from "../workforce-exact.service";

const close: (() => void)[] = [];
afterEach(() => { for (const cleanup of close.splice(0)) cleanup(); });
const time = "2026-11-11T00:00:00.000Z";
const dependencies = { id: randomUUID, now: () => time };
const approval = {
  requestId: "approve-october", employeeId: "worker", currency: "DZD" as const,
  periodStart: "2026-10-01", periodEnd: "2026-10-31", approvedAmount: "90071992547409.93", unallocatedAmount: "0.03",
  segments: [
    { id: "first", projectId: "A", amount: "90071992547409.60", days: 5 },
    { id: "second", projectId: "B", amount: "0.20" },
    { id: "third", projectId: "A", amount: "0.10", days: 7 },
  ],
  actorUserId: "operator", actorLabel: "Operator", transactionId: "audit-1",
};

function setup(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-527-earnings-")), "fixture.sqlite");
  let db = createDatabaseConnection(path, key);
  const lock = createFifoLock();
  close.push(() => db.close());
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE role(id TEXT PRIMARY KEY); CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE project(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); INSERT INTO role VALUES ('worker'); INSERT INTO project VALUES ('A'),('B'); INSERT INTO user VALUES ('operator')");
  for (const sql of [...exactWorkforceSchemaStatements, ...exactDebtSchemaStatements, ...exactWorkforceEarningSchemaStatements]) db.exec(sql);
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('worker','Test','Worker','0550000000','worker','ACTIVE',?,?)").run(time, time);
  const compose = () => {
    const ledger = new SqliteExactFinanceRepository(db, lock);
    const repository = new SqliteExactWorkforceRepository(db, lock);
    const finance = new ExactFinanceService(ledger, dependencies);
    return { ledger, repository, finance, service: new ExactWorkforceService(repository, finance, dependencies) };
  };
  return {
    get db() { return db; }, lock, compose,
    openPeer() { const peer = createDatabaseConnection(path, key); close.push(() => peer.close()); return peer; },
    reopen() { db.close(); db = createDatabaseConnection(path, key); db.pragma("foreign_keys=ON"); return compose(); },
  };
}

describe.each([["plain", ""], ["keyed", "527-public-synthetic-key"]])("native exact payroll approval %s", (_kind, key) => {
  it("preserves large exact wages, A/B/A ordering, optional days and shared durable receipt across reopen", () => {
    const fixture = setup(key);
    const { service, repository } = fixture.compose();
    const result = service.approveEarnings(approval);
    expect(repository.getEarning(result.id)).toEqual(result);
    expect(repository.listEarnings("worker")).toEqual([result]);
    expect(fixture.db.prepare("SELECT typeof(approved_amount_minor) AS kind,CAST(approved_amount_minor AS TEXT) AS units FROM employee_salary_earning").get()).toEqual({ kind: "integer", units: "9007199254740993" });
    expect(fixture.db.prepare("SELECT ordinal,days FROM employee_salary_earning_segment ORDER BY ordinal").all()).toEqual([{ ordinal: 0, days: 5 }, { ordinal: 1, days: null }, { ordinal: 2, days: 7 }]);
    const reopened = fixture.reopen();
    expect(reopened.repository.getEarning(result.id)).toEqual(result);
    expect(reopened.service.approveEarnings(approval)).toEqual(result);
    expect(reopened.repository.listEarnings("worker")).toEqual([result]);
    expect(reopened.finance.remaining(result.debtEntryId!)).toBe("90071992547409.93");
    expect(reopened.finance.detail(result.debtAccountId!).entries).toHaveLength(1);
    expect(() => reopened.service.approveEarnings({ ...approval, unallocatedAmount: "0.04", approvedAmount: "90071992547409.94" })).toThrow(/replay conflict/);
    expect(reopened.repository.getEarning("absent")).toBeNull();
    expect(reopened.repository.listEarnings("absent")).toEqual([]);
  });

  it("allows segment identities to repeat across separate earnings without deduplicating A/B/A projects", () => {
    const fixture = setup(key);
    const { service, repository, finance } = fixture.compose();
    const first = service.approveEarnings(approval);
    const second = service.approveEarnings({ ...approval, requestId: "approve-november", periodStart: "2026-11-01", periodEnd: "2026-11-30", approvedAmount: "0.30", unallocatedAmount: "0", segments: approval.segments.map(segment => ({ ...segment, amount: "0.10" })) });
    expect(second.debtAccountId).toBe(first.debtAccountId);
    expect(second.debtEntryId).not.toBe(first.debtEntryId);
    expect(repository.getEarning(first.id)).toEqual(first);
    expect(repository.getEarning(second.id)).toEqual(second);
    expect(repository.listEarnings("worker")).toHaveLength(2);
    expect(finance.remaining(second.debtEntryId!)).toBe("0.30");
    expect(finance.detail(first.debtAccountId!).entries).toHaveLength(2);
  });

  it("acquires the immediate write reservation before a transaction callback can read", () => {
    const fixture = setup(key);
    const { repository } = fixture.compose();
    const peer = fixture.openPeer();
    fixture.db.pragma("busy_timeout=1");
    peer.exec("BEGIN IMMEDIATE");
    const callback = vi.fn(() => "read-only callback");
    try { expect(() => repository.withTransaction(callback)).toThrow(/locked/); }
    finally { peer.exec("ROLLBACK"); }
    expect(callback).not.toHaveBeenCalled();
    expect(repository.withTransaction(callback)).toBe("read-only callback");
  });

  it("refuses missing/versioned markers and wrongly typed monetary columns before use", () => {
    const fixture = setup(key);
    fixture.db.prepare("UPDATE exact_money_schema SET version=2 WHERE slice='workforce'").run();
    expect(() => fixture.compose()).toThrow(/version 1/);
    fixture.db.prepare("UPDATE exact_money_schema SET version=1 WHERE slice='workforce'").run();
    fixture.db.exec("ALTER TABLE employee_salary_earning RENAME COLUMN approved_amount_minor TO wrong_units; ALTER TABLE employee_salary_earning ADD COLUMN approved_amount_minor REAL");
    expect(() => fixture.compose()).toThrow(/Invalid exact workforce column.*approved_amount_minor/);
    const unmarked = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-527-unmarked-")), "fixture.sqlite"), key);
    try { expect(() => new SqliteExactWorkforceRepository(unmarked, createFifoLock())).toThrow(/marker/); }
    finally { unmarked.close(); }
  });

  it("rejects a borrowed ledger original and negative or non-integer source units", () => {
    const fixture = setup(key);
    const { service, repository } = fixture.compose();
    const result = service.approveEarnings(approval);
    expect(() => repository.saveEarning({ ...result, id: "borrowed-source" })).toThrow(/immutable|matching payroll original/);
    expect(repository.getEarning("borrowed-source")).toBeNull();
    const insert = fixture.db.prepare("INSERT INTO employee_salary_earning(id,employee_id,currency,period_start,period_end,approved_amount_minor,unallocated_amount_minor,created_at) VALUES (?,'worker','DZD','2026-10-01','2026-10-31',?,0,?)");
    expect(() => insert.run("negative", -1n, time)).toThrow(/CHECK/);
    expect(() => insert.run("fraction", 0.5, time)).toThrow(/CHECK/);
    expect(() => fixture.db.prepare("INSERT INTO employee_salary_earning_segment(earning_id,id,ordinal,project_id,amount_minor,days) VALUES (?,?,?,'A',?,?)").run(result.id, "invalid-day", 3, 0n, 0)).toThrow(/CHECK/);
    expect(repository.getEarning(result.id)).toEqual(result);
  });

  it("rolls source, segments, ledger and nested receipts back on aggregate receipt failure, then retries after reopen", () => {
    const fixture = setup(key);
    const { service, ledger, finance, repository } = fixture.compose();
    vi.spyOn(ledger, "saveAggregateCommand").mockImplementationOnce(() => { throw new Error("receipt failure"); });
    expect(() => service.approveEarnings(approval)).toThrow("receipt failure");
    expect(repository.listEarnings("worker")).toEqual([]);
    expect(finance.listAccounts()).toEqual([]);
    for (const table of ["employee_salary_earning", "employee_salary_earning_segment", "debt_entry", "debt_command", "exact_finance_command"]) {
      expect(fixture.db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }
    const reopened = fixture.reopen();
    const result = reopened.service.approveEarnings(approval);
    expect(reopened.repository.getEarning(result.id)).toEqual(result);
    expect(reopened.service.approveEarnings(approval)).toEqual(result);
    expect(reopened.finance.detail(result.debtAccountId!).entries).toHaveLength(1);
  });

  it("rolls back an inserted earning and ledger when its later segment insert fails", () => {
    const fixture = setup(key);
    const { service, repository, finance } = fixture.compose();
    fixture.db.exec("CREATE TRIGGER reject_second_segment BEFORE INSERT ON employee_salary_earning_segment WHEN NEW.ordinal=1 BEGIN SELECT RAISE(ABORT,'segment failure'); END");
    expect(() => service.approveEarnings(approval)).toThrow(/segment failure/);
    expect(repository.listEarnings("worker")).toEqual([]);
    expect(finance.listAccounts()).toEqual([]);
    expect(fixture.db.prepare("SELECT count(*) AS count FROM employee_salary_earning_segment").get()).toEqual({ count: 0 });
    expect(fixture.db.prepare("SELECT count(*) AS count FROM exact_finance_command").get()).toEqual({ count: 0 });
  });

  it("persists zero approval without a payable and refuses changes to approved source and segments", () => {
    const fixture = setup(key);
    const { service, repository, finance } = fixture.compose();
    const result = service.approveEarnings({ ...approval, approvedAmount: "0", unallocatedAmount: "0", segments: [{ id: "zero", projectId: "A", amount: "0" }] });
    expect(repository.getEarning(result.id)).toEqual(result);
    expect(result).toMatchObject({ approvedAmount: "0.00", debtEntryId: null, debtAccountId: null });
    expect(finance.listAccounts()).toEqual([]);
    expect(() => repository.saveEarning({ ...result, actorLabel: "Changed" })).toThrow(/immutable/);
    expect(() => fixture.db.prepare("UPDATE employee_salary_earning SET actor_label='Changed' WHERE id=?").run(result.id)).toThrow(/immutable/);
    expect(() => fixture.db.prepare("UPDATE employee_salary_earning_segment SET days=1 WHERE earning_id=?").run(result.id)).toThrow(/immutable/);
    expect(fixture.reopen().repository.getEarning(result.id)).toEqual(result);
  });

  it.each(["segment identity", "segment ordinal"])("refuses INSERT OR REPLACE against an approved %s even without recursive triggers", (conflict) => {
    const fixture = setup(key);
    const { service, repository } = fixture.compose();
    const result = service.approveEarnings(approval);
    fixture.db.pragma("recursive_triggers=OFF");
    const replacementId = conflict === "segment identity" ? "first" : "replacement";
    expect(() => fixture.db.prepare(`INSERT OR REPLACE INTO employee_salary_earning_segment(earning_id,id,ordinal,project_id,amount_minor,days)
      SELECT earning_id,?,ordinal,'B',amount_minor,42 FROM employee_salary_earning_segment WHERE earning_id=? AND id='first'`).run(replacementId, result.id)).toThrow(/immutable/);
    expect(repository.getEarning(result.id)).toEqual(result);
    expect(fixture.reopen().repository.getEarning(result.id)).toEqual(result);
  });

  it("refuses replacement of a segmentless zero earning even without recursive triggers", () => {
    const fixture = setup(key);
    const { service, repository } = fixture.compose();
    const result = service.approveEarnings({ ...approval, approvedAmount: "0", unallocatedAmount: "0", segments: [] });
    fixture.db.pragma("recursive_triggers=OFF");
    expect(() => fixture.db.prepare(`INSERT OR REPLACE INTO employee_salary_earning(id,employee_id,currency,period_start,period_end,approved_amount_minor,unallocated_amount_minor,actor_label,created_at)
      SELECT id,employee_id,currency,period_start,period_end,approved_amount_minor,unallocated_amount_minor,'Replaced',created_at FROM employee_salary_earning WHERE id=?`).run(result.id)).toThrow(/immutable/);
    expect(repository.getEarning(result.id)).toEqual(result);
    expect(fixture.reopen().repository.getEarning(result.id)).toEqual(result);
  });

  it("refuses a foreign-held FIFO before reading or writing and rejects async repository transactions", async () => {
    const fixture = setup(key);
    const { repository, service } = fixture.compose();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const held = fixture.lock.run(async () => { entered(); await waiting; });
    await started;
    try {
      expect(() => service.approveEarnings(approval)).toThrow(/connection busy/);
      expect(() => repository.listEarnings("worker")).toThrow(/connection busy/);
      expect(() => repository.getEarning("absent")).toThrow(/connection busy/);
    } finally { release(); await held; }
    expect(repository.listEarnings("worker")).toEqual([]);
    expect(() => repository.withTransaction(() => { service.approveEarnings(approval); return Promise.resolve("invalid"); })).toThrow(/synchronous/);
    expect(repository.listEarnings("worker")).toEqual([]);
    expect(fixture.db.prepare("SELECT count(*) AS count FROM debt_entry").get()).toEqual({ count: 0 });
    expect(fixture.db.prepare("SELECT count(*) AS count FROM exact_finance_command").get()).toEqual({ count: 0 });
  });
});
