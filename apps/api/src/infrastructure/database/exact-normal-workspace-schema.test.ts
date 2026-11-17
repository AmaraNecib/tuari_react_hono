import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureExactNormalWorkspaceSchema, getExactWorkspaceId } from "./exact-normal-workspace-schema";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const unsupportedLaterFeatureDdl = "CREATE TABLE unsupported_later_feature(id TEXT PRIMARY KEY)";

function fresh() {
  return new Database(":memory:") as unknown as BetterSqliteDatabase;
}

function replaceTableDefinition(db: BetterSqliteDatabase, table: string, editSql: (sql: string) => string): void {
  const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql: string };
  const dependentObjects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name").all(table) as { sql: string }[];
  const changed = editSql(definition.sql);
  if (changed === definition.sql) throw new Error(`Test mutation did not change ${table} DDL`);
  db.pragma("foreign_keys = OFF");
  db.exec(`DROP TABLE "${table}"`);
  db.exec(changed);
  for (const { sql } of dependentObjects) db.exec(sql);
  db.pragma("foreign_keys = ON");
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

  it("refuses a marked workspace containing an unsupported later-feature table without changing it", () => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      const markerBefore = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
      db.exec(unsupportedLaterFeatureDdl);
      const tableBefore = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name='unsupported_later_feature'").all();
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/unexpected exact workspace tables: unsupported_later_feature/i);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual(markerBefore);
      expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name='unsupported_later_feature'").all()).toEqual(tableBefore);
    } finally { db.close(); }
  });

  it.each([
    ["missing no-replace guard", "DROP TRIGGER exact_salary_earning_no_replace"],
    ["missing immutable update guard", "DROP TRIGGER employee_salary_earning_update_immutable"],
    ["missing immutable delete guard", "DROP TRIGGER employee_salary_earning_delete_immutable"],
  ])("refuses %s before accepting the marked workspace", (_name, drift) => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      db.exec(drift);
      const markerBefore = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
      const guard = drift.split(" ").at(-1);
      const triggerBefore = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type='trigger' AND name=?").all(guard);
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/physical schema|trigger/i);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual(markerBefore);
      expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE type='trigger' AND name=?").all(guard)).toEqual(triggerBefore);
    } finally { db.close(); }
  });

  it("refuses an unapproved trigger without changing master, markers, or employee data", () => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      const role = db.prepare("SELECT id FROM role ORDER BY id LIMIT 1").get() as { id: string };
      db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,salary_reference_units,salary_period,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',10,'MONTHLY','now','now')")
        .run("employee-1", "A", "One", "0555000001", role.id);
      db.exec("CREATE TRIGGER unapproved_salary_rewrite AFTER UPDATE OF salary_reference_units ON employee BEGIN UPDATE employee SET salary_reference_units=999 WHERE id=NEW.id; END");
      const schemaBefore = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
      const markerBefore = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
      const employeeBefore = db.prepare("SELECT id,salary_reference_units FROM employee ORDER BY id").all();
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/unexpected exact workspace trigger: unapproved_salary_rewrite/i);
      expect(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(schemaBefore);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual(markerBefore);
      expect(db.prepare("SELECT id,salary_reference_units FROM employee ORDER BY id").all()).toEqual(employeeBefore);
    } finally { db.close(); }
  });

  it("refuses an unapproved explicit index without changing the schema marker", () => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      db.exec("CREATE INDEX unapproved_employee_salary_idx ON employee(salary_reference_units)");
      const schemaBefore = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
      const markerBefore = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/unexpected exact workspace index: unapproved_employee_salary_idx/i);
      expect(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(schemaBefore);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual(markerBefore);
    } finally { db.close(); }
  });

  it("refuses a no-op replacement of the earning no-replace guard", () => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      db.exec("DROP TRIGGER exact_salary_earning_no_replace; CREATE TRIGGER exact_salary_earning_no_replace BEFORE INSERT ON employee_salary_earning BEGIN SELECT 1; END");
      const triggerBefore = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='exact_salary_earning_no_replace'").get();
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/physical schema|trigger/i);
      expect(db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='exact_salary_earning_no_replace'").get()).toEqual(triggerBefore);
    } finally { db.close(); }
  });

  it.each([
    ["lost role permission uniqueness", (sql: string) => sql.replace('    UNIQUE ("role_id", "permission"),\n', ""), (db: BetterSqliteDatabase) => {
      const uniqueIndexes = (db.pragma('index_list("role_permission")') as { name: string; unique: number }[]).filter(index => index.unique);
      return uniqueIndexes.every(index => (db.pragma(`index_info("${index.name}")`) as { name: string }[]).map(column => column.name).join(",") !== "role_id,permission");
    }],
    ["lost role permission foreign key", (sql: string) => sql.replace(/,\s*CONSTRAINT "role_permission_role_id_fkey"[\s\S]*?ON UPDATE CASCADE/, ""), (db: BetterSqliteDatabase) => (db.pragma('foreign_key_list("role_permission")') as { table: string }[]).length === 0],
    ["lost role permission cascade behavior", (sql: string) => sql.replace(" ON DELETE CASCADE ON UPDATE CASCADE", " ON DELETE RESTRICT ON UPDATE CASCADE"), (db: BetterSqliteDatabase) => (db.pragma('foreign_key_list("role_permission")') as { on_delete: string }[])[0]?.on_delete === "RESTRICT"],
  ])("refuses %s without repairing schema or marker", (_name, editSql, confirmsMutation) => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      replaceTableDefinition(db, "role_permission", editSql);
      expect(confirmsMutation(db)).toBe(true);
      const schemaBefore = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
      const identityBefore = db.prepare("SELECT singleton,workspace_id FROM exact_workspace_identity").all();
      const markerBefore = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/physical schema.*role_permission/i);
      expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(schemaBefore);
      expect(db.prepare("SELECT singleton,workspace_id FROM exact_workspace_identity").all()).toEqual(identityBefore);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual(markerBefore);
    } finally { db.close(); }
  });

  it.each([
    ["lost earning segment ordinal uniqueness", (sql: string) => sql.replace(", UNIQUE(earning_id,ordinal)", "")],
    ["changed earning segment project foreign key", (sql: string) => sql.replace("REFERENCES project(id) ON DELETE RESTRICT", "REFERENCES role(id) ON DELETE RESTRICT")],
    ["lost earning segment integer and nonnegative check", (sql: string) => sql.replace("CHECK(typeof(amount_minor)='integer' AND amount_minor>=0)", "")],
  ])("refuses %s without repairing schema or marker", (_name, editSql) => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      replaceTableDefinition(db, "employee_salary_earning_segment", editSql);
      const schemaBefore = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
      const markerBefore = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(/physical schema.*employee_salary_earning_segment/i);
      expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(schemaBefore);
      expect(db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all()).toEqual(markerBefore);
    } finally { db.close(); }
  });

  it.each([
    ["removed debt account currency check", (db: BetterSqliteDatabase) => replaceTableDefinition(db, "debt_account", sql => sql.replace("CHECK(currency='DZD')", "")), /physical schema.*table debt_account/i],
    ["removed debt posting order index", (db: BetterSqliteDatabase) => db.exec("DROP INDEX debt_entry_posting_order"), /physical schema.*index debt_entry_posting_order/i],
  ])("refuses %s while debt column names remain unchanged", (_name, drift, expectedError) => {
    const db = fresh();
    try {
      ensureExactNormalWorkspaceSchema(db);
      drift(db);
      const accountColumns = db.pragma("table_info(debt_account)") as { name: string }[];
      const schemaBefore = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
      expect(accountColumns.map(({ name }) => name)).toContain("currency");
      expect(() => ensureExactNormalWorkspaceSchema(db)).toThrow(expectedError);
      expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).toEqual(schemaBefore);
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
