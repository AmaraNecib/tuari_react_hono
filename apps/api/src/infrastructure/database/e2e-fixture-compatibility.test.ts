import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureExactNormalWorkspaceSchema, getExactWorkspaceId } from "./exact-normal-workspace-schema";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { resetE2eDatabase } from "../../../../../tests/e2e/helpers/db-isolation";
import { seedEmployeeByRole, seedEmployees, type SeedDatabase } from "../../../../../tests/e2e/helpers/db-seed";
import { resetExactFixture } from "../../../../../tests/e2e/helpers/exact-db-isolation";
import { fixtureRepositoryRoot, prepareManagedFixture } from "../../../../../tests/e2e/helpers/managed-fixture";

let db: BetterSqliteDatabase;
beforeEach(() => {
  const path = join(fixtureRepositoryRoot(), "apps/api/data", `tuari.phase1.integration.unit-${randomUUID()}.sqlite`);
  const token = prepareManagedFixture(path, fixtureRepositoryRoot());
  vi.stubEnv("E2E_FIXTURE_TOKEN", token);
  db = new Database(path) as unknown as BetterSqliteDatabase;
  ensureExactNormalWorkspaceSchema(db);
  vi.stubEnv("APP_DB_PATH", path);
  vi.stubEnv("E2E_API_MANAGED", "1");
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); });

function seedZeroEarning() {
  seedEmployees([{ firstName: "Exact", lastName: "Fixture", phone: "0555000001" }]);
  const employee = db.prepare("SELECT id FROM employee WHERE phone='0555000001'").get() as { id: string };
  db.prepare("INSERT INTO employee_salary_earning(id,employee_id,currency,period_start,period_end,approved_amount_minor,unallocated_amount_minor,debt_account_id,debt_entry_id,created_at) VALUES ('earning',?,'DZD','2026-11-01','2026-11-30',0,0,NULL,NULL,'2026-11-01T00:00:00.000Z')").run(employee.id);
}

describe("normal exact E2E fixtures", () => {
  it("seeds unset employee salary references without legacy monetary columns", () => {
    seedEmployees([{ firstName: "Exact", lastName: "Fixture", phone: "0555000001" }]);
    expect(db.prepare("SELECT first_name,salary_reference_units,salary_period,salary_currency FROM employee").all()).toEqual([
      { first_name: "Exact", salary_reference_units: null, salary_period: null, salary_currency: "DZD" },
    ]);
  });

  it("rejects numeric salary fixture input even at zero on the exact schema", () => {
    expect(() => seedEmployeeByRole({ firstName: "Unsafe", lastName: "Numeric", phone: "0555000033", roleKey: "worker", salaryAmountDzd: 0, salaryPeriod: "MONTHLY" })).toThrow(/exact|numeric/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee").get()).toEqual({ count: 0 });
  });

  it("refuses to adopt an already-existing database even with a fixture basename", () => {
    expect(() => prepareManagedFixture(process.env.APP_DB_PATH!, fixtureRepositoryRoot())).toThrow(/exist/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM role").get()).not.toEqual({ count: 0 });
  });

  it("refuses missing ownership and missing path instead of adopting an older fixture", () => {
    seedZeroEarning();
    vi.stubEnv("E2E_FIXTURE_TOKEN", "");
    expect(() => resetE2eDatabase()).toThrow(/ownership/i);
    vi.stubEnv("APP_DB_PATH", "");
    expect(() => resetE2eDatabase()).toThrow(/required|older database/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee_salary_earning").get()).toEqual({ count: 1 });
  });

  it("refuses reset and seeding with an incorrect run token before changing rows", () => {
    seedZeroEarning();
    vi.stubEnv("E2E_FIXTURE_TOKEN", "different-run");
    expect(() => resetE2eDatabase()).toThrow(/ownership/i);
    expect(() => seedEmployees([{ firstName: "Wrong", lastName: "Run", phone: "0555000055" }])).toThrow(/ownership/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee_salary_earning").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee").get()).toEqual({ count: 1 });
  });

  it("empties the managed fixture without losing immutable guards, schema, role seeds or workspace identity", () => {
    seedZeroEarning();
    expect(() => db.exec("DELETE FROM employee_salary_earning")).toThrow(/immutable/i);
    const workspaceId = getExactWorkspaceId(db);
    const roles = db.prepare("SELECT * FROM role ORDER BY id").all();
    const permissions = db.prepare("SELECT * FROM role_permission ORDER BY id").all();
    const schema = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    resetE2eDatabase();
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee_salary_earning").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee").get()).toEqual({ count: 0 });
    expect(getExactWorkspaceId(db)).toBe(workspaceId);
    expect(db.prepare("SELECT * FROM role ORDER BY id").all()).toEqual(roles);
    expect(db.prepare("SELECT * FROM role_permission ORDER BY id").all()).toEqual(permissions);
    expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(schema);
    ensureExactNormalWorkspaceSchema(db);
    seedZeroEarning();
    expect(() => db.exec("DELETE FROM employee_salary_earning")).toThrow(/immutable/i);
  });

  it("rolls back the disposable rebuild if restoring a table fails", () => {
    seedZeroEarning();
    const before = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const known = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name));
    const failing: SeedDatabase = {
      prepare: sql => db.prepare<unknown[]>(sql),
      exec: sql => { if (sql.startsWith("CREATE TABLE employee_salary_earning (")) throw new Error("Forced fixture rebuild failure"); db.exec(sql); },
      pragma: sql => db.pragma(sql), close: () => {},
    };
    expect(() => resetExactFixture(failing, known)).toThrow("Forced fixture rebuild failure");
    expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee_salary_earning").get()).toEqual({ count: 1 });
    expect(() => db.exec("DELETE FROM employee_salary_earning")).toThrow(/immutable/i);
  });

  it("rejects unknown exact marker versions before changing rows", () => {
    seedZeroEarning();
    db.exec("UPDATE exact_money_schema SET version=2 WHERE slice='workforce'");
    expect(() => resetE2eDatabase()).toThrow(/unsupported exact schema markers/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM employee_salary_earning").get()).toEqual({ count: 1 });
  });

  it("refuses a matching database filename outside the managed fixture boundary without deleting rows", () => {
    const outside = join(mkdtempSync(join(tmpdir(), "tuari-owner-boundary-")), "tuari.phase1.integration.owner.sqlite");
    const owner = new Database(outside);
    try {
      ensureExactNormalWorkspaceSchema(owner as unknown as BetterSqliteDatabase);
      const role = owner.prepare("SELECT id FROM role WHERE key='worker'").get() as { id: string };
      owner.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('preserve','Owner','Data','0555000012',?,'INACTIVE','2026-01-01','2026-01-01')").run(role.id);
      vi.stubEnv("APP_DB_PATH", outside);
      expect(() => resetE2eDatabase()).toThrow(/managed fixture|ownership/i);
      expect(owner.prepare("SELECT id FROM employee").all()).toEqual([{ id: "preserve" }]);
    } finally { owner.close(); }
  });

  it("refuses an unexpected table before mutating fixture data", () => {
    db.exec("CREATE TABLE unexpected_e2e_leak(id TEXT)");
    const schema = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    expect(() => resetE2eDatabase()).toThrow(/unexpected.*table/i);
    expect(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all()).toEqual(schema);
  });
});
