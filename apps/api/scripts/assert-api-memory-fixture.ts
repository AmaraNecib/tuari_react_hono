import Database from "better-sqlite3";
import { assertStockLinks } from "./api-memory-stock-links";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const EXPECTED_SOURCE_PIN = "dd4413845f1a95fa0606d469c1f6705af08cbfd5";
const EXPECTED = {
  employees: 1_000,
  projects: 1_000,
  externalCounterparties: 1_000,
  catalogDefinitions: 1_000,
  warehouses: 1_000,
  debtAccounts: 1_000,
  liveDebtEntries: 1_000,
  debtPayableDzd: "10010.00",
  stockPurchaseGroups: 10,
  stockEntries: 10,
  stockQuantity: 20,
  stockValueDzd: "246.80",
  maximumUserTableRows: 20_000,
} as const;

type SeedResult = {
  sourcePin: string;
  databasePath: string;
  fixtureShape: { employeeStatus: string; transactionDensity: string };
  syntheticOwner: { phone: string; password: string };
  expected: {
    employees: number;
    projects: number;
    externalCounterparties: number;
    catalogDefinitions: number;
    warehouses: number;
    debtAccounts: number;
    liveDebtEntries: number;
    debtPayableDzd: string;
    stockPurchaseGroups: number;
    stockEntries: number;
    stockQuantity: number;
    stockValueDzd: string;
    maximumUserTableRows: number;
  };
};

function fail(message: string): never {
  throw new Error(`Fixture oracle failed: ${message}`);
}

function requireDDrive(path: string): string {
  const resolved = resolve(path);
  if (!/^D:\\/i.test(resolved)) fail(`database path must be on D:, got ${resolved}`);
  return resolved;
}

function count(db: Database.Database, table: string): number {
  const identifier = `"${table.replaceAll('"', '""')}"`;
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${identifier}`).get() as { count: number };
  return row.count;
}

function assertEqual<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) fail(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

function main(): void {
  const [major] = process.versions.node.split(".").map(Number);
  if (process.platform !== "win32" || major !== 22) fail(`oracle requires Windows Node 22, received ${process.platform} Node ${process.version}`);
  const resultPath = process.argv[2];
  if (!resultPath) throw new Error("Usage: assert-api-memory-fixture.ts <seed-result.json>");
  const resolvedResultPath = requireDDrive(resultPath);
  if (basename(resolvedResultPath) !== "seed-result.json") fail("manifest must be seed-result.json in the fixture directory");
  const result = JSON.parse(readFileSync(resolvedResultPath, "utf8")) as SeedResult;
  if (result.sourcePin !== EXPECTED_SOURCE_PIN) fail(`unexpected source pin ${result.sourcePin}`);
  const manifestKeys = Object.keys(result.expected ?? {}).sort();
  const fixedKeys = Object.keys(EXPECTED).sort();
  if (JSON.stringify(manifestKeys) !== JSON.stringify(fixedKeys) || fixedKeys.some(key => result.expected[key as keyof typeof EXPECTED] !== EXPECTED[key as keyof typeof EXPECTED])) fail("manifest cardinalities or exact totals differ from the fixed oracle");
  if (result.fixtureShape?.employeeStatus !== "INACTIVE") fail("manifest does not disclose inactive employee fixture status");
  if (!result.syntheticOwner || result.syntheticOwner.phone !== "0612345678" || typeof result.syntheticOwner.password !== "string" || result.syntheticOwner.password.length < 32) fail("synthetic bootstrap credentials are missing or malformed");
  const databasePath = requireDDrive(result.databasePath);
  if (databasePath !== resolve(dirname(resolvedResultPath), "application.sqlite")) fail("database is not application.sqlite inside the supplied fixture directory");
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma("query_only = ON");
    db.pragma("foreign_keys = ON");
    const expected = EXPECTED;
    const schemaMarkers = db.prepare("SELECT slice, version FROM exact_money_schema ORDER BY slice").all() as Array<{ slice: string; version: number }>;
    const expectedSlices = ["debt", "expenses", "inventory", "invoice", "workforce"];
    assertEqual("exact schema slice count", schemaMarkers.length, expectedSlices.length);
    assertEqual("exact schema markers", JSON.stringify(schemaMarkers), JSON.stringify(expectedSlices.map(slice => ({ slice, version: 1 }))));
    const columnNames = (table: string) => (db.pragma(`table_info("${table}")`) as Array<{ name: string }>).map(column => column.name);
    for (const [table, column] of [["debt_account", "current_balance_minor"], ["debt_entry", "signed_amount_minor"], ["inventory_invoice_group", "gross_total_minor"], ["inventory_entry", "price_source"], ["inventory_consumable_balance", "quantity"]]) {
      if (!columnNames(table).includes(column)) fail(`expected exact-schema column ${table}.${column} is missing`);
    }
    const actualRoots = {
      employees: count(db, "employee"),
      projects: count(db, "project"),
      externalCounterparties: db.prepare("SELECT COUNT(*) AS count FROM external_counterparty WHERE full_name LIKE 'Fixture counterparty %'").get() as { count: number },
      catalogDefinitions: db.prepare("SELECT COUNT(*) AS count FROM inventory_item_definition WHERE name LIKE 'Fixture consumable %'").get() as { count: number },
      warehouses: db.prepare("SELECT COUNT(*) AS count FROM warehouse WHERE name LIKE 'Fixture warehouse %'").get() as { count: number },
    };
    assertEqual("employee rows", actualRoots.employees, expected.employees);
    assertEqual("project rows", actualRoots.projects, expected.projects);
    assertEqual("fixture counterparties", actualRoots.externalCounterparties.count, expected.externalCounterparties);
    assertEqual("fixture catalog definitions", actualRoots.catalogDefinitions.count, expected.catalogDefinitions);
    assertEqual("fixture warehouses", actualRoots.warehouses.count, expected.warehouses);

    const debt = db.prepare(`
      SELECT COUNT(DISTINCT a.id) AS accounts,
             COUNT(e.id) AS liveEntries,
             COALESCE(SUM(a.current_balance_minor), 0) AS payableMinor,
             COALESCE(SUM(e.signed_amount_minor), 0) AS entryMinor,
             COUNT(DISTINCT a.external_counterparty_id) AS linkedCounterparties
      FROM debt_account a
      JOIN external_counterparty p ON p.id = a.external_counterparty_id
      JOIN debt_entry e ON e.debt_account_id = a.id AND e.status = 'LIVE'
      WHERE p.full_name LIKE 'Fixture counterparty %' AND a.direction = 'PAYABLE'
    `).get() as { accounts: number; liveEntries: number; payableMinor: number; entryMinor: number; linkedCounterparties: number };
    assertEqual("fixture debt accounts", debt.accounts, expected.debtAccounts);
    assertEqual("fixture live debt entries", debt.liveEntries, expected.liveDebtEntries);
    assertEqual("debt-linked counterparties", debt.linkedCounterparties, expected.externalCounterparties);
    assertEqual("debt account total minor units", BigInt(debt.payableMinor), BigInt(expected.debtPayableDzd.replace(".", "")));
    assertEqual("debt entry total minor units", BigInt(debt.entryMinor), BigInt(expected.debtPayableDzd.replace(".", "")));

    const stock = db.prepare(`
      WITH per_group AS (
        SELECT g.id,
               g.gross_total_minor AS grossMinor,
               COUNT(DISTINCT e.id) AS entries,
               COALESCE(SUM(b.quantity), 0) AS quantity,
               COUNT(DISTINCT w.id) AS warehouses,
               COUNT(DISTINCT d.id) AS definitions
        FROM inventory_invoice_group g
        JOIN inventory_entry e ON e.invoice_group_id = g.id
        JOIN inventory_consumable_balance b ON b.inventory_entry_id = e.id
        JOIN warehouse w ON w.id = g.warehouse_id AND w.name LIKE 'Fixture warehouse %'
        JOIN inventory_item_definition d ON d.id = e.item_definition_id AND d.name LIKE 'Fixture consumable %'
        GROUP BY g.id, g.gross_total_minor
      )
      SELECT COUNT(*) AS groups,
             COALESCE(SUM(entries), 0) AS entries,
             COALESCE(SUM(grossMinor), 0) AS grossMinor,
             COALESCE(SUM(quantity), 0) AS quantity,
             COALESCE(SUM(warehouses), 0) AS warehouses,
             COALESCE(SUM(definitions), 0) AS definitions
      FROM per_group
    `).get() as { groups: number; entries: number; grossMinor: number; quantity: number; warehouses: number; definitions: number };
    assertEqual("stock purchase groups", stock.groups, expected.stockPurchaseGroups);
    assertEqual("stock entries", stock.entries, expected.stockEntries);
    assertEqual("stock gross minor units", BigInt(stock.grossMinor), BigInt(expected.stockValueDzd.replace(".", "")));
    assertEqual("stock quantity", stock.quantity, expected.stockQuantity);
    const globalLinks = assertStockLinks(db, expected.stockPurchaseGroups);

    const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    const userTableRows = tableNames.reduce((sum, { name }) => sum + count(db, name), 0);
    if (userTableRows > expected.maximumUserTableRows) fail(`user-table rows ${userTableRows} exceed ${expected.maximumUserTableRows}`);
    const foreignKeyFailures = db.pragma("foreign_key_check") as unknown[];
    assertEqual("foreign-key violations", foreignKeyFailures.length, 0);

    process.stdout.write(`${JSON.stringify({
      status: "fixture-verified",
      sourcePin: result.sourcePin,
      databasePath,
      actualRoots: {
        employees: actualRoots.employees,
        projects: actualRoots.projects,
        externalCounterparties: actualRoots.externalCounterparties.count,
        catalogDefinitions: actualRoots.catalogDefinitions.count,
        warehouses: actualRoots.warehouses.count,
      },
      debt: {
        accounts: debt.accounts,
        liveEntries: debt.liveEntries,
        linkedCounterparties: debt.linkedCounterparties,
        payableDzd: expected.debtPayableDzd,
        entrySignedDzd: expected.debtPayableDzd,
      },
      stock: {
        groups: stock.groups,
        entries: stock.entries,
        quantity: stock.quantity,
        valueDzd: expected.stockValueDzd,
        linkedWarehouses: globalLinks.warehouses,
        linkedCatalogDefinitions: globalLinks.definitions,
      },
      userTableRows,
      userTables: tableNames.length,
      foreignKeyViolations: foreignKeyFailures.length,
      readOnly: true,
    })}\n`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
