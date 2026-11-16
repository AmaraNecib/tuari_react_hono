import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureExactNormalWorkspaceSchema, getExactWorkspaceId } from "./exact-normal-workspace-schema";
import type { BetterSqliteDatabase } from "../../types/sqlite";

function fresh() {
  return new Database(":memory:") as unknown as BetterSqliteDatabase;
}

describe("normal exact workspace schema", () => {
  it("creates the exact employee and earnings workspace without legacy payroll or later cash tables", () => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual([
        { slice: "debt", version: 1 },
        { slice: "workforce", version: 1 },
      ]);
      const employeeColumns = db.pragma("table_info(employee)") as { name: string; type: string }[];
      expect(employeeColumns.map(column => [column.name, column.type])).toContainEqual(["salary_reference_units", "INTEGER"]);
      expect(employeeColumns.map(column => column.name)).not.toContain("salary_amount_dzd");
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('employee_salary_cash','employee_salary_earning','employee_salary_earning_segment','debt_account','debt_entry') ORDER BY name").all()).toEqual([
        { name: "debt_account" }, { name: "debt_entry" }, { name: "employee_salary_earning" }, { name: "employee_salary_earning_segment" },
      ]);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee_salary_cash'").get()).toBeUndefined();
      expect(getExactWorkspaceId(db)).toMatch(/^[0-9a-f-]{36}$/i);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recovery_key'").get()).toEqual({ name: "recovery_key" });
    } finally { db.close(); }
  });

  it("reopens idempotently and validates the physical schema", () => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      const workspaceId = getExactWorkspaceId(db);
      ensureExactNormalWorkspaceSchema(db);
      expect(getExactWorkspaceId(db)).toBe(workspaceId);
      db.exec("ALTER TABLE employee_salary_earning RENAME COLUMN approved_amount_minor TO wrong_units");
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/invalid exact.*schema|exact.*column/i);
    } finally { db.close(); }
  });

  it.each([
    ["missing identity", "DROP TABLE exact_workspace_identity"],
    ["corrupt identity", "UPDATE exact_workspace_identity SET workspace_id='not-a-uuid'"],
    ["empty identity", "DELETE FROM exact_workspace_identity"],
  ])("refuses %s without silently recreating it", (_name, corrupt) => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      db.exec(corrupt);
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/exact workspace identity/i);
    } finally { db.close(); }
  });

  it("refuses an existing legacy database without modifying it", () => {
    const db = fresh();
    try {
      db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY, salary_amount_dzd REAL)");
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/fresh exact workspace/i);
      const columns = db.pragma("table_info(employee)") as { name: string }[];
      expect(columns.map(column => column.name)).toEqual(["id", "salary_amount_dzd"]);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='exact_money_schema'").get()).toBeUndefined();
    } finally { db.close(); }
  });
});
