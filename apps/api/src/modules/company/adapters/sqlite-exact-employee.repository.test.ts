import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exactEmployeeSchema } from "@tuari/contracts";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { exactWorkforceSchemaStatements } from "./exact-workforce-schema";
import { SqliteExactEmployeeRepository } from "./sqlite-exact-employee.repository";

const first = "2026-11-01T00:00:00.000Z";
const second = "2026-11-02T00:00:00.000Z";
const audit = { actorUserId: "operator", actorLabel: "Operator", transactionId: "00000000-0000-4000-8000-000000000001" };
const employee = (id = "worker") => exactEmployeeSchema.parse({ id, firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role", status: "ACTIVE", salaryReference: { period: "DAILY", amount: "0.0001" }, currency: "DZD", notes: null, occupation: null, createdAt: first, updatedAt: first });
function fixture(key: string, real = false) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-exact-employee-")), "fixture.sqlite");
  const db = createDatabaseConnection(path, key);
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE role(id TEXT PRIMARY KEY); CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE project(id TEXT PRIMARY KEY); INSERT INTO role VALUES ('worker-role'),('other-role'); INSERT INTO user VALUES ('linked-user')");
  for (const sql of exactWorkforceSchemaStatements) db.exec(real ? sql.replace("salary_reference_units INTEGER", "salary_reference_units REAL") : sql);
  const lock = createFifoLock();
  let id = 0;
  const repository = () => new SqliteExactEmployeeRepository(db, lock, { id: () => `history-${++id}` });
  return { db, path, lock, repository };
}

describe.each([["plain", ""], ["keyed", "527-employee-public-fixture-key"]])("exact native employee writes %s", (_kind, key) => {
  it("persists DAILY4 and wide MONTHLY2 without changing the original historical reference", () => {
    const f = fixture(key);
    try {
      const repo = f.repository();
      const original = repo.createEmployee(employee(), audit);
      expect(original.salaryReference).toEqual({ period: "DAILY", amount: "0.0001" });
      const updated = repo.updateEmployee({ ...original, salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" }, updatedAt: second }, { ...audit, transactionId: "00000000-0000-4000-8000-000000000002" });
      expect(updated?.salaryReference).toEqual({ period: "MONTHLY", amount: "9007199254740993.21" });
      const history = repo.listEmployeeStateHistory("worker");
      expect(history.map(row => [row.eventType, row.salaryReference, row.startDate, row.endDate])).toEqual([
        ["UPDATED", { period: "MONTHLY", amount: "9007199254740993.21" }, second, null],
        ["CREATED", { period: "DAILY", amount: "0.0001" }, first, second],
      ]);
      expect(history.map(row => row.transactionId)).toEqual(["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000002"]);
      expect(f.db.prepare("SELECT typeof(salary_reference_units) AS kind FROM employee").get()).toEqual({ kind: "integer" });
      expect(() => JSON.stringify({ updated, history })).not.toThrow();
    } finally { f.db.close(); }
  });

  it("keeps NULL distinct from zero and records period changes even when both amounts are zero", () => {
    const f = fixture(key);
    try {
      const repo = f.repository();
      const original = repo.createEmployee({ ...employee(), salaryReference: null }, audit);
      expect(original.salaryReference).toBeNull();
      repo.updateEmployee({ ...original, salaryReference: { period: "DAILY", amount: "0.0000" }, updatedAt: second }, audit);
      repo.updateEmployee({ ...original, salaryReference: { period: "MONTHLY", amount: "0.00" }, updatedAt: "2026-11-03T00:00:00.000Z" }, audit);
      expect(repo.listEmployeeStateHistory("worker").map(row => row.salaryReference)).toEqual([{ period: "MONTHLY", amount: "0.00" }, { period: "DAILY", amount: "0.0000" }, null]);
    } finally { f.db.close(); }
  });

  it("does not create state history for profile-only edits or equivalent canonical references, and preserves user links", () => {
    const f = fixture(key);
    try {
      const repo = f.repository();
      const original = repo.createEmployee({ ...employee(), salaryReference: { period: "MONTHLY", amount: "10.00" } }, audit);
      f.db.prepare("UPDATE employee SET user_id='linked-user' WHERE id='worker'").run();
      const updated = repo.updateEmployee({ ...original, firstName: "Changed", notes: "profile-only", salaryReference: { period: "MONTHLY", amount: "10.0" }, updatedAt: second }, audit);
      expect(updated?.firstName).toBe("Changed");
      expect(repo.listEmployeeStateHistory("worker")).toHaveLength(1);
      expect(f.db.prepare("SELECT user_id AS userId,created_at AS createdAt FROM employee").get()).toEqual({ userId: "linked-user", createdAt: first });
      expect(repo.updateEmployee({ ...original, id: "missing" }, audit)).toBeNull();
    } finally { f.db.close(); }
  });

  it("rolls back profile creation and updates when history insertion fails", () => {
    const f = fixture(key);
    try {
      const repo = f.repository();
      const original = repo.createEmployee(employee(), audit);
      f.db.exec("CREATE TRIGGER refuse_history BEFORE INSERT ON employee_state_history BEGIN SELECT RAISE(ABORT,'forced history failure'); END");
      expect(() => repo.createEmployee({ ...employee("other"), phone: "0550000001" }, audit)).toThrow("forced history failure");
      expect(repo.getEmployeeById("other")).toBeNull();
      expect(() => repo.updateEmployee({ ...original, status: "INACTIVE", notes: "must roll back", updatedAt: second }, audit)).toThrow("forced history failure");
      expect(repo.getEmployeeById("worker")).toEqual(original);
      expect(repo.listEmployeeStateHistory("worker")).toHaveLength(1);
      expect(repo.listEmployeeStateHistory("worker")[0]?.endDate).toBeNull();
    } finally { f.db.close(); }
  });

  it("restores exact profile references through trusted upsert without inventing financial earnings", () => {
    const f = fixture(key);
    try {
      const repo = f.repository();
      const original = { ...employee(), salaryReference: { period: "MONTHLY" as const, amount: "9007199254740993.21" } };
      expect(repo.upsertEmployee(original)).toEqual(original);
      expect(repo.upsertEmployee({ ...original, salaryReference: null, updatedAt: second }).salaryReference).toBeNull();
      expect(repo.listEmployeeStateHistory("worker").map(row => [row.eventType, row.salaryReference, row.actorUserId, row.transactionId])).toEqual([["UPDATED", null, null, null], ["CREATED", original.salaryReference, null, null]]);
      expect(f.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='employee_salary_earning'").get()).toEqual({ count: 0 });
    } finally { f.db.close(); }
  });

  it("refuses unreadable audit transaction identities without leaving a profile or history row", () => {
    const f = fixture(key);
    try {
      const repo = f.repository();
      expect(() => repo.createEmployee(employee(), { ...audit, transactionId: "not-a-uuid" })).toThrow();
      expect(repo.getEmployeeById("worker")).toBeNull();
      expect(repo.listEmployeeStateHistory("worker")).toEqual([]);
    } finally { f.db.close(); }
  });

  it("joins the caller transaction, refuses duplicate replacement and retains exact data after reopening", () => {
    const f = fixture(key);
    try {
      const repo = f.repository();
      const original = repo.createEmployee(employee(), audit);
      expect(() => repo.createEmployee({ ...original, firstName: "Replacement" }, audit)).toThrow();
      expect(repo.getEmployeeById("worker")).toEqual(original);
      expect(() => repo.withTransaction(() => { repo.updateEmployee({ ...original, status: "LEFT", updatedAt: second }, audit); throw new Error("outer failure"); })).toThrow("outer failure");
      expect(repo.getEmployeeById("worker")).toEqual(original);
      f.db.close();
      const reopened = createDatabaseConnection(f.path, key);
      try {
        const next = new SqliteExactEmployeeRepository(reopened, createFifoLock(), { id: () => "unused" });
        expect(next.getEmployeeById("worker")).toEqual(original);
        expect(next.listEmployeeStateHistory("worker")).toHaveLength(1);
      } finally { reopened.close(); }
    } finally { if (f.db.open) f.db.close(); }
  });

  it("refuses REAL monetary columns despite a workforce marker and does not accept async transaction work", () => {
    const broken = fixture(key, true);
    try { expect(() => broken.repository()).toThrow("Invalid exact employee column"); } finally { broken.db.close(); }
    const f = fixture(key);
    try { expect(() => f.repository().withTransaction(async () => "not sync")).toThrow("Employee transaction must be synchronous"); } finally { f.db.close(); }
  });
});
