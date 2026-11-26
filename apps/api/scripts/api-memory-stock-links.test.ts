import Database from "better-sqlite3";
import { test, expect } from "vitest";
import { assertStockLinks } from "./api-memory-stock-links";

test.each(["distinct", "warehouse", "definition"])("global stock identity check: %s", mode => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE inventory_invoice_group(id TEXT, warehouse_id TEXT); CREATE TABLE inventory_entry(id TEXT, invoice_group_id TEXT, item_definition_id TEXT); CREATE TABLE inventory_consumable_balance(inventory_entry_id TEXT); CREATE TABLE warehouse(id TEXT, name TEXT); CREATE TABLE inventory_item_definition(id TEXT, name TEXT)");
    for (let i = 0; i < 10; i++) {
      db.prepare("INSERT INTO warehouse VALUES (?, ?)").run(String(i), `Fixture warehouse ${i}`);
      db.prepare("INSERT INTO inventory_item_definition VALUES (?, ?)").run(String(i), `Fixture consumable ${i}`);
      db.prepare("INSERT INTO inventory_invoice_group VALUES (?, ?)").run(String(i), mode === "warehouse" ? "0" : String(i));
      db.prepare("INSERT INTO inventory_entry VALUES (?, ?, ?)").run(String(i), String(i), mode === "definition" ? "0" : String(i));
      db.prepare("INSERT INTO inventory_consumable_balance VALUES (?)").run(String(i));
    }
    if (mode === "distinct") expect(assertStockLinks(db, 10)).toEqual({ warehouses: 10, definitions: 10 });
    else expect(() => assertStockLinks(db, 10)).toThrow(/globally distinct/);
  } finally { db.close(); }
});
