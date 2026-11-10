import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Money, UnitPrice } from "@tuari/contracts";
import { createDatabaseConnection } from "./factory";
import { ensureDatabaseSchema } from "./schema";
import { BetterSqlite3Executor } from "./sqlite-executor";
import { bindMoney, bindUnitPrice, prepareMoneyRead, prepareUnitPriceRead } from "./exact-money-storage";

// Fresh isolated fixtures only. Keep files for inspection; never touch application databases.
describe.each([["plain", ""], ["encrypted", "523-public-test-key"]])("exact-money native capability: %s", (name, key) => {
  it("binds and reopens exact values, isolates safe reads and distinguishes NULL/zero/missing", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-523-")), "proof.sqlite");
    let db = createDatabaseConnection(path, key);
    const expected = ["-9223372036854775807", "-9007199254740993", "0", "9007199254740992", "9007199254740993", "9223372036854775807"];
    try {
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      const paymentColumns = db.pragma("table_info(payment)") as { name: string; type: string }[];
      expect(paymentColumns.find(c => c.name === "total_amount")?.type).toBe("REAL");
      expect(paymentColumns.some(c => c.name === "amount_dzd")).toBe(false);
      const allocationColumns = db.pragma("table_info(payment_allocation)") as { name: string; type: string }[];
      expect(allocationColumns.find(c => c.name === "amount")?.type).toBe("REAL");
      db.exec("CREATE TABLE proof_money(id INTEGER PRIMARY KEY, amount INTEGER CHECK(typeof(amount)='integer' OR amount IS NULL), flag INTEGER, quantity REAL); CREATE TABLE proof_price(amount INTEGER NOT NULL CHECK(typeof(amount)='integer'))");
      const insert = db.prepare("INSERT INTO proof_money(amount,flag,quantity) VALUES (?, ?, ?)");
      for (const value of expected) insert.run(bindMoney(Money.fromMinorUnits(value)), true, 1.125);
      insert.run(null, false, 0);
      db.prepare("INSERT INTO proof_price VALUES (?)").run(bindUnitPrice(UnitPrice.parse("922337203685477.5807")));
      const read = prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money ORDER BY amount,id");
      expect(read.all().map(v => v?.toMinorUnits() ?? null)).toEqual([null, ...expected]);
      expect(prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money WHERE id=?").get(5)?.toMinorUnits()).toBe("9007199254740993");
      expect(prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money WHERE id=?").get(99)).toBeUndefined();
      expect(prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money WHERE id=?").get(7)).toBeNull();
      expect(prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money WHERE amount > ? ORDER BY amount,id").all(9007199254740992n).map(v => v?.toMinorUnits())).toEqual(["9007199254740993", "9223372036854775807"]);
      expect(prepareUnitPriceRead(db, "SELECT amount AS scaled_units FROM proof_price").get()?.toWire()).toBe("922337203685477.5807");
      expect(prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money WHERE flag=? ORDER BY id LIMIT 1").get(true)?.toMinorUnits()).toBe("-9223372036854775807");
      expect(db.prepare("SELECT flag, quantity FROM proof_money WHERE id=1").get()).toEqual({ flag: 1, quantity: 1.125 });
      expect(db.prepare("SELECT count(*) AS count FROM proof_money").get()).toEqual({ count: 7 });
      expect(() => prepareMoneyRead(db, "SELECT amount AS minor_units, id FROM proof_money")).toThrow(/projection/);
      expect(() => prepareMoneyRead(db, "SELECT amount FROM proof_money")).toThrow(/projection/);
      expect(() => prepareMoneyRead(db, "SELECT 1.25 AS minor_units").get()).toThrow(/integer/);
      expect(() => prepareMoneyRead(db, "SELECT '100' AS minor_units").get()).toThrow(/integer/);
      expect(() => prepareMoneyRead(db, "SELECT -9223372036854775808 AS minor_units").get()).toThrow(/bounds/);
      expect(() => prepareMoneyRead(db, "SELECT SUM(amount) AS minor_units FROM proof_money WHERE id IN (5,6)").get()).toThrow(/overflow/);
      expect(() => insert.run(1.25, true, 0)).toThrow(/CHECK/);
      const update = db.transaction(() => {
        db.prepare("UPDATE proof_money SET amount=? WHERE id=3").run(bindMoney(Money.parse("1")));
        Money.fromMinorUnits("9223372036854775807").add(Money.parse("0.01"));
      });
      expect(() => update()).toThrow(/bounds/);
      expect(prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money WHERE id=3").get()?.toWire()).toBe("0.00");
      db.close();
      db = createDatabaseConnection(path, key);
      expect(prepareMoneyRead(db, "SELECT amount AS minor_units FROM proof_money WHERE amount IS NOT NULL ORDER BY amount,id").all().map(v => v?.toMinorUnits())).toEqual(expected);
    } finally { db.close(); }
    expect(readFileSync(path).subarray(0, 15).toString("latin1") === "SQLite format 3").toBe(name === "plain");
    if (key) {
      expect(() => createDatabaseConnection(path, "wrong-key")).toThrow(/not a database/i);
      expect(() => createDatabaseConnection(path, "")).toThrow(/not a database/i);
    }
  });
});
