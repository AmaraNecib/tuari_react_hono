import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { exactInvoiceSchemaStatements } from "../invoice/adapters/exact-invoice-schema";
import { exactDebtSchemaStatements } from "../company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../company/adapters/sqlite-exact-finance.repository";
import { exactInventorySchemaStatements } from "../inventory/adapters/exact-inventory-schema";
import { SqliteExactInventoryRepository } from "../inventory/adapters/sqlite-exact-inventory.repository";
import type { ExactFinanceRepository } from "../company/exact-finance.repository";
import type { ExactInventoryRepository } from "../inventory/inventory-exact.repository";
import { ExactFinanceService } from "../company/exact-finance.service";
import { InMemoryExactFinanceRepository } from "../company/adapters/inmemory-exact-finance.repository";
import { InMemoryExactInventoryRepository } from "../inventory/adapters/inmemory-exact-inventory.repository";
import { ExactInventoryService } from "../inventory/inventory-exact.service";
const date = "2026-11-10T00:00:00.000Z";
const partyId = "party";
const dependencies = { id: randomUUID, now: () => date };
const closes: (() => void)[] = [];
afterEach(() => { for (const close of closes.splice(0)) close(); });
function setup(kind: "memory" | "plain" | "keyed") {
  const references = { warehouses: [{ id: "warehouse", name: "Synthetic warehouse" }], projects: [{ id: "project", name: "Synthetic project" }], definitions: [
    { id: "material", name: "Synthetic material", itemType: "CONSUMABLE" as const, unit: "m", description: null, isActive: true, createdAt: date, updatedAt: date },
    { id: "asset", name: "Synthetic equipment", itemType: "ASSET" as const, unit: null, description: null, isActive: true, createdAt: date, updatedAt: date },
  ] };
  let reportSource: ExactInventoryReportSource | undefined;
  let reportLock: ReturnType<typeof createFifoLock> | undefined;
  let nativeDb: ReturnType<typeof createDatabaseConnection> | undefined;
  let ledger: ExactFinanceRepository;
  let repo: ExactInventoryRepository;
  let openPeer: (() => ExactInventoryService) | undefined;
  if (kind === "memory") {
    ledger = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [partyId] });
    repo = new InMemoryExactInventoryRepository(ledger.transactionIdentity, references);
  } else {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-526-inventory-")), "fixture.sqlite");
    const key = kind === "keyed" ? "526-public-inventory-key" : "";
    const db = createDatabaseConnection(path, key);
    nativeDb = db;
    closes.push(() => db.close());
    db.pragma("foreign_keys=ON");
    db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE warehouse(id TEXT PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE project(id TEXT PRIMARY KEY,name TEXT NOT NULL); INSERT INTO external_counterparty VALUES ('${partyId}'); INSERT INTO warehouse VALUES ('warehouse','Synthetic warehouse'); INSERT INTO project VALUES ('project','Synthetic project')`);
    for (const sql of exactInvoiceSchemaStatements) db.exec(sql);
    for (const sql of exactDebtSchemaStatements) db.exec(sql);
    for (const sql of exactInventorySchemaStatements) db.exec(sql);
    for (const definition of references.definitions) db.prepare("INSERT INTO inventory_item_definition(id,name,item_type,unit,description,is_active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)").run(definition.id, definition.name, definition.itemType, definition.unit, definition.description, date, date);
    const lock = createFifoLock();
    reportSource = new ExactInventoryReportSource(db, lock);
    reportLock = lock;
    ledger = new SqliteExactFinanceRepository(db, lock);
    repo = new SqliteExactInventoryRepository(db, lock);
    openPeer = () => {
      const peerDb = createDatabaseConnection(path, key);
      peerDb.pragma("foreign_keys=ON");
      peerDb.pragma("busy_timeout=1");
      closes.push(() => peerDb.close());
      const peerLock = createFifoLock();
      return new ExactInventoryService(new SqliteExactInventoryRepository(peerDb, peerLock), new ExactFinanceService(new SqliteExactFinanceRepository(peerDb, peerLock), dependencies), dependencies);
    };
  }
  const finance = new ExactFinanceService(ledger, dependencies);
  return { reportSource: reportSource!, reportLock: reportLock!, nativeDb, ledger, repo, finance, openPeer, inventory: new ExactInventoryService(repo, finance, dependencies) };
}

import { ExactInventoryReportSource } from "./exact-inventory-report-source";
import { ExactInventoryReports } from "./exact-inventory-reports";

it.each(["plain", "keyed"] as const)("%s: preserves the legacy purchase projection after partial/full transfer and outbound", kind => {
  const { inventory, reportSource, nativeDb: db, repo, finance } = setup(kind);
  db!.exec("INSERT INTO warehouse VALUES ('warehouse-b','Warehouse B')");
  const purchase = inventory.createInvoiceGroup({ requestId: "compat-purchase", invoiceDate: "2026-11-01T00:00:00.000Z", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 10, unitPriceDzd: "3.1250" }] });
  const later = "2026-12-20T12:00:00.000Z";
  const mover = new ExactInventoryService(repo, finance, { ...dependencies, now: () => later });
  const reports = new ExactInventoryReports(reportSource, () => later);
  const assertPurchaseProjection = () => {
    const report = reports.generateInventoryReport();
    expect(report.summary).toEqual({ totalAssetsDzd: "0.00", totalConsumablesDzd: "31.25", totalValueDzd: "31.25" });
    expect(report.byLocation).toEqual([{ locationId: "warehouse", locationType: "WAREHOUSE", locationLabel: "Synthetic warehouse", assetCount: 0, assetValueDzd: "0.00", consumableCount: 10 }]);
    expect(report.byItemType).toEqual([{ itemName: "Synthetic material", quantity: 10, valueDzd: "31.25", lastUpdated: date }]);
    expect(report.agingAnalysis[1]).toEqual({ ageCategory: "31-90_DAYS", count: 1, valueDzd: "31.25" });
  };
  mover.transferConsumable({ requestId: "compat-partial", inventoryEntryId: purchase.entries[0]!.id, fromWarehouseId: "warehouse", toWarehouseId: "warehouse-b", quantity: 4 });
  assertPurchaseProjection();
  mover.transferConsumable({ requestId: "compat-full", inventoryEntryId: purchase.entries[0]!.id, fromWarehouseId: "warehouse", toWarehouseId: "warehouse-b", quantity: 6 });
  assertPurchaseProjection();
  mover.createOutboundTransfer({ requestId: "compat-gift", fromType: "WAREHOUSE", fromId: "warehouse-b", counterpartyId: partyId, transferType: "GIFT", items: [{ itemId: "material", quantity: 10 }] });
  assertPurchaseProjection();
  expect(reports.generateMovementReport().byType).toEqual([{ movementType: "PURCHASE", count: 1, valueDzd: "31.25" }, { movementType: "TRANSFER", count: 2, valueDzd: "31.25" }, { movementType: "OUTBOUND_SALE", count: 1, valueDzd: "31.25" }]);
});
it.each(["plain", "keyed"] as const)("%s: values wide parked assets at purchase cost, not placement charges", kind => {
  const { inventory, reportSource } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "wide", projectId: "project", entries: [{ kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "Wide", purchasePriceDzd: "9007199254740993.07" }] }] });
  inventory.transferAsset({ requestId: "park", assetUnitId: purchase.entries[0]!.assets[0]!.id, toWarehouseId: "warehouse" });
  const reports = new ExactInventoryReports(reportSource, () => date);
  expect(reports.generateInventoryReport().summary.totalAssetsDzd).toBe("9007199254740993.07");
  expect(reports.generateInventoryReport().byLocation[0]).toMatchObject({ locationId: "project", assetCount: 1, assetValueDzd: "9007199254740993.07" });
  expect(reports.generateMovementReport().byType.find(row => row.movementType === "TRANSFER")!.valueDzd).toBe("9007199254740993.07");
});

it.each(["plain", "keyed"] as const)("%s: preserves asset purchase-entry quantity, aging and update time after movement and charge correction", kind => {
  const { inventory, reportSource, repo, finance } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "asset-projection", projectId: "project", entries: [{ kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "First", purchasePriceDzd: "10.00" }, { assetName: "Second", purchasePriceDzd: "20.00" }] }] });
  const later = "2026-12-20T12:00:00.000Z";
  const mover = new ExactInventoryService(repo, finance, { ...dependencies, now: () => later });
  const charge = repo.listCharges().find(row => row.assetUnitId === purchase.entries[0]!.assets[0]!.id)!;
  mover.updateAssetCharge({ requestId: "asset-charge", chargeId: charge.id, amountDzd: "100.00", reason: "Placement-only correction" });
  for (const asset of purchase.entries[0]!.assets) mover.transferAsset({ requestId: "park-" + asset.id, assetUnitId: asset.id, toWarehouseId: "warehouse" });
  const reports = new ExactInventoryReports(reportSource, () => later);
  const report = reports.generateInventoryReport();
  expect(report.summary).toEqual({ totalAssetsDzd: "30.00", totalConsumablesDzd: "0.00", totalValueDzd: "30.00" });
  expect(report.byLocation).toEqual([{ locationId: "project", locationType: "PROJECT", locationLabel: "Synthetic project", assetCount: 2, assetValueDzd: "30.00", consumableCount: 0 }]);
  expect(report.byItemType).toEqual([{ itemName: "Synthetic equipment", quantity: 2, valueDzd: "30.00", lastUpdated: date }]);
  expect(report.agingAnalysis[1]).toEqual({ ageCategory: "31-90_DAYS", count: 1, valueDzd: "30.00" });
  mover.createOutboundTransfer({ requestId: "asset-gift", fromType: "WAREHOUSE", fromId: "warehouse", counterpartyId: partyId, transferType: "GIFT", items: [{ itemId: "asset", quantity: 2 }] });
  expect(reports.generateInventoryReport()).toEqual(report);
  expect(reports.generateMovementReport().byType.find(row => row.movementType === "OUTBOUND_SALE")).toEqual({ movementType: "OUTBOUND_SALE", count: 2, valueDzd: "30.00" });
});
it.each(["plain", "keyed"] as const)("%s: sums original total ratios before rounding across split stock and reversals", kind => {
  const { inventory, reportSource } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "ratio", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 3, priceSource: { mode: "agreed-total", total: "10.00", quantity: "3" } }] });
  const entry = purchase.entries[0]!.id;
  inventory.transferConsumable({ requestId: "split", inventoryEntryId: entry, fromWarehouseId: "warehouse", toProjectId: "project", quantity: 1 });
  const reports = new ExactInventoryReports(reportSource, () => date);
  expect(reports.generateInventoryReport().summary.totalConsumablesDzd).toBe("10.00");
  expect(reports.generateInventoryReport().agingAnalysis[0]).toMatchObject({ count: 1, valueDzd: "10.00" });
  inventory.transferConsumable({ requestId: "reverse", inventoryEntryId: entry, fromProjectId: "project", toWarehouseId: "warehouse", quantity: 1 });
  expect(reports.generateInventoryReport().summary.totalValueDzd).toBe("10.00");
  expect(reports.generateMovementReport().byType.find(row => row.movementType === "TRANSFER")).toMatchObject({ count: 2, valueDzd: "6.67" });
});
it.each(["plain", "keyed"] as const)("%s: respects price4 and derived original quantity without requiring a unit price cache", kind => {
  const { inventory, reportSource, nativeDb, reportLock } = setup(kind);
  inventory.createInvoiceGroup({ requestId: "price", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 3, unitPriceDzd: "0.1250" }] });
  const derived = inventory.createInvoiceGroup({ requestId: "derived", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 2, priceSource: { mode: "agreed-total", total: "6.67", quantity: "2" } }] });
  // The purchase input refuses derived prices; the durable reader still supports this source mode.
  reportSource.snapshot(() => undefined);
  const dbEntry = derived.entries[0]!;
  const { assets: _assets, ...record } = dbEntry;
  // Explicit persisted operand fixture, not a second ledger or a mocked calculation.
  new SqliteExactInventoryRepository(nativeDb!, reportLock).saveEntry({ ...record, priceSource: { mode: "derived-price", total: "10.00", originalQuantity: "3", quantity: "2" } });
  const report = new ExactInventoryReports(reportSource, () => date).generateInventoryReport();
  expect(report.summary.totalConsumablesDzd).toBe("7.04");
  expect(report.byItemType[0]).toMatchObject({ quantity: 5, valueDzd: "7.04" });
});
it.each(["plain", "keyed"] as const)("%s: permits aggregates wider than int64 and rejects numeric schema money", kind => {
  const { inventory, reportSource } = setup(kind);
  for (let i = 0; i < 2; i++) inventory.createInvoiceGroup({ requestId: "max-" + i, warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, priceSource: { mode: "agreed-total", total: "92233720368547758.07", quantity: "1" } }] });
  const report = new ExactInventoryReports(reportSource, () => date).generateInventoryReport();
  expect(report.summary.totalValueDzd).toBe("184467440737095516.14");
});
it.each(["plain", "keyed"] as const)("%s: includes Algeria selected days, keeps stored period buckets and captures the clock once", kind => {
  const { inventory, reportSource } = setup(kind);
  inventory.createInvoiceGroup({ requestId: "midnight", invoiceDate: "2026-10-31T23:00:00.000Z", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  let calls = 0;
  const reports = new ExactInventoryReports(reportSource, () => { calls++; return date; });
  const selected = reports.generateMovementReport({ startDate: "2026-11-01", endDate: "2026-11-01" });
  expect(calls).toBe(1);
  expect(selected).toMatchObject({ generatedAt: date, byPeriod: [{ period: "2026-10", count: 1, valueDzd: "1.00" }] });
  expect(reports.generateInventoryReport({ startDate: "2026-11-02", endDate: "2026-11-02" }).summary.totalValueDzd).toBe("0.00");
  expect(reports.generateInventoryReport({ endDate: "2026-11-30" }).agingAnalysis[0]).toMatchObject({ count: 1, valueDzd: "1.00" });
  expect(() => reports.generateInventoryReport({ startDate: "2026-02-30" })).toThrow(/date/);
});
it.each(["plain", "keyed"] as const)("%s: separates typed location namespaces and outbound document provenance without writes", kind => {
  const { inventory, reportSource, nativeDb: db } = setup(kind);
  db!.exec("INSERT INTO project VALUES ('warehouse','Same id project')");
  const purchase = inventory.createInvoiceGroup({ requestId: "provenance", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 6, unitPriceDzd: "1.0000" }] });
  inventory.transferConsumable({ requestId: "same-id", inventoryEntryId: purchase.entries[0]!.id, fromWarehouseId: "warehouse", toProjectId: "warehouse", quantity: 1 });
  // A second purchase, not the transfer, introduces the project in the purchase projection.
  inventory.createInvoiceGroup({ requestId: "project-purchase", projectId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  for (const transferType of ["SALE", "RETURN", "GIFT"] as const) inventory.createOutboundTransfer({ requestId: transferType, fromType: "WAREHOUSE", fromId: "warehouse", counterpartyId: partyId, transferType, debtAmountDzd: transferType === "GIFT" ? undefined : "1.00", items: [{ itemId: "material", quantity: 1 }] });
  const changes = () => db!.prepare("SELECT total_changes() AS count").get();
  const before = changes();
  const reports = new ExactInventoryReports(reportSource, () => date);
  expect(reports.generateInventoryReport().byLocation.map(row => [row.locationType, row.consumableCount]).sort()).toEqual([["PROJECT", 1], ["WAREHOUSE", 6]]);
  const report = reports.generateMovementReport();
  expect(report.outboundDocuments).toEqual([{ transferType: "SALE", count: 1 }, { transferType: "RETURN", count: 1 }, { transferType: "GIFT", count: 1 }]);
  expect(report.byType.find(row => row.movementType === "OUTBOUND_SALE")).toMatchObject({ count: 3, valueDzd: "3.00" });
  expect(changes()).toEqual(before);
});
it.each(["plain", "keyed"] as const)("%s: refuses row overflow before hydration and missing persisted source instead of zero", kind => {
  const { inventory, reportSource, reportLock, nativeDb: db } = setup(kind);
  for (let i = 0; i < 2; i++) inventory.createInvoiceGroup({ requestId: "cap-" + i, warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  const capped = new ExactInventoryReports(new ExactInventoryReportSource(db!, reportLock, 1), () => date);
  db!.exec("UPDATE inventory_entry SET price_source='{}'");
  expect(() => capped.generateInventoryReport()).toThrow(/resource limit/);
  expect(() => new ExactInventoryReports(reportSource, () => date).generateMovementReport()).toThrow();
});
it("refuses reads while another async flow owns the FIFO", async () => {
  const { reportSource, reportLock } = setup("plain");
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const held = reportLock.run(() => new Promise<void>(resolve => { release = resolve; started(); }));
  await ready;
  expect(() => new ExactInventoryReports(reportSource, () => date).generateInventoryReport()).toThrow(/busy|lock/i);
  release();
  await held;
});

it.each(["plain", "keyed"] as const)("%s: retains the legacy 30/89/179 aging cutoffs on business document dates and sorts by exact value", kind => {
  const { inventory, reportSource } = setup(kind);
  const now = "2026-11-30T00:00:00.000Z";
  for (const [index, age] of [30, 31, 89, 90, 179, 180].entries()) {
    inventory.createInvoiceGroup({ requestId: "age-" + index, warehouseId: "warehouse", invoiceDate: new Date(Date.parse(now) - age * 86400000).toISOString(), entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  }
  const report = new ExactInventoryReports(reportSource, () => now).generateInventoryReport();
  expect(report.agingAnalysis.map(row => [row.count, row.valueDzd])).toEqual([[1, "1.00"], [2, "2.00"], [2, "2.00"], [1, "1.00"]]);
});
it.each(["plain", "keyed"] as const)("%s: sums 1+2 transfers and their reversals from the original 10-over-3 source", kind => {
  const { inventory, reportSource } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "full-ratio", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 3, priceSource: { mode: "agreed-total", total: "10.00", quantity: "3" } }] });
  const reports = new ExactInventoryReports(reportSource, () => date);
  for (const q of [1, 2]) inventory.transferConsumable({ requestId: "out-" + q, inventoryEntryId: purchase.entries[0]!.id, fromWarehouseId: "warehouse", toProjectId: "project", quantity: q });
  expect(reports.generateMovementReport().byType.find(row => row.movementType === "TRANSFER")!.valueDzd).toBe("10.00");
  for (const q of [1, 2]) inventory.transferConsumable({ requestId: "back-" + q, inventoryEntryId: purchase.entries[0]!.id, fromProjectId: "project", toWarehouseId: "warehouse", quantity: q });
  expect(reports.generateInventoryReport().summary.totalValueDzd).toBe("10.00");
  expect(reports.generateMovementReport().byType.find(row => row.movementType === "TRANSFER")!.valueDzd).toBe("20.00");
});
