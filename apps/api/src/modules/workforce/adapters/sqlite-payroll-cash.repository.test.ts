import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { payrollCashSchemaStatements } from "./payroll-cash-schema";
import { SqlitePayrollCashRepository } from "./sqlite-payroll-cash.repository";

function fixture(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-558-cash-")), "fixture.sqlite");
  const db = createDatabaseConnection(path, key);
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE debt_account(id TEXT PRIMARY KEY, direction TEXT NOT NULL, worker_id TEXT, currency TEXT NOT NULL); CREATE TABLE debt_entry(id TEXT PRIMARY KEY, debt_account_id TEXT NOT NULL, target_entry_id TEXT, correction_of_entry_id TEXT, status TEXT NOT NULL, producer_type TEXT, producer_id TEXT, entry_type TEXT NOT NULL)");
  db.prepare("INSERT INTO employee VALUES (?)").run("worker");
  for (const sql of payrollCashSchemaStatements) db.exec(sql);
  return { db, path };
}

describe.each([["plain", ""], ["keyed", "558-native-key"]])("payroll cash storage %s", (_driver, key) => {
  it("rejects malformed or unreconciled internal money before inserting a header", () => {
    const { db } = fixture(key);
    try {
      const repository = new SqlitePayrollCashRepository(db, createFifoLock());
      expect(() => repository.saveCash({
        id: "cash-1", employeeId: "worker", currency: "DZD", amount: "90071992547409.93", paymentDate: "2026-01-01",
        actorUserId: "actor", actorLabel: null, transactionId: "tx-1", createdAt: "2026-01-01T00:00:00.000Z",
        wageAllocations: [], advance: null,
      })).toThrow("does not match allocations and advance");
      expect(db.prepare("SELECT count(*) AS count FROM employee_salary_cash").get()).toEqual({ count: 0 });
    } finally { db.close(); }
  });
});
