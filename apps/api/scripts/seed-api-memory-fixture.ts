import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createAppConfig } from "../src/config";
import { createFreshExactAppDependencies } from "../src/app/fresh-exact-dependencies";

const ROOTS = 1_000;
const STOCK_GROUPS = 10;
const AMOUNT_PER_DEBT_MINOR = 1_001n;
const STOCK_QUANTITY_PER_GROUP = 2;
const STOCK_UNIT_PRICE_MINOR = 1_234n;
const WRAPPER_SENTINEL = "TUARI_175_SAFETY_WRAPPER";
const SOURCE_PIN = "dd4413845f1a95fa0606d469c1f6705af08cbfd5";
const MAX_USER_TABLE_ROWS = 20_000;
const ROW_CHECK_CHUNK = 50;

function requireRuntimeAndWrapper(): void {
  const [major] = process.versions.node.split(".").map(Number);
  if (process.platform !== "win32" || major !== 22) {
    throw new Error(`Fixture requires Windows Node 22; received ${process.platform} Node ${process.version}`);
  }
  if (process.env[WRAPPER_SENTINEL] !== "1") {
    throw new Error(`Refusing fixture writes without ${WRAPPER_SENTINEL}=1 from the safety wrapper`);
  }
  if (!process.env.TEMP?.toLowerCase().startsWith("d:\\") || !process.env.TMP?.toLowerCase().startsWith("d:\\")) {
    throw new Error("TEMP and TMP must both be on D: before fixture creation");
  }
}

function fixtureDirectory(): string {
  const raw = process.argv[2];
  if (!raw) throw new Error("Usage: seed-api-memory-fixture.ts <new-absolute-D-drive-directory>");
  const directory = resolve(raw);
  if (!/^D:\\/i.test(directory)) throw new Error(`Fixture path must be on D:, received ${directory}`);
  return directory;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function phone(index: number, prefix: string): string {
  return `${prefix}${String(5_000_000 + index).padStart(7, "0")}`;
}

function logProgress(message: string): void {
  process.stderr.write(`${message}\n`);
}

function readUserTableRows(db: Database.Database): number {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  const counts = tables.map(({ name }) => {
    const identifier = `"${name.replaceAll('"', '""')}"`;
    return `(SELECT COUNT(*) FROM ${identifier})`;
  });
  const query = db.prepare(`SELECT ${counts.length ? counts.join(" + ") : "0"} AS total`);
  return Number((query.get() as { total: number }).total);
}

function checkRowChunk(db: Database.Database, label: string, index: number, total: number): void {
  if ((index + 1) % ROW_CHECK_CHUNK !== 0 && index + 1 !== total) return;
  const rows = readUserTableRows(db);
  if (rows > MAX_USER_TABLE_ROWS) throw new Error(`${label} chunk ${index + 1}: ${rows} user-table rows exceed ${MAX_USER_TABLE_ROWS}`);
  logProgress(`Row-cap checkpoint ${label} ${index + 1}/${total}: ${rows}/${MAX_USER_TABLE_ROWS}`);
}

async function main(): Promise<void> {
  requireRuntimeAndWrapper();
  const directory = fixtureDirectory();
  const testSecret = process.env.TUARI_175_TEST_SECRET;
  if (!testSecret || testSecret.length < 32) throw new Error("Safety wrapper must supply a disposable TUARI_175_TEST_SECRET of at least 32 characters");
  const apiPort = Number(process.env.TUARI_175_API_PORT);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65_535) throw new Error("Safety wrapper must supply TUARI_175_API_PORT");
  const origin = `http://127.0.0.1:${apiPort}`;
  mkdirSync(directory, { recursive: false });
  const databasePath = resolve(directory, "application.sqlite");
  const resultPath = resolve(directory, "seed-result.json");
  const config = createAppConfig({
    ...process.env,
    TUARI_CONFIG_FILE: "",
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: testSecret,
    BOOTSTRAP_SETUP_KEY: "",
    APP_DB_PATH: databasePath,
    APP_DB_KEY: "",
    APP_ATTACHMENTS_ROOT: resolve(directory, "attachments"),
    APP_BACKUPS_ROOT: resolve(directory, "backups"),
    DB_ADAPTER: "sqlite",
    API_HOST: "127.0.0.1",
    API_PORT: String(apiPort),
    WEB_PORT: String(apiPort),
    ALLOWED_ORIGINS: origin,
    TUARI_LICENSE_STATUS: "trial",
  });
  if (config.databasePath !== databasePath || config.databaseKey !== null || config.dbAdapter !== "sqlite"
    || config.host !== "127.0.0.1" || config.port !== apiPort || config.allowedOrigins.length !== 1 || config.allowedOrigins[0] !== origin
    || !isInside(directory, config.attachmentsRootPath) || !isInside(directory, config.backupsRootPath)) {
    throw new Error("Fixture configuration escaped its D-drive root or did not resolve to the controlled local API settings");
  }

  const root = await createFreshExactAppDependencies({ databasePath, databaseKey: "" }, config);
  let readOnlyDb: Database.Database | null = null;
  let rootClosed = false;
  try {
    readOnlyDb = new Database(databasePath, { readonly: true, fileMustExist: true });
    readOnlyDb.pragma("query_only = ON");
    const ownerPhone = "0612345678";
    const ownerPassword = randomBytes(24).toString("base64url");
    const ownerResult = await root.authBootstrapService.bootstrapFirstUser({
      name: "Synthetic API memory owner",
      phone: ownerPhone,
      password: ownerPassword,
    });
    if (!ownerResult.success) throw new Error(`Synthetic owner bootstrap failed: ${JSON.stringify(ownerResult.error)}`);
    const audit = { actorUserId: ownerResult.item.id, actorLabel: ownerResult.item.name };
    const workerRole = root.workforceService.listRoles().items.find(role => role.key === "worker");
    if (!workerRole) throw new Error("Exact root has no worker role for the employee fixture");

    logProgress(`Creating ${ROOTS} employees`);
    for (let index = 0; index < ROOTS; index++) {
      const result = root.workforceService.createEmployee({
        firstName: "Fixture",
        lastName: `Employee ${String(index).padStart(4, "0")}`,
        phone: phone(index, "055"),
        roleId: workerRole.id,
        status: "INACTIVE",
      }, audit);
      if (!result.success) throw new Error(`Employee ${index} was refused`);
      checkRowChunk(readOnlyDb, "employees", index, ROOTS);
    }

    logProgress(`Creating ${ROOTS} projects`);
    for (let index = 0; index < ROOTS; index++) {
      const result = root.operationsService.createProject({ name: `Fixture project ${String(index).padStart(4, "0")}`, status: "ACTIVE" }, audit);
      if (!result.success) throw new Error(`Project ${index} was refused`);
      checkRowChunk(readOnlyDb, "projects", index, ROOTS);
    }

    logProgress(`Creating ${ROOTS} external counterparties`);
    const counterparties: string[] = [];
    for (let index = 0; index < ROOTS; index++) {
      const result = root.companyService.createExternalCounterparty({
        fullName: `Fixture counterparty ${String(index).padStart(4, "0")}`,
        phoneNumber: phone(index, "066"),
      }, audit);
      if (!result.success) throw new Error(`Counterparty ${index} was refused`);
      counterparties.push(result.item.id);
      checkRowChunk(readOnlyDb, "counterparties", index, ROOTS);
    }

    logProgress(`Creating ${ROOTS} catalog definitions`);
    const definitions: string[] = [];
    for (let index = 0; index < ROOTS; index++) {
      const result = root.catalogService.createItemDefinition({
        name: `Fixture consumable ${String(index).padStart(4, "0")}`,
        itemType: "CONSUMABLE",
        unit: "unit",
      }, audit);
      if (!result.success) throw new Error(`Catalog definition ${index} was refused`);
      definitions.push(result.item.id);
      checkRowChunk(readOnlyDb, "catalog definitions", index, ROOTS);
    }

    logProgress(`Creating ${ROOTS} warehouses`);
    const warehouses: string[] = [];
    for (let index = 0; index < ROOTS; index++) {
      const result = root.operationsService.createWarehouse({
        name: `Fixture warehouse ${String(index).padStart(4, "0")}`,
        status: "ACTIVE",
      }, audit);
      if (!result.success) throw new Error(`Warehouse ${index} was refused`);
      warehouses.push(result.item.id);
      checkRowChunk(readOnlyDb, "warehouses", index, ROOTS);
    }

    logProgress(`Creating ${ROOTS} exact debt accounts`);
    for (let index = 0; index < ROOTS; index++) {
      root.financial.services.finance.createAccount({
        requestId: `fixture-debt-${String(index).padStart(4, "0")}`,
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterparties[index]!,
        direction: "PAYABLE",
        openingBalanceDzd: "10.01",
        currency: "DZD",
        ...audit,
      });
      checkRowChunk(readOnlyDb, "debt accounts", index, ROOTS);
    }

    logProgress(`Creating ${STOCK_GROUPS} exact inventory purchases`);
    for (let index = 0; index < STOCK_GROUPS; index++) {
      root.financial.services.inventory.createInvoiceGroup({
        requestId: `fixture-stock-${String(index).padStart(4, "0")}`,
        warehouseId: warehouses[index]!,
        entries: [{
          kind: "CONSUMABLE",
          itemDefinitionId: definitions[index]!,
          quantity: STOCK_QUANTITY_PER_GROUP,
          unitPriceDzd: "12.3400",
        }],
        ...audit,
      });
      checkRowChunk(readOnlyDb, "inventory purchases", index, STOCK_GROUPS);
    }

    const finalRows = readUserTableRows(readOnlyDb);
    if (finalRows > MAX_USER_TABLE_ROWS) throw new Error(`Final fixture row count ${finalRows} exceeds ${MAX_USER_TABLE_ROWS}`);
    readOnlyDb.close();
    readOnlyDb = null;
    rootClosed = true;
    root.close();
    const result = {
      sourcePin: SOURCE_PIN,
      databasePath,
      fixtureShape: { employeeStatus: "INACTIVE", transactionDensity: "1000 exact debts, 10 inventory purchases" },
      expected: {
        employees: ROOTS,
        projects: ROOTS,
        externalCounterparties: ROOTS,
        catalogDefinitions: ROOTS,
        warehouses: ROOTS,
        debtAccounts: ROOTS,
        liveDebtEntries: ROOTS,
        debtPayableDzd: minorToDzd(AMOUNT_PER_DEBT_MINOR * BigInt(ROOTS)),
        stockPurchaseGroups: STOCK_GROUPS,
        stockEntries: STOCK_GROUPS,
        stockQuantity: STOCK_QUANTITY_PER_GROUP * STOCK_GROUPS,
        stockValueDzd: minorToDzd(STOCK_UNIT_PRICE_MINOR * BigInt(STOCK_QUANTITY_PER_GROUP * STOCK_GROUPS)),
        maximumUserTableRows: MAX_USER_TABLE_ROWS,
      },
      syntheticOwner: { phone: ownerPhone, password: ownerPassword },
      credentialsNote: "Synthetic disposable API owner. Use only in the matching D-drive fixture environment.",
    };
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ status: "seeded", resultPath, databasePath, expected: result.expected })}\n`);
  } catch (error) {
    try { if (readOnlyDb?.open) readOnlyDb.close(); } catch (closeError) {
      process.stderr.write(`Read-only database close failed: ${closeError instanceof Error ? closeError.message : String(closeError)}\n`);
    }
    if (!rootClosed) {
      rootClosed = true;
      try { root.close(); } catch (closeError) {
        process.stderr.write(`Fixture dependency close failed: ${closeError instanceof Error ? closeError.message : String(closeError)}\n`);
      }
    }
    throw error;
  }
}

function minorToDzd(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
