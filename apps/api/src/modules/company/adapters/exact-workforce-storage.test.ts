import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { exactWorkforceSchemaStatements } from "./exact-workforce-schema";
import { bindExactSalaryReference, readExactSalaryReference, readExactEmployee, readExactEmployeeHistory } from "./exact-workforce-storage";

describe.each([["plain", ""], ["keyed", "527-synthetic-key"]])("exact workforce reference storage %s", (_name, key) => {
  it("refuses a reference read while the shared connection FIFO is held", async () => {
    const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-543-fifo-")), "fixture.sqlite"), key);
    const lock = createFifoLock();
    try {
      db.exec("CREATE TABLE role(id TEXT PRIMARY KEY); CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO role VALUES ('worker')");
      for (const sql of exactWorkforceSchemaStatements) db.exec(sql);
      db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,salary_reference_units,salary_period,created_at,updated_at) VALUES ('worker','Test','Worker','0550000000','worker','ACTIVE',10000,'MONTHLY','now','now')").run();
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const waiting = new Promise<void>(resolve => { release = resolve; });
      const held = lock.run(async () => { entered(); await waiting; });
      await started;
      try { expect(() => readExactSalaryReference(db, "employee", "worker", lock)).toThrow(/connection busy/); }
      finally { release(); await held; }
    } finally { db.close(); }
  });
  it("preserves tagged DAILY and MONTHLY scales and history across reopen without changing numeric metadata", () => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-527-reference-")), "fixture.sqlite");
    let db = createDatabaseConnection(path, key);
    const lock = createFifoLock();
    try {
      db.exec("CREATE TABLE role(id TEXT PRIMARY KEY); CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO role VALUES ('worker')");
      for (const sql of exactWorkforceSchemaStatements) db.exec(sql);
      const insert = db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,salary_reference_units,salary_period,salary_currency,created_at,updated_at) VALUES (?,'Test','Worker',?,'worker','ACTIVE',?,?,?,'2026-11-10T00:00:00.000Z','2026-11-10T00:00:00.000Z')");
      for (const [id, reference] of [
        ["daily", { period: "DAILY", amount: "1500.125" }],
        ["large", { period: "MONTHLY", amount: "90071992547409.93" }],
        ["zero", { period: "MONTHLY", amount: "0" }], ["unset", null],
      ] as const) {
        const value = bindExactSalaryReference(reference);
        insert.run(id, id, value.units, value.period, value.currency);
      }
      expect(readExactSalaryReference(db, "employee", "daily", lock)).toEqual({ period: "DAILY", amount: "1500.1250" });
      expect(readExactSalaryReference(db, "employee", "large", lock)).toEqual({ period: "MONTHLY", amount: "90071992547409.93" });
      expect(readExactSalaryReference(db, "employee", "zero", lock)).toEqual({ period: "MONTHLY", amount: "0.00" });
      expect(readExactSalaryReference(db, "employee", "unset", lock)).toBeNull();
      expect(readExactSalaryReference(db, "employee", "missing", lock)).toBeUndefined();
      db.exec("INSERT INTO employee_state_history(id,employee_id,role_id,status,salary_reference_units,salary_period,salary_currency,event_type,start_date,created_at,updated_at) SELECT 'snapshot',id,role_id,status,salary_reference_units,salary_period,salary_currency,'CREATED',created_at,created_at,updated_at FROM employee WHERE id='daily'");
      expect(() => insert.run("bad", "bad", 1.5, "MONTHLY", "DZD")).toThrow(/CHECK/);
      expect(() => insert.run("unpaired", "unpaired", 100n, null, "DZD")).toThrow(/CHECK/);
      expect(() => insert.run("negative", "negative", -1n, "DAILY", "DZD")).toThrow(/CHECK/);
      expect(() => insert.run("currency", "currency", 100n, "MONTHLY", "EUR")).toThrow(/CHECK/);
      expect(db.prepare("SELECT count(*) AS count FROM employee").get()).toEqual({ count: 4 });
      db.close();
      db = createDatabaseConnection(path, key);
      expect(readExactSalaryReference(db, "employee_state_history", "snapshot", lock)).toEqual({ period: "DAILY", amount: "1500.1250" });
      expect(readExactSalaryReference(db, "employee", "large", lock)).toEqual({ period: "MONTHLY", amount: "90071992547409.93" });
      db.prepare("UPDATE employee SET phone=? WHERE id=?").run("0550000000", "daily");
      expect(readExactEmployee(db, "daily", lock)).toMatchObject({ id: "daily", salaryReference: { period: "DAILY", amount: "1500.1250" }, currency: "DZD" });
      expect(readExactEmployee(db, "missing", lock)).toBeUndefined();
      db.prepare("UPDATE employee SET salary_reference_units=2000000,salary_period='MONTHLY' WHERE id='daily'").run();
      expect(readExactEmployeeHistory(db, "daily", lock)).toMatchObject([{ employeeId: "daily", salaryReference: { period: "DAILY", amount: "1500.1250" }, currency: "DZD", eventType: "CREATED" }]);
      expect(readExactEmployeeHistory(db, "missing", lock)).toEqual([]);
    } finally { db.close(); }
  });
});
