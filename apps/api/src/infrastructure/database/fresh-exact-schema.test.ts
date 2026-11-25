import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabaseConnection } from "./factory";
import { ensureFreshExactApplicationSchema } from "./fresh-exact-schema";
import { createFinancialDependencies } from "../../app/financial-dependencies";
import { createFifoLock } from "./fifo-lock";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const connections: BetterSqliteDatabase[] = [];
afterEach(() => { for (const db of connections.splice(0)) if (db.open) db.close(); });
function database(key = "") {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-558-fresh-schema-")), "application.sqlite");
  const db = createDatabaseConnection(path, key);
  connections.push(db);
  return db;
}
function snapshot(db: BetterSqliteDatabase) {
  return { schema: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all(), changes: db.prepare("SELECT total_changes() AS count").get() };
}

describe("selected fresh exact application schema", () => {
  it.each(["", "558-fresh-schema-key"]) ("initializes and reattests the complete graph without changing state (%s)", async key => {
    const db = database(key);
    await ensureFreshExactApplicationSchema(db);
    expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual([
      { slice: "debt", version: 1 }, { slice: "expenses", version: 1 }, { slice: "inventory", version: 1 }, { slice: "invoice", version: 1 }, { slice: "workforce", version: 1 },
    ]);
    expect(db.prepare("SELECT key FROM role ORDER BY key").all()).toEqual([{ key: "admin" }, { key: "project_manager" }, { key: "warehouse_manager" }, { key: "worker" }]);
    const services = createFinancialDependencies(db, createFifoLock(), { id: () => crypto.randomUUID(), now: () => new Date().toISOString() });
    expect(services.finance.transactionIdentity.connection).toBe(db);
    expect(services.finance.transactionIdentity.lock).toBe(services.financeRepository.transactionIdentity.lock);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    const before = snapshot(db);
    await ensureFreshExactApplicationSchema(db);
    expect(snapshot(db)).toEqual(before);
    const schema = before.schema;
    const path = db.name;
    db.close();
    const reopened = createDatabaseConnection(path, key);
    connections.push(reopened);
    await ensureFreshExactApplicationSchema(reopened);
    expect(snapshot(reopened).schema).toEqual(schema);
    expect(reopened.prepare("SELECT COUNT(*) AS count FROM role").get()).toEqual({ count: 4 });
  });

  it("adds optional receipt links to an attested older exact snapshot without changing expenses", async () => {
    const db = database();
    await ensureFreshExactApplicationSchema(db);
    db.exec("DROP TABLE expense_attachment");
    const before = db.prepare("SELECT * FROM expense").all();
    await ensureFreshExactApplicationSchema(db);
    expect(db.prepare("SELECT * FROM expense").all()).toEqual(before);
    expect(db.prepare("SELECT * FROM expense_attachment").all()).toEqual([]);
    await ensureFreshExactApplicationSchema(db);
  });

  it("indexes expense receipt ownership and ordering, and upgrades the prior unindexed receipt graph", async () => {
    const db = database();
    await ensureFreshExactApplicationSchema(db);
    const index = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='expense_attachment_owner_order_idx'").get();
    expect(index).toBeTruthy();
    const columns = db.prepare("PRAGMA index_info(expense_attachment_owner_order_idx)").all() as {name:string}[];
    expect(columns.map(column=>column.name)).toEqual(["expense_id","created_at","id"]);
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM expense_attachment WHERE expense_id=? ORDER BY created_at,id").all("expense") as {detail:string}[];
    expect(plan.some(row=>row.detail.includes("expense_attachment_owner_order_idx"))).toBe(true);
    expect(plan.some(row=>/TEMP B-TREE|SCAN expense_attachment/.test(row.detail))).toBe(false);
    db.exec("DROP INDEX expense_attachment_owner_order_idx");
    const before = db.prepare("SELECT * FROM expense").all();
    await ensureFreshExactApplicationSchema(db);
    expect(db.prepare("SELECT * FROM expense").all()).toEqual(before);
    expect(db.prepare("PRAGMA index_info(expense_attachment_owner_order_idx)").all()).toHaveLength(3);
    db.exec("DROP INDEX expense_attachment_owner_order_idx; CREATE INDEX expense_attachment_owner_order_idx ON expense_attachment(id)");
    const invalid = snapshot(db);
    await expect(ensureFreshExactApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(snapshot(db)).toEqual(invalid);
  });

  it("refuses an existing unsupported database without modifying it", async () => {
    const db = database();
    db.exec("CREATE TABLE debt_account(id TEXT PRIMARY KEY,current_balance REAL); INSERT INTO debt_account VALUES ('preserved',1.25)");
    const before = snapshot(db);
    await expect(ensureFreshExactApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(snapshot(db)).toEqual(before);
    expect(db.prepare("SELECT * FROM debt_account").all()).toEqual([{ id: "preserved", current_balance: 1.25 }]);
  });

  it("does not trust a valid marker when a physical guard has been removed", async () => {
    const db = database();
    await ensureFreshExactApplicationSchema(db);
    db.exec("DROP TRIGGER debt_entry_currency_insert");
    const before = snapshot(db);
    await expect(ensureFreshExactApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(snapshot(db)).toEqual(before);
  });
});
