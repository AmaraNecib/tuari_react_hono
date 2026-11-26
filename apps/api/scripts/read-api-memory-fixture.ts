import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type FixtureManifest = {
  databasePath: string;
  syntheticOwner: { phone: string; password: string };
  expected: {
    employees: number;
    projects: number;
    externalCounterparties: number;
    catalogDefinitions: number;
    warehouses: number;
    debtAccounts: number;
    debtPayableDzd: string;
    stockPurchaseGroups: number;
    stockValueDzd: string;
  };
};

type RpcResult = { status: number; json: unknown };

function requireLoopbackOrigin(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`API origin must be a plain 127.0.0.1 URL, received ${value}`);
  }
  return url;
}

function fail(message: string): never {
  throw new Error(`Authenticated fixture read failed: ${message}`);
}

async function checkedFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
}

async function rpc(origin: string, token: string, path: string, input: unknown = null): Promise<unknown> {
  const response = await checkedFetch(`${origin}/rpc/${path}`, {
    method: "POST",
    headers: {
      origin,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.json() as RpcResult;
  if (!response.ok || !Object.hasOwn(body, "json")) fail(`${path} returned HTTP ${response.status} without an ORPC JSON envelope`);
  return body.json;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} was not an object`);
  return value as Record<string, unknown>;
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) fail(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

async function main(): Promise<void> {
  const manifestPath = process.argv[2];
  const originInput = process.argv[3];
  if (!manifestPath || !originInput) throw new Error("Usage: read-api-memory-fixture.ts <seed-result.json> <http://127.0.0.1:port>");
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as FixtureManifest;
  const origin = requireLoopbackOrigin(originInput).origin;
  if (resolve(manifest.databasePath) !== resolve(dirname(resolve(manifestPath)), "application.sqlite")) fail("manifest database does not belong to its fixture directory");

  const healthResponse = await checkedFetch(`${origin}/health`, { method: "GET" });
  const health = await healthResponse.json() as { status?: unknown };
  if (!healthResponse.ok || health.status !== "ok") fail(`/health returned HTTP ${healthResponse.status} or a non-ready body`);

  const signIn = await checkedFetch(`${origin}/api/auth/sign-in/phone-number`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      phoneNumber: manifest.syntheticOwner.phone,
      password: manifest.syntheticOwner.password,
    }),
  });
  const auth = await signIn.json() as { token?: unknown };
  if (!signIn.ok || typeof auth.token !== "string" || auth.token.length < 16) fail(`supported phone sign-in returned HTTP ${signIn.status} without a token`);
  const token = auth.token;

  const metadata = requireObject(await rpc(origin, token, "financial/metadata"), "financial/metadata");
  const arrays = ["employees", "projects", "externalCounterparties", "warehouses"] as const;
  for (const key of arrays) {
    if (!Array.isArray(metadata[key])) fail(`financial/metadata.${key} was not an array`);
  }
  assertEqual("metadata employees", (metadata.employees as unknown[]).length, manifest.expected.employees);
  assertEqual("metadata projects", (metadata.projects as unknown[]).length, manifest.expected.projects);
  assertEqual("metadata counterparties", (metadata.externalCounterparties as unknown[]).length, manifest.expected.externalCounterparties);
  assertEqual("metadata warehouses", (metadata.warehouses as unknown[]).length, manifest.expected.warehouses);
  const employeeStatuses = (metadata.employees as Array<Record<string, unknown>>).reduce<Record<string, number>>((counts, employee) => {
    const status = employee.status;
    counts[typeof status === "string" ? status : "<invalid>"] = (counts[typeof status === "string" ? status : "<invalid>"] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  assertEqual("inactive employee rows", employeeStatuses.INACTIVE, manifest.expected.employees);

  const debt = requireObject(await rpc(origin, token, "financial/debts/summary"), "financial/debts/summary");
  if (!Array.isArray(debt.accounts)) fail("debt summary accounts was not an array");
  assertEqual("debt summary account count", debt.accounts.length, manifest.expected.debtAccounts);
  assertEqual("debt summary payable", debt.grossPayableDzd, manifest.expected.debtPayableDzd);
  assertEqual("debt summary receivable", debt.grossReceivableDzd, "0.00");

  const definitions = await rpc(origin, token, "financial/inventory/definitions");
  if (!Array.isArray(definitions)) fail("exact inventory definitions response was not an array");
  assertEqual("exact inventory definitions", definitions.length, manifest.expected.catalogDefinitions);

  const invoices = await rpc(origin, token, "financial/inventory/listInvoices");
  if (!Array.isArray(invoices)) fail("exact inventory invoice response was not an array");
  assertEqual("exact inventory invoices", invoices.length, manifest.expected.stockPurchaseGroups);
  for (const [index, invoice] of invoices.entries()) {
    const row = requireObject(invoice, `inventory invoice ${index}`);
    assertEqual(`inventory invoice ${index} gross`, row.grossTotalDzd, "24.68");
    assertEqual(`inventory invoice ${index} warehouse`, typeof row.warehouseId, "string");
  }

  const reportValue = requireObject(await rpc(origin, token, "financial/reports/generate", { type: "INVENTORY" }), "inventory report");
  const inventorySummary = requireObject(reportValue.summary, "inventory report summary");
  assertEqual("inventory report total", inventorySummary.totalValueDzd, manifest.expected.stockValueDzd);
  assertEqual("inventory report consumables", inventorySummary.totalConsumablesDzd, manifest.expected.stockValueDzd);
  assertEqual("inventory report assets", inventorySummary.totalAssetsDzd, "0.00");

  const debtReportValue = requireObject(await rpc(origin, token, "financial/reports/generate", { type: "DEBT" }), "debt report");
  const debtSummary = requireObject(debtReportValue.summary, "debt report summary");
  assertEqual("debt report outstanding", debtSummary.totalOutstandingDzd, manifest.expected.debtPayableDzd);
  assertEqual("debt report party count", debtSummary.partyCount, manifest.expected.externalCounterparties);

  process.stdout.write(`${JSON.stringify({
    status: "authenticated-reads-verified",
    origin,
    health: "ok",
    signIn: "supported phone/password endpoint",
    checks: {
      employees: manifest.expected.employees,
      employeeStatus: "all INACTIVE",
      projects: manifest.expected.projects,
      externalCounterparties: manifest.expected.externalCounterparties,
      warehouses: manifest.expected.warehouses,
      catalogDefinitions: definitions.length,
      debtAccounts: debt.accounts.length,
      payableDzd: debt.grossPayableDzd,
      stockInvoices: invoices.length,
      inventoryValueDzd: inventorySummary.totalValueDzd,
      debtReportDzd: debtSummary.totalOutstandingDzd,
    },
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
