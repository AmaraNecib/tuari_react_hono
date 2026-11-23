import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExactCommerceServices } from "../../rpc/exact-commerce-composition";
import { createFifoLock } from "./fifo-lock";
import { createDatabaseConnection } from "./factory";
import { ensureFreshExactApplicationSchema } from "./fresh-exact-schema";
import { freshExactSchemaPlan } from "./fresh-exact-schema-plan";
import { ensureFreshApplicationIdentity } from "./schema";
import { BetterSqlite3Executor } from "./sqlite-executor";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const connections: BetterSqliteDatabase[] = [];
afterEach(() => { for (const db of connections.splice(0)) if (db.open) db.close(); });
async function oldDatabase(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-545-upgrade-")), "application.sqlite");
  const db = createDatabaseConnection(path, key);
  connections.push(db);
  // Reproduce the accepted #558 physical schema, excluding the new opening slice.
  for (const sql of freshExactSchemaPlan.filter(sql => !sql.includes("employee_opening_"))) db.exec(sql);
  await ensureFreshApplicationIdentity(new BetterSqlite3Executor(db));
  db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run("fresh_exact_financial_v1", "2026-11-19T00:00:00.000Z");
  db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run("preserved-application-history", "2026-10-01T00:00:00.000Z");
  return db;
}
describe.each(["", "545-upgrade-public-key"])("opening schema upgrade (%s)", key => {
  it("adds opening storage to an attested existing #558 database without changing history", async () => {
    const db = await oldDatabase(key);
    db.exec(`INSERT INTO employee(id,first_name,last_name,phone,role_id,status,salary_reference_period,salary_reference_amount,created_at,updated_at)
      SELECT 'preserved-worker','Worker','History','0612345678',id,'ACTIVE','MONTHLY','30000.00','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z' FROM role WHERE key='worker'`);
    const financial = createExactCommerceServices(db, createFifoLock(), { id: () => crypto.randomUUID(), now: () => "2026-11-01T00:00:00.000Z" });
    const account = financial.finance.createAccount({ requestId: "existing-account", partyType: "INTERNAL_WORKER", workerId: "preserved-worker", direction: "PAYABLE", currency: "DZD" });
    financial.finance.postEntry({ requestId: "existing-obligation", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "5000.00", currency: "DZD" });
    const employee = db.prepare("SELECT * FROM employee WHERE id='preserved-worker'").get();
    const ledger = db.prepare("SELECT * FROM debt_entry ORDER BY id").all();
    const prior = db.prepare("SELECT * FROM app_schema_state ORDER BY key").all();
    const roles = db.prepare("SELECT * FROM role ORDER BY id").all();
    await ensureFreshExactApplicationSchema(db);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'employee_opening_%' ORDER BY name").all()).toEqual([{ name: "employee_opening_correction" }, { name: "employee_opening_proposal" }, { name: "employee_opening_refund" }, { name: "employee_opening_resolution" }, { name: "employee_opening_review" }, { name: "employee_opening_source" }]);
    expect(db.prepare("SELECT * FROM app_schema_state WHERE key!='payroll_opening_v1' ORDER BY key").all()).toEqual(prior);
    expect(db.prepare("SELECT * FROM role ORDER BY id").all()).toEqual(roles);
    expect(db.prepare("SELECT * FROM employee WHERE id='preserved-worker'").get()).toEqual(employee);
    const schema = db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all();
    await ensureFreshExactApplicationSchema(db);
    expect(db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all()).toEqual(schema);
    expect(db.prepare("SELECT * FROM debt_entry ORDER BY id").all()).toEqual(ledger);
    const path = db.name;
    db.close();
    const reopened = createDatabaseConnection(path, key);
    connections.push(reopened);
    await ensureFreshExactApplicationSchema(reopened);
    expect(reopened.prepare("SELECT * FROM debt_entry ORDER BY id").all()).toEqual(ledger);
    expect(reopened.prepare("SELECT * FROM employee WHERE id='preserved-worker'").get()).toEqual(employee);
    expect(reopened.pragma("foreign_key_check")).toEqual([]);
  });
  it.each(["partial", "marker"])("refuses %s opening state rather than trusting or repairing it", async state => {
    const db = await oldDatabase(key);
    if (state === "partial") db.exec("CREATE TABLE employee_opening_review(employee_id TEXT PRIMARY KEY)");
    else db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run("payroll_opening_v1", "2026-11-19T00:00:00.000Z");
    const prior = db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all();
    const markers = db.prepare("SELECT * FROM app_schema_state ORDER BY key").all();
    await expect(ensureFreshExactApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all()).toEqual(prior);
    expect(db.prepare("SELECT * FROM app_schema_state ORDER BY key").all()).toEqual(markers);
  });

  it("refuses a damaged old schema without adding opening tables", async () => {
    const db = await oldDatabase(key);
    db.exec("DROP TRIGGER debt_entry_currency_insert");
    const prior = db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all();
    await expect(ensureFreshExactApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all()).toEqual(prior);
  });
});
