import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabaseConnection } from "./factory";
import { ensureFreshExactApplicationSchema } from "./fresh-exact-schema";
import { ensureFreshManualSettlementApplicationSchema } from "./fresh-manual-settlement-schema";
const snapshot = (db: ReturnType<typeof createDatabaseConnection>) => ({ schema: db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all(), markers: db.prepare("SELECT * FROM exact_money_schema ORDER BY slice").all(), changes: db.prepare("SELECT total_changes() AS count").get() });
it("initializes opt-in disposable settlement schema and reattests without writes", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-613-schema-")), "application.sqlite");
  let db = createDatabaseConnection(path, "");
  try {
    await ensureFreshManualSettlementApplicationSchema(db);
    expect(db.prepare("SELECT version FROM exact_money_schema WHERE slice='manual_settlement'").get()).toEqual({ version: 1 });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'manual_debt_settlement%' ORDER BY name").all()).toEqual([{ name: "manual_debt_settlement" }, { name: "manual_debt_settlement_reversal" }]);
    const before = snapshot(db);
    await ensureFreshManualSettlementApplicationSchema(db);
    expect(snapshot(db)).toEqual(before);
    db.close();
    db = createDatabaseConnection(path, "");
    const reopened = snapshot(db);
    await ensureFreshManualSettlementApplicationSchema(db);
    expect(snapshot(db)).toEqual(reopened);
    expect(reopened.schema).toEqual(before.schema);
    expect(reopened.markers).toEqual(before.markers);
  } finally { db.close(); }
});
it("adds receipt links to an already attested settlement snapshot", async () => {
  const db = createDatabaseConnection(":memory:", "");
  try {
    await ensureFreshManualSettlementApplicationSchema(db);
    db.exec("DROP TABLE expense_attachment");
    const markers = db.prepare("SELECT * FROM exact_money_schema ORDER BY slice").all();
    await ensureFreshManualSettlementApplicationSchema(db);
    expect(db.prepare("SELECT * FROM expense_attachment").all()).toEqual([]);
    expect(db.prepare("SELECT * FROM exact_money_schema ORDER BY slice").all()).toEqual(markers);
  } finally { db.close(); }
});
it("adds the owner-order index only to an attested unindexed settlement graph", async () => {
  const db=createDatabaseConnection(":memory:","");
  try {
    await ensureFreshManualSettlementApplicationSchema(db);
    db.exec("DROP INDEX expense_attachment_owner_order_idx");
    const markers=db.prepare("SELECT * FROM app_schema_state ORDER BY key").all();
    await ensureFreshManualSettlementApplicationSchema(db);
    const columns=db.prepare("PRAGMA index_info(expense_attachment_owner_order_idx)").all() as {name:string}[];
    expect(columns.map(column=>column.name)).toEqual(["expense_id","created_at","id"]);
    expect(db.prepare("SELECT * FROM app_schema_state ORDER BY key").all()).toEqual(markers);
    db.exec("DROP INDEX expense_attachment_owner_order_idx; CREATE INDEX expense_attachment_owner_order_idx ON expense_attachment(id)");
    const before=snapshot(db);
    await expect(ensureFreshManualSettlementApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(snapshot(db)).toEqual(before);
  } finally {db.close();}
});

it("refuses the old application graph without adding tables or upgrading data", async () => {
  const db = createDatabaseConnection(":memory:", "");
  try {
    await ensureFreshExactApplicationSchema(db);
    const before = snapshot(db);
    await expect(ensureFreshManualSettlementApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(snapshot(db)).toEqual(before);
    await ensureFreshExactApplicationSchema(db);
    expect(snapshot(db)).toEqual(before);
  } finally { db.close(); }
});
it("does not trust the settlement marker when physical immutability protection is missing", async () => {
  const db = createDatabaseConnection(":memory:", "");
  try {
    await ensureFreshManualSettlementApplicationSchema(db);
    db.exec("DROP TRIGGER manual_settlement_immutable");
    const before = snapshot(db);
    await expect(ensureFreshManualSettlementApplicationSchema(db)).rejects.toThrow(/schema/i);
    expect(snapshot(db)).toEqual(before);
  } finally { db.close(); }
});
