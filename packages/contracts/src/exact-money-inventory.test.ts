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
    const declarations = new Map<string, string>();
    for (const table of source.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)`/g)) {
      for (const column of table[2]!.matchAll(/^\s*"([^"]+)"\s+(REAL|TEXT|INTEGER)\b/gm)) {
        declarations.set(`${table[1]}.${column[1]}`, column[2]!);
      }
    }

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
      "apps/api/src/modules/invoice/adapters/sqlite-exact-invoice.repository.ts",
      "apps/api/src/modules/invoice/invoice-exact.service.ts",
      "apps/api/src/modules/project-cost/adapters/sqlite-project-cost.repository.ts",
      "apps/api/src/modules/project-cost/project-cost.service.ts",
      "apps/api/src/modules/workforce/adapters/sqlite-employee-earning.repository.ts",
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
      "packages/contracts/src/workforce.ts",
    ]);
  }, 15_000);
});
