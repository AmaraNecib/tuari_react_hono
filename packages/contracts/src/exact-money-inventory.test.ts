import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });
}

function initializedMoney(source: string): { declarations: Map<string, string>; candidates: string[] } {
  const declarations = new Map<string, string>();
  for (const table of source.matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:"([^"]+)"|([a-z_]+))\s*\(([\s\S]*?)`/gi)) {
    const tableName = table[1] ?? table[2]!;
    for (const column of table[3]!.matchAll(/^\s*(?:"([^"]+)"|([a-z_]+))\s+(REAL|TEXT|INTEGER)\b/gmi)) {
      declarations.set(`${tableName}.${column[1] ?? column[2]!}`, column[3]!.toUpperCase());
    }
  }
  const candidates = [...declarations].flatMap(([field, type]) => {
    const [tableName, columnName] = field.split(".");
    if (type === "REAL" && columnName !== "quantity") return [field];
    if (type === "INTEGER" && /_(?:minor|units)$/.test(columnName!)) return [field];
    if (type === "TEXT" && columnName === "salary_reference_amount" &&
      ["employee", "employee_state_history"].includes(tableName!) &&
      declarations.has(`${tableName}.salary_reference_period`)) return [field];
    return [];
  });
  return { declarations, candidates };
}

function expectExactInventory(actual: string[], expected: string[]): void {
  expect([...actual].sort()).toEqual([...expected].sort());
}

describe("inert foundation inventory", () => {
  it("accounts once for every initialized monetary column, independently of the approved semantic map", () => {
    const source = read("apps/api/src/infrastructure/database/schema-definitions.ts");
    const { declarations, candidates } = initializedMoney(source);

    const matrix = read("docs/money/523-caller-matrix.md");
    const legacySection = matrix.split("## #543 physical-field reconciliation")[0]!;
    const legacy = [...legacySection.matchAll(/^\| ([a-z_]+\.[a-z_]+) \|/gm)].map(row => row[1]!);
    expect(legacy).toHaveLength(27);
    expect(new Set(legacy).size).toBe(27);

    const reconciliations = [...matrix.matchAll(/^\| ((?:[a-z_]+\.[a-z_]+)|—) \| ([a-z_]+\.[a-z_]+) \| (REAL|TEXT|INTEGER) \| #543 \|/gm)];
    const replaced = new Set(reconciliations.flatMap(row => row[1] === "—" ? [] : [row[1]!]));
    const current = [...legacy.filter(field => !replaced.has(field)), ...reconciliations.map(row => row[2]!)];
    expect(replaced.size).toBe(2);
    expect(current).toHaveLength(31);
    expect(new Set(current).size).toBe(31);
    for (const row of reconciliations) expect(declarations.get(row[2]!)).toBe(row[3]);
    for (const field of current.filter(field => !reconciliations.some(row => row[2] === field))) {
      expect(declarations.has(field), `missing initialized field ${field}`).toBe(true);
      expect(declarations.get(field)).toBe("REAL");
    }
    expect(new Set(current.map(field => field.split(".")[0])).size).toBe(19);
    expectExactInventory(candidates, current);
  });
  it("rejects added or missing monetary fields in the DDL candidate inventory", () => {
    const base = `CREATE TABLE IF NOT EXISTS "employee" (\n  "salary_reference_period" TEXT,\n  "salary_reference_amount" TEXT,\n  "quantity" REAL\n)` + "`";
    const expected = ["employee.salary_reference_amount"];
    expectExactInventory(initializedMoney(base).candidates, expected);
    const withExtra = base.replace(/"quantity" REAL/, `"quantity" REAL,\n  "added_amount_dzd" REAL`);
    expect(() => expectExactInventory(initializedMoney(withExtra).candidates, expected)).toThrow();
    expect(() => expectExactInventory(
      initializedMoney(base.replace("salary_reference_amount", "salary_reference_text")).candidates,
      expected,
    )).toThrow();
  });
  it("limits exact imports to inert storage, opt-in shared UI and isolated debt/expense/commerce consumers", () => {
    const imports: string[] = [];
    for (const dir of ["apps/api/src", "apps/web/src", "packages/contracts/src"]) {
      for (const path of sources(join(root, dir))) {
        const source = readFileSync(path, "utf8");
        if (/from ["'][^"']*exact-money["']|export \* from ["'][^"']*exact-money["']/.test(source) || /import\s*\{[^}]*\b(?:Money|UnitPrice|Quantity|SalaryReference|finalizeLines|allocateMoney)\b[^}]*\}\s*from\s*["']@tuari\/contracts["']/s.test(source)) {
          imports.push(relative(root, path).replaceAll("\\", "/"));
        }
      }
    }
    expect(imports.sort()).toEqual([
      "apps/api/src/infrastructure/database/exact-money-storage.ts",
      "apps/api/src/modules/company/adapters/inmemory-exact-finance.repository.ts",
      "apps/api/src/modules/company/adapters/sqlite-exact-finance.repository.ts",
      "apps/api/src/modules/company/exact-finance.service.ts",
      "apps/api/src/modules/company/workforce.service.ts",
      "apps/api/src/modules/expenses/adapters/sqlite-exact-expenses.repository.ts",
      "apps/api/src/modules/expenses/expense-cost-inputs.ts",
      "apps/api/src/modules/expenses/expenses.exact.ts",
      "apps/api/src/modules/inventory/adapters/sqlite-exact-inventory.repository.ts",
      "apps/api/src/modules/inventory/inventory-exact.service.ts",
      "apps/api/src/modules/inventory/inventory.service.ts",
      "apps/api/src/modules/invoice/adapters/sqlite-exact-invoice.repository.ts",
      "apps/api/src/modules/invoice/invoice-exact.service.ts",
      "apps/api/src/modules/project-cost/adapters/sqlite-project-cost.repository.ts",
      "apps/api/src/modules/project-cost/project-cost.service.ts",
      "apps/api/src/modules/workforce/adapters/sqlite-employee-earning.repository.ts",
      "apps/api/src/modules/workforce/adapters/sqlite-payroll-cash.repository.ts",
      "apps/api/src/modules/workforce/adapters/sqlite-payroll-lifecycle.reader.ts",
      "apps/api/src/modules/workforce/adapters/sqlite-payroll-offset.repository.ts",
      "apps/api/src/modules/workforce/adapters/sqlite-payroll-source.repository.ts",
      "apps/api/src/modules/workforce/payroll.service.ts",
      "apps/web/src/components/ui/currency-amount-input.tsx",
      "apps/web/src/features/employees/employee-earning-allocation.ts",
      "apps/web/src/features/employees/employee-edit-page.tsx",
      "apps/web/src/features/inventory/inventory-exact-movement-form.tsx",
      "apps/web/src/features/inventory/inventory-exact-page.tsx",
      "apps/web/src/features/inventory/inventory-exact-purchase-form.tsx",
      "apps/web/src/features/invoices/invoices-exact-page.tsx",
      "apps/web/src/features/projects/project-cost-section.tsx",
      "apps/web/src/features/shared/exact-money-display.ts",
      "apps/web/src/features/shared/exact-money-input.ts",
      "packages/contracts/src/debts-exact.ts",
      "packages/contracts/src/expenses-exact.ts",
      "packages/contracts/src/index.ts",
      "packages/contracts/src/inventory-exact.ts",
      "packages/contracts/src/invoice-exact.ts",
      "packages/contracts/src/payment.ts",
      "packages/contracts/src/workforce.ts",
    ]);
  }, 15_000);
});
