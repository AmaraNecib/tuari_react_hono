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

describe("inert foundation inventory", () => {
  it("accounts once for every initialized monetary column, independently of the approved semantic map", () => {
    const source = read("apps/api/src/infrastructure/database/schema-definitions.ts");
    const physical: string[] = [];
    for (const table of source.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)\)`/g)) {
      for (const column of table[2]!.matchAll(/^\s*"([^"]+)" REAL/gm)) {
        if (column[1] !== "quantity") physical.push(`${table[1]}.${column[1]}`);
      }
    }
    const matrix = read("docs/money/523-caller-matrix.md");
    const rows = [...matrix.matchAll(/^\| ([a-z_]+\.[a-z_]+) \|/gm)].map(row => row[1]!);
    expect(physical).toHaveLength(27);
    expect(new Set(physical.map(field => field.split(".")[0])).size).toBe(17);
    expect(rows.sort()).toEqual(physical.sort());
    expect(new Set(rows).size).toBe(27);
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
      "apps/api/src/modules/expenses/adapters/sqlite-exact-expenses.repository.ts",
      "apps/api/src/modules/expenses/expense-cost-inputs.ts",
      "apps/api/src/modules/expenses/expenses.exact.ts",
      "apps/api/src/modules/inventory/adapters/sqlite-exact-inventory.repository.ts",
      "apps/api/src/modules/inventory/inventory-exact.service.ts",
      "apps/api/src/modules/invoice/adapters/sqlite-exact-invoice.repository.ts",
      "apps/api/src/modules/invoice/invoice-exact.service.ts",
      "apps/web/src/components/ui/currency-amount-input.tsx",
      "apps/web/src/features/inventory/inventory-exact-movement-form.tsx",
      "apps/web/src/features/inventory/inventory-exact-page.tsx",
      "apps/web/src/features/inventory/inventory-exact-purchase-form.tsx",
      "apps/web/src/features/invoices/invoices-exact-page.tsx",
      "apps/web/src/features/shared/exact-money-display.ts",
      "apps/web/src/features/shared/exact-money-input.ts",
      "packages/contracts/src/debts-exact.ts",
      "packages/contracts/src/expenses-exact.ts",
      "packages/contracts/src/index.ts",
      "packages/contracts/src/inventory-exact.ts",
      "packages/contracts/src/invoice-exact.ts",
    ]);
  });
});
