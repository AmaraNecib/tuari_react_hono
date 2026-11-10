import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "./factory";
import { ensureDatabaseSchema } from "./schema";
import { BetterSqlite3Executor } from "./sqlite-executor";
import { requireExactMoneySchema } from "./money-schema-gate";

// Synthetic isolated schemas only. No application database is opened.
describe.each([["plain", ""], ["keyed", "524-public-fixture-key"]])("money startup isolation: %s", (_driver, key) => {
  it("rejects an exact schema before legacy initialization can mutate it", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-524-gate-")), "fixture.sqlite");
    const db = createDatabaseConnection(path, key);
    try {
      db.exec("CREATE TABLE exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL); INSERT INTO exact_money_schema VALUES ('debt',1)");
      const before = db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
      await expect(ensureDatabaseSchema(new BetterSqlite3Executor(db))).rejects.toThrow(/coordinated.*activation/i);
      expect(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all()).toEqual(before);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema").all()).toEqual([{ slice: "debt", version: 1 }]);
    } finally { db.close(); }
  });

  it("keeps fresh and reopened legacy schemas numeric without installing an exact marker", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-524-legacy-")), "fixture.sqlite");
    let db = createDatabaseConnection(path, key);
    try {
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      db.close();
      db = createDatabaseConnection(path, key);
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      const debt = db.pragma("table_info(debt_account)") as { name: string; type: string }[];
      const expenses = db.pragma("table_info(expense)") as { name: string; type: string }[];
      expect(debt.find(column => column.name === "current_balance")?.type).toBe("REAL");
      expect(expenses.find(column => column.name === "amount_dzd")?.type).toBe("REAL");
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='exact_money_schema'").get()).toBeUndefined();
    } finally { db.close(); }
  });

  it.each([
    'CREATE TABLE debt_account(id TEXT PRIMARY KEY, current_balance_minor INTEGER, currency TEXT)',
    'CREATE TABLE debt_entry(id TEXT PRIMARY KEY, signed_amount INTEGER, balance_after INTEGER)',
    'CREATE TABLE expense(id TEXT PRIMARY KEY, amount_minor INTEGER, currency TEXT)',
    'CREATE TABLE expense_revision(id TEXT PRIMARY KEY, previous_amount_minor INTEGER, new_amount_minor INTEGER)',
  ])("rejects an unmarked converted schema without writing: %s", async (sql) => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-524-gate-")), "fixture.sqlite");
    const db = createDatabaseConnection(path, key);
    try {
      db.exec(sql);
      const before = db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
      await expect(ensureDatabaseSchema(new BetterSqlite3Executor(db))).rejects.toThrow(/coordinated.*activation/i);
      expect(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all()).toEqual(before);
    } finally { db.close(); }
  });
});

describe("exact adapter schema prerequisite", () => {
  it("rejects malformed marker columns and duplicate slice records", () => {
    const db = createDatabaseConnection(":memory:", "");
    try {
      db.exec("CREATE TABLE exact_money_schema(slice TEXT, version INTEGER); INSERT INTO exact_money_schema VALUES ('debt',1),('debt',2)");
      expect(() => requireExactMoneySchema(db, "debt")).toThrow(/marker/);
    } finally { db.close(); }
  });
  it("requires the matching versioned table marker, not a view or another slice", () => {
    const db = createDatabaseConnection(":memory:", "");
    try {
      expect(() => requireExactMoneySchema(db, "debt")).toThrow(/marker/);
      db.exec("CREATE VIEW exact_money_schema AS SELECT 'debt' AS slice, 1 AS version");
      expect(() => requireExactMoneySchema(db, "debt")).toThrow(/marker/);
      db.exec("DROP VIEW exact_money_schema; CREATE TABLE exact_money_schema(slice TEXT PRIMARY KEY,version INTEGER NOT NULL); INSERT INTO exact_money_schema VALUES ('expenses',1)");
      expect(() => requireExactMoneySchema(db, "debt")).toThrow(/version/);
      expect(() => requireExactMoneySchema(db, "expenses")).not.toThrow();
      db.exec("INSERT INTO exact_money_schema VALUES ('debt',2)");
      expect(() => requireExactMoneySchema(db, "debt")).toThrow(/version/);
      db.exec("UPDATE exact_money_schema SET version=1 WHERE slice='debt'");
      expect(() => requireExactMoneySchema(db, "debt")).not.toThrow();
    } finally { db.close(); }
  });
});
