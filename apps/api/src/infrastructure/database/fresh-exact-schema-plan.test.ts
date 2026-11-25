import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "./factory";
import { freshExactSchemaOwnership, freshExactSchemaPlan } from "./fresh-exact-schema-plan";
import { requireExactMoneySchema } from "./money-schema-gate";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const tempDirs: string[] = [];
function freshDatabase(): BetterSqliteDatabase {
  const directory = mkdtempSync(join(tmpdir(), "tuari-fresh-exact-plan-"));
  tempDirs.push(directory);
  return createDatabaseConnection(join(directory, "fresh.sqlite"), null);
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function executePlan(db: BetterSqliteDatabase, statements = freshExactSchemaPlan): void {
  db.transaction(() => {
    for (const statement of statements) db.exec(statement);
  }).immediate();
}

function columns(db: BetterSqliteDatabase, table: string): Map<string, string> {
  return new Map((db.pragma(`table_info("${table}")`) as { name: string; type: string }[])
    .map(({ name, type }) => [name, type.toUpperCase()]));
}

describe("fresh exact schema plan", () => {
  it("composes exact DDL over the current nonfinancial schema on a new native database", () => {
    const db = freshDatabase();
    try {
      expect(() => executePlan(db)).not.toThrow();

      const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name));
      for (const table of [
        "user", "session", "account", "verification", "app_bootstrap_state", "app_schema_state",
        "role", "role_permission", "employee", "employee_earning", "employee_earning_segment",
        "project", "warehouse", "external_counterparty", "recovery_key", "update_history",
        "debt_account", "debt_entry", "invoice", "invoice_line_item", "payment", "payment_allocation",
        "inventory_invoice_group", "inventory_entry", "inventory_asset_unit", "expense", "expense_revision",
        "employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance",
        "employee_salary_settlement", "employee_salary_advance_offset", "exact_money_schema",
      ]) expect(tables.has(table), `expected table ${table}`).toBe(true);
      const plannedTables = new Set(freshExactSchemaPlan.flatMap((sql) => {
        const match = /^CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?([\w]+)/i.exec(sql);
        return match ? [match[1]] : [];
      }));
      const actualApplicationTables = new Set([...tables].filter((table) => !table.startsWith("sqlite_") && table !== "exact_money_schema").concat("exact_money_schema"));
      expect(actualApplicationTables).toEqual(plannedTables);

      for (const table of freshExactSchemaOwnership.retiredLegacyTables) expect(tables.has(table)).toBe(false);
      const exactIntegerColumns: Record<string, string[]> = {
        debt_account: ["current_balance_minor"],
        debt_entry: ["signed_amount_minor", "balance_after_minor"],
        invoice: ["total_amount_minor", "paid_amount_minor", "remaining_amount_minor"],
        invoice_line_item: ["unit_price_units"],
        payment: ["total_amount_minor"],
        payment_allocation: ["amount_minor"],
        inventory_invoice_group: ["gross_total_minor", "paid_amount_minor", "remaining_debt_minor"],
        inventory_entry: ["unit_price_units"],
        inventory_asset_unit: ["purchase_price_minor"],
        inventory_asset_charge: ["amount_minor"],
        inventory_asset_charge_revision: ["previous_amount_minor", "new_amount_minor"],
        inventory_outbound_transfer_item: ["unit_price_units"],
        expense: ["amount_minor"],
        expense_revision: ["previous_amount_minor", "new_amount_minor"],
        employee_salary_cash: ["amount_minor"],
        employee_salary_payment_allocation: ["amount_minor"],
        employee_salary_advance: ["amount_minor"],
        employee_salary_settlement: ["amount_minor"],
        employee_salary_advance_offset: ["amount_minor"],
        employee_earning: ["total_minor", "unallocated_minor", "reference_salary_units"],
        employee_earning_segment: ["amount_minor"],
      };
      for (const [table, names] of Object.entries(exactIntegerColumns)) {
        const tableColumns = columns(db, table);
        for (const name of names) expect(tableColumns.get(name), `${table}.${name}`).toBe("INTEGER");
      }
      for (const [table, names] of Object.entries({
        debt_account: ["current_balance"], debt_entry: ["signed_amount", "balance_after"],
        invoice: ["total_amount", "paid_amount", "remaining_amount"], payment: ["total_amount", "amount_dzd"],
        inventory_invoice_group: ["gross_total_dzd", "paid_amount_dzd", "remaining_debt_dzd"],
        inventory_entry: ["total_price_dzd", "unit_price_dzd"], expense: ["amount_dzd"],
      })) {
        const tableColumns = columns(db, table);
        for (const name of names) expect(tableColumns.has(name), `${table}.${name} legacy column`).toBe(false);
      }
      expect(columns(db, "employee_earning").has("request_id")).toBe(true);
      expect(columns(db, "employee_earning_segment").has("earning_id")).toBe(true);

      expect(db.prepare("SELECT slice, version FROM exact_money_schema ORDER BY slice").all()).toEqual([
        { slice: "debt", version: 1 }, { slice: "expenses", version: 1 }, { slice: "inventory", version: 1 },
        { slice: "invoice", version: 1 }, { slice: "workforce", version: 1 },
      ]);
      expect(db.pragma("foreign_key_check")).toEqual([]);
      for (const slice of ["debt", "expenses", "inventory", "invoice", "workforce"] as const) {
        expect(() => requireExactMoneySchema(db, slice)).not.toThrow();
      }
    } finally {
      db.close();
    }
  });

  it("rolls back the whole plan when a later statement fails", () => {
    const db = freshDatabase();
    try {
      expect(() => executePlan(db, [...freshExactSchemaPlan, "CREATE TABLE intentionally_invalid ("])).toThrow();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("replaces financial definitions and excludes legacy payroll tables and indexes", () => {
    expect(freshExactSchemaOwnership.replacedBaseTables).toEqual(expect.arrayContaining([
      "debt_account", "debt_entry", "invoice", "invoice_line_item", "payment", "payment_allocation", "expense", "expense_revision",
    ]));
    expect(freshExactSchemaPlan.some(sql => /CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?employee_salary_payment(?:["`\]\s(]|\b)/i.test(sql))).toBe(false);
    expect(freshExactSchemaPlan.some(sql => /ON\s+["`]?employee_salary_payment(?:["`\]\s(]|\b)/i.test(sql))).toBe(false);
    expect(freshExactSchemaPlan.some(sql => /CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?employee_earning(?:["`\]\s(]|\b)/i.test(sql))).toBe(true);
  });
});
