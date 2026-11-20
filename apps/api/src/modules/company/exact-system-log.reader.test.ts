import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { ensureFreshExactApplicationSchema } from "../../infrastructure/database/fresh-exact-schema";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { createFinancialDependencies } from "../../app/financial-dependencies";
import { SqliteEmployeeEarningRepository } from "../workforce/adapters/sqlite-employee-earning.repository";
import { SqliteCompanyRepository } from "./adapters/sqlite-company.repository";
import { buildCompanySystemLog } from "./company.system-log";
import { createExactSystemLogReader } from "./exact-system-log.reader";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const connections: BetterSqliteDatabase[] = [];
afterEach(() => { for (const db of connections.splice(0)) db.close(); });
const now = "2026-11-19T10:00:00.000Z";
const paid = "2026-11-18T09:00:00.000Z";
async function fixture(key: string) {
  const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-558-log-")), "application.sqlite"), key);
  connections.push(db);
  await ensureFreshExactApplicationSchema(db);
  const lock = createFifoLock();
  const graph = createFinancialDependencies(db, lock, { id: randomUUID, now: () => now });
  const repo = new SqliteCompanyRepository(db, lock);
  const role = repo.listRoles().find(row => row.key === "worker")!;
  const employee = repo.createEmployee({ firstName: "Log", lastName: "Worker", phone: "0555123987", roleId: role.id, status: "ACTIVE", salaryReference: { period: "MONTHLY", amount: "30000.00" } });
  const reader = createExactSystemLogReader(db, lock);
  return { db, lock, graph, repo, employee, reader };
}
describe.each(["", "558-systemlog-key"])("exact system log native %s", key => {
  it("keeps metadata events and emits actual cash, exact debt, and honest audit provenance", async () => {
    const f = await fixture(key);
    const audit = { actorUserId: randomUUID(), actorLabel: "Recorded operator", transactionId: randomUUID() };
    const earning = new SqliteEmployeeEarningRepository(f.db, f.lock).create({
      requestId: randomUUID(), employeeId: f.employee.id, currencyCode: "DZD",
      periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z",
      totalAmount: "90071992547409.93", unallocatedAmount: "90071992547409.93",
      referenceSalary: { period: "MONTHLY", amount: "30000.00" }, segments: [],
    }, "systemlog-proof", now, audit);
    const cash = f.graph.payroll.recordCash({ requestId: "cash", employeeId: f.employee.id, amount: "90071992547409.93", paymentDate: paid,
      wages: [{ earningId: earning.id, amount: "90071992547409.93" }], ...audit });
    f.db.pragma("query_only=ON");
    const changes = f.db.prepare("SELECT total_changes() AS n").get();
    const result = f.reader.listSystemLog();
    expect(f.db.prepare("SELECT total_changes() AS n").get()).toEqual(changes);
    const salary = result.items.find(row => row.actionType === "SALARY_PAYMENT_RECORDED")!;
    expect(salary).toMatchObject({ id: audit.transactionId, entityId: cash.id, actorLabel: "Recorded operator", actorUserId: audit.actorUserId, createdAt: paid });
    expect(salary.detail).toContain("90071992547409.93 دج");
    expect(salary.detail).not.toContain("30000");
    expect(result.items.some(row => row.actionType === "EMPLOYEE_CREATED")).toBe(true);
    expect(result.items.filter(row => row.entityType === "DEBT_ENTRY")).toHaveLength(2);
    expect(result.items.some(row => row.detail?.includes("+90071992547409.93"))).toBe(true);
    expect(result.items.some(row => row.detail?.includes("-90071992547409.93"))).toBe(true);
    expect(f.reader.listSystemLog({ actionType: "SALARY_PAYMENT_RECORDED", fromDate: "2026-11-18", toDate: paid }).items).toHaveLength(1);
    expect(f.reader.listSystemLog({ actionType: "SALARY_PAYMENT_RECORDED", fromDate: now }).items).toEqual([]);
    const page = f.reader.listSystemLogPage(undefined, { offset: 1, limit: 1 });
    expect(page).toEqual({ totalCount: result.items.length, items: result.items.slice(1, 2) });
    expect(f.reader.listSystemLog()).toEqual(result);
  });
  it("refuses the entire read before a partial prefix and refuses a foreign FIFO holder", async () => {
    const f = await fixture(key);
    const small = createExactSystemLogReader(f.db, f.lock, { maxRows: 1 });
    expect(() => small.listSystemLog({ entityId: "absent" })).toThrow(/limit/);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const holder = f.lock.run(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
    await started;
    try { expect(() => f.reader.listSystemLog()).toThrow(/busy|held/i); } finally { release(); await holder; }
    f.db.transaction(() => { expect(() => f.reader.listSystemLog()).toThrow(/snapshot/); })();
    expect(() => f.reader.listSystemLogPage(undefined, { offset: -1, limit: 1 })).toThrow();
  });
  it("uses posting amounts and dates for correction, settlement, void and both account directions", async () => {
    const f = await fixture(key);
    for (const direction of ["PAYABLE", "RECEIVABLE"] as const) {
      const account = f.graph.finance.createAccount({ requestId: randomUUID(), partyType: "INTERNAL_WORKER", workerId: f.employee.id, direction, currency: "DZD" });
      const original = f.graph.finance.postEntry({ requestId: randomUUID(), debtAccountId: account.id, currency: "DZD", entryType: "OPENING", signedAmountDzd: "100.01", entryDate: paid });
      const correction = f.graph.finance.correctEntry({ requestId: randomUUID(), entryId: original.id, amountDzd: "110.02", reason: "Correction" });
      const settlement = f.graph.finance.settleAccount({ requestId: randomUUID(), debtAccountId: account.id, currency: "DZD" });
      const rows = f.reader.listSystemLog().items;
      expect(rows.find(row => row.entityId === original.id)).toMatchObject({ actorLabel: null, actorCurrentLabel: null, createdAt: paid });
      expect(rows.find(row => row.entityId === correction.id)?.detail).toContain("+10.01");
      expect(rows.find(row => row.entityId === settlement[0]!.id)).toMatchObject({ actionType: "DEBT_SETTLED" });
      f.graph.finance.voidEntry({ requestId: randomUUID(), entryId: original.id, voidReason: "Cancelled" });
      const voided = f.reader.listSystemLog().items.find(row => row.entityId === original.id)!;
      expect(voided.createdAt).toBe(paid);
      expect(voided.detail).toContain("VOIDED: Cancelled");
      expect(voided.detail).not.toContain("الرصيد بعد");
    }
  });
  it("groups organizational events before paging and preserves unmatched group context", async () => {
    const f = await fixture(key);
    const audit = { actorUserId: "current-user", transactionId: randomUUID() };
    f.db.prepare("INSERT INTO user(id,name,phoneNumber,created_at,updated_at) VALUES ('current-user','Present name','0555000012',?,?)").run(now, now);
    const project = f.repo.createProject({ name: "Project", status: "ACTIVE", managerId: f.employee.id }, audit);
    const warehouse = f.repo.createWarehouse({ name: "Warehouse", status: "ACTIVE", managerId: f.employee.id }, audit);
    f.repo.createManagerAssignment({ workerId: f.employee.id, managerId: f.employee.id, status: "ACTIVE", startDate: now }, audit);
    f.repo.updateEmployee({ id: f.employee.id, status: "INACTIVE" }, audit);
    f.repo.createProjectAssignment({ employeeId: f.employee.id, projectId: project.id, status: "ACTIVE", startDate: now }, audit);
    f.repo.createWarehouseAssignment({ employeeId: f.employee.id, warehouseId: warehouse.id, status: "ACTIVE", startDate: now }, audit);
    const result = f.reader.listSystemLog({ entityType: "PROJECT" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: audit.transactionId, actionType: "PROJECT_MANAGER_CHANGED", actorLabel: null, actorCurrentLabel: "Present name" });
    expect(result.items[0]!.detail).toContain("Warehouse");
    expect(f.reader.listSystemLogPage({ entityType: "PROJECT" }, { offset: 0, limit: 1 })).toEqual({ items: result.items, totalCount: 1 });
    expect(f.reader.listSystemLog({ actorUserId: "absent" }).items).toEqual([]);
    const all = f.reader.listSystemLog().items;
    expect(all.filter(row => row.id === audit.transactionId)).toHaveLength(1);
  });
  it("shows advance cash once and represents repayment and offset only through debt postings", async () => {
    const f = await fixture(key);
    const earning = new SqliteEmployeeEarningRepository(f.db, f.lock).create({
      requestId: randomUUID(), employeeId: f.employee.id, currencyCode: "DZD",
      periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z",
      totalAmount: "100.00", unallocatedAmount: "100.00", referenceSalary: null, segments: [],
    }, "advance-log-proof", now, {});
    const audit = { actorUserId: null, actorLabel: null, transactionId: null };
    const advance = f.graph.payroll.recordCash({ ...audit, requestId: "advance", employeeId: f.employee.id, amount: "50.00", paymentDate: paid, wages: [], advanceAmount: "50.00" });
    f.graph.payroll.offsetAdvance({ ...audit, requestId: "offset", employeeId: f.employee.id, amount: "20.00", settlementDate: now,
      wageSource: { kind: "EARNING", id: earning.id }, advanceSource: { kind: "ADVANCE", id: advance.advance!.id } });
    f.graph.payroll.repayAdvance({ ...audit, requestId: "repay", employeeId: f.employee.id, advanceId: advance.advance!.id, amount: "10.00", paymentDate: now });
    const result = f.reader.listSystemLog();
    expect(result.items.filter(row => row.actionType === "SALARY_PAYMENT_RECORDED")).toHaveLength(1);
    expect(result.items.find(row => row.actionType === "SALARY_PAYMENT_RECORDED")).toMatchObject({ actorLabel: null, actorUserId: null, transactionId: null });
    expect(result.items.filter(row => row.actionType === "DEBT_SETTLED")).toHaveLength(2);
    expect(result.items.filter(row => row.entityType === "DEBT_ENTRY")).toHaveLength(5);
  });
  it("matches legacy metadata grouping, filters and profile/catalog behavior without legacy money tables", async () => {
    const f = await fixture(key);
    f.db.prepare("INSERT INTO inventory_item_definition(id,name,item_type,is_active,created_at,updated_at) VALUES ('catalog','Catalog','ASSET',1,?,?)").run(now, now);
    f.db.prepare("INSERT INTO user(id,name,phoneNumber,created_at,updated_at) VALUES ('user','New','0555000011',?,?)").run(now, now);
    f.db.prepare("INSERT INTO user_profile_history(id,user_id,name,phone,previous_name,previous_phone,password_changed,created_at,updated_at) VALUES ('profile','user','New',NULL,'Old',NULL,0,?,?)").run(now, now);
    // The legacy builder can safely execute only with the three finance ports empty.
    const metadata = Object.create(f.repo) as SqliteCompanyRepository;
    metadata.listDebtAccounts = () => []; metadata.listSalaryPayments = () => [];
    for (const filters of [undefined, { actionType: "ACCOUNT_UPDATED" as const }, { entityType: "INVENTORY_ITEM" as const }]) {
      expect(f.reader.listSystemLog(filters)).toEqual(buildCompanySystemLog(metadata, filters));
    }
  });
});
