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
import { exactInventorySchemaStatements } from "./adapters/exact-inventory-schema";
import { SqliteExactInventoryRepository } from "./adapters/sqlite-exact-inventory.repository";
import type { ExactFinanceRepository } from "../company/exact-finance.repository";
import type { ExactInventoryRepository } from "./inventory-exact.repository";
import { ExactFinanceService } from "../company/exact-finance.service";
import { InMemoryExactFinanceRepository } from "../company/adapters/inmemory-exact-finance.repository";
import { InMemoryExactInventoryRepository } from "./adapters/inmemory-exact-inventory.repository";
import { ExactInventoryService } from "./inventory-exact.service";
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
  return { nativeDb, ledger, repo, finance, openPeer, inventory: new ExactInventoryService(repo, finance, dependencies) };
}
it.each(["plain", "keyed"] as const)("%s: rejects oversized inventory history, entries and assets before returning a prefix", kind => {
  const { inventory, repo, nativeDb: db } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "capped-stock", projectId: "project", entries: [{ kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "Synthetic asset", purchasePriceDzd: "1.00" }] }] });
  function extend(table: string, id: string, sequence?: string) {
    const columns = (db!.pragma(`table_info(${table})`) as { name: string }[]).map(row => row.name);
    db!.exec(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<100001) INSERT INTO ${table} (${columns.join(",")}) SELECT ${columns.map(column => column === "id" ? "'prefix-' || printf('%06d',seq.n)" : column === sequence ? "seq.n" : `p.${column}`).join(",")} FROM seq CROSS JOIN ${table} p WHERE p.id='${id}'`);
  }
  extend("inventory_movement", purchase.movements[0]!.id);
  expect(() => inventory.getProjectContribution("project")).toThrow(/read resource limit/);
  extend("inventory_asset_unit", purchase.entries[0]!.assets[0]!.id, "asset_order");
  repo.getAsset = () => { throw new Error("Partial asset prefix was hydrated"); };
  expect(() => repo.listAssets()).toThrow(/read resource limit/);
  extend("inventory_entry", purchase.entries[0]!.id, "entry_order");
  repo.getEntry = () => { throw new Error("Partial entry prefix was hydrated"); };
  expect(() => repo.listEntries(purchase.group.id)).toThrow(/read resource limit/);
}, 30000);
it.each(["memory", "plain", "keyed"] as const)("%s: reports material history wider than a single persisted amount", kind => {
  const { inventory } = setup(kind);
  for (const requestId of ["wide-report-first", "wide-report-second"]) inventory.createInvoiceGroup({ requestId, projectId: "project", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, priceSource: { mode: "agreed-total", total: "92233720368547758.07", quantity: "1" } }] });
  expect(inventory.getProjectContribution("project")).toMatchObject({ chargedMaterialsDzd: "184467440737095516.14", totalDzd: "184467440737095516.14" });
});
it("reports more than ten thousand material movements with one final rounding", () => {
  const { inventory, repo } = setup("memory");
  inventory.createInvoiceGroup({ requestId: "long-history-stock", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 10001, unitPriceDzd: "0.0050" }] });
  const purchase = repo.listMovements()[0]!;
  for (let index = 0; index < 10001; index++) repo.saveMovement({ ...purchase, id: `report-transfer-${index}`, movementType: "TRANSFER", quantity: 1, fromWarehouseId: "warehouse", toWarehouseId: null, toProjectId: "project" });
  expect(inventory.getProjectContribution("project")).toMatchObject({ chargedMaterialsDzd: "50.01", totalDzd: "50.01" });
});
it.each(["memory", "plain", "keyed"] as const)("%s: settles outbound-owned sale and return debt without generic bypass or duplicate payments", kind => {
  const { inventory, finance, ledger } = setup(kind);
  inventory.createInvoiceGroup({ requestId: "outbound-payment-stock", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 3, unitPriceDzd: "1.0000" }] });
  for (const transferType of ["SALE", "RETURN"] as const) {
    const transfer = inventory.createOutboundTransfer({ requestId: `outbound-${transferType}`, fromType: "WAREHOUSE", fromId: "warehouse", counterpartyId: partyId, transferType, debtAmountDzd: "100.00", firstPaymentAmountDzd: "20.00", items: [{ itemId: "material", quantity: 1 }] });
    expect(() => finance.recordPayment({ requestId: `generic-${transferType}`, debtEntryId: transfer.debtEntryId!, amountDzd: "80.00" })).toThrow(/producer/);
    const command = { requestId: `settle-${transferType}`, transferId: transfer.id, amountDzd: "80.00", actorUserId: "owner" };
    const save = ledger.saveAggregateCommand.bind(ledger);
    ledger.saveAggregateCommand = () => { throw new Error("Injected outbound payment receipt failure"); };
    expect(() => inventory.recordOutboundPayment(command)).toThrow(/receipt failure/);
    expect(finance.remaining(transfer.debtEntryId!)).toBe("80.00");
    ledger.saveAggregateCommand = save;
    const settled = inventory.recordOutboundPayment(command);
    expect(settled.remainingDebtDzd).toBe("0.00");
    expect(settled.initialPaymentEntryId).toBe(transfer.initialPaymentEntryId);
    expect(inventory.recordOutboundPayment(command)).toEqual(settled);
    expect(() => inventory.recordOutboundPayment({ ...command, actorUserId: "other" })).toThrow(/replay conflict/);
    expect(() => inventory.recordOutboundPayment({ ...command, requestId: `overpay-${transferType}`, amountDzd: "0.01" })).toThrow(/exceeds/);
    const payments = finance.listEntries(transfer.associatedDebtAccountId!).filter(row => row.targetEntryId === transfer.debtEntryId);
    expect(payments.map(row => row.signedAmountDzd).sort()).toEqual(["-20.00", "-80.00"]);
  }
  const gift = inventory.createOutboundTransfer({ requestId: "outbound-gift", fromType: "WAREHOUSE", fromId: "warehouse", counterpartyId: partyId, transferType: "GIFT", items: [{ itemId: "material", quantity: 1 }] });
  expect(() => inventory.recordOutboundPayment({ requestId: "pay-gift", transferId: gift.id, amountDzd: "1.00" })).toThrow(/obligation/);
  expect(() => inventory.recordOutboundPayment({ requestId: "pay-missing", transferId: "missing", amountDzd: "1.00" })).toThrow(/not found/);
});
it.each(["plain", "keyed"] as const)("%s: reserves stock before receipt reads and rejects stale competing picks after commit", kind => {
  const { inventory, openPeer, repo } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "competing-stock", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  const peer = openPeer!();
  const pick = { requestId: "first-pick", fromType: "WAREHOUSE" as const, fromId: "warehouse", counterpartyId: partyId, transferType: "SALE" as const, debtAmountDzd: "1.00", items: [{ itemId: "material", optionId: purchase.consumableBalances[0]!.id, quantity: 1 }] };
  const save = repo.saveOutbound.bind(repo);
  let contended = false;
  repo.saveOutbound = transfer => {
    if (!contended) {
      contended = true;
      expect(() => peer.createOutboundTransfer({ ...pick, requestId: "second-pick" })).toThrow(/locked|busy/i);
    }
    save(transfer);
  };
  inventory.createOutboundTransfer(pick);
  expect(contended).toBe(true);
  expect(() => peer.createOutboundTransfer({ ...pick, requestId: "second-pick" })).toThrow(/stock|available/i);
  expect(repo.listOutbounds()).toHaveLength(1);
  expect(repo.listBalances()).toEqual([]);
});
it.each(["memory", "plain", "keyed"] as const)("%s: receives source-price stock and a targeted partial purchase obligation in one aggregate", kind => {
  const { inventory, finance, repo } = setup(kind);
  const input = { requestId: "purchase", warehouseId: "warehouse", createDebt: true, externalCounterpartyId: partyId, paymentInputType: "AMOUNT" as const, paidAmountDzd: "0.25", entries: [
    { kind: "CONSUMABLE" as const, itemDefinitionId: "material", quantity: 0.25, unitPriceDzd: "1.5000" },
    { kind: "CONSUMABLE" as const, itemDefinitionId: "material", quantity: 0.25, unitPriceDzd: "1.5000" },
  ] };
  const result = inventory.createInvoiceGroup(input);
  expect(result.group).toMatchObject({ grossTotalDzd: "0.75", paidAmountDzd: "0.25", remainingDebtDzd: "0.50", currency: "DZD" });
  expect(result.entries.map(row => row.priceSource)).toEqual([{ mode: "unit-price", price: "1.5000", quantity: "0.25" }, { mode: "unit-price", price: "1.5000", quantity: "0.25" }]);
  expect(result.consumableBalances.map(row => row.quantity)).toEqual([0.25, 0.25]);
  expect(finance.remaining(result.group.debtEntryId!)).toBe("0.50");
  expect(inventory.createInvoiceGroup(input)).toEqual(result);
  expect(repo.listGroups()).toHaveLength(1);
});
it.each(["memory", "plain", "keyed"] as const)("%s: transfers independent six-place quantities without changing their purchase source or creating money", kind => {
  const { inventory, repo, finance } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "stock", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 0.000003, unitPriceDzd: "123.4567" }] });
  const entry = purchase.entries[0]!;
  const input = { requestId: "move", inventoryEntryId: entry.id, quantity: 0.000001, fromWarehouseId: "warehouse", toProjectId: "project" };
  inventory.transferConsumable(input);
  expect(inventory.getLocationContents({ warehouseId: "warehouse" }).consumables[0]?.quantity).toBe(0.000002);
  expect(inventory.getLocationContents({ projectId: "project" }).consumables[0]?.quantity).toBe(0.000001);
  expect(repo.getEntry(entry.id)?.priceSource).toEqual({ mode: "unit-price", price: "123.4567", quantity: "0.000003" });
  expect(finance.listAccounts()).toEqual([]);
  inventory.transferConsumable(input);
  expect(repo.listMovements()).toHaveLength(2);
  expect(() => inventory.transferConsumable({ ...input, requestId: "below-quantum", quantity: 0.0000004 })).toThrow(/quantity|six decimal/i);
});
it.each(["memory", "plain", "keyed"] as const)("%s: consumes selected stock once with an owned receivable and rolls back repeated-pick shortages", kind => {
  const { inventory, finance, repo } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "stock", warehouseId: "warehouse", entries: [
    { kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 0.3, unitPriceDzd: "1.0000" },
    { kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 0.2, unitPriceDzd: "1.0000" },
  ] });
  const optionId = purchase.consumableBalances.find(row => row.quantity === 0.3)!.id;
  const input = { requestId: "outbound", fromType: "WAREHOUSE" as const, fromId: "warehouse", counterpartyId: partyId, transferType: "SALE" as const,
    debtAmountDzd: "0.30", firstPaymentAmountDzd: "0.10", items: [{ itemId: "material", optionId, quantity: 0.1, unitPriceDzd: "3.0000" }] };
  const transfer = inventory.createOutboundTransfer(input);
  expect(transfer).toMatchObject({ currency: "DZD", transferType: "SALE" });
  expect(finance.getAccount(transfer.associatedDebtAccountId!).direction).toBe("RECEIVABLE");
  expect(finance.remaining(transfer.debtEntryId!)).toBe("0.20");
  expect(finance.listEntries(transfer.associatedDebtAccountId!).map(row => [row.producerType, row.producerId, row.targetEntryId])).toEqual([
    ["INVENTORY_OUTBOUND", transfer.id, null], ["INVENTORY_OUTBOUND", transfer.id, transfer.debtEntryId],
  ]);
  expect(repo.listBalances().find(row => row.id === optionId)?.quantity).toBe(0.2);
  expect(inventory.createOutboundTransfer(input)).toEqual(transfer);
  expect(repo.listOutbounds()).toHaveLength(1);
  const before = { balances: repo.listBalances(), movements: repo.listMovements(), accounts: finance.listAccounts() };
  expect(() => inventory.createOutboundTransfer({ ...input, requestId: "overpick", debtAmountDzd: "0.50", items: [
    { itemId: "material", optionId, quantity: 0.15 }, { itemId: "material", optionId, quantity: 0.1 },
  ] })).toThrow(/stock|available|quantity/i);
  expect(repo.listBalances()).toEqual(before.balances);
  expect(repo.listMovements()).toEqual(before.movements);
  expect(finance.listAccounts()).toEqual(before.accounts);
  expect(repo.listOutbounds()).toHaveLength(1);
  expect(() => inventory.createOutboundTransfer({ ...input, firstPaymentAmountDzd: "0.11" })).toThrow(/conflict/i);
});
it.each(["memory", "plain", "keyed"] as const)("%s: keeps returns payable and gifts free of debt without consuming rejected stock", kind => {
  const { inventory, finance, repo } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "return-stock", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 3, unitPriceDzd: "10.0000" }] });
  const optionId = purchase.consumableBalances[0]!.id;
  const input = { requestId: "return", fromType: "WAREHOUSE" as const, fromId: "warehouse", counterpartyId: partyId, transferType: "RETURN" as const, debtAmountDzd: "10.00", firstPaymentAmountDzd: "2.00", items: [{ itemId: "material", optionId, quantity: 1 }] };
  const returned = inventory.createOutboundTransfer(input);
  expect(finance.getAccount(returned.associatedDebtAccountId!).direction).toBe("PAYABLE");
  expect(finance.remaining(returned.debtEntryId!)).toBe("8.00");
  expect(returned.items[0]).toMatchObject({ unitPriceDzd: null, priceSource: null });
  const balances = repo.listBalances();
  const accounts = finance.listAccounts();
  expect(() => inventory.createOutboundTransfer({ ...input, requestId: "gift-with-debt", transferType: "GIFT" })).toThrow(/gift|debt/i);
  expect(repo.listBalances()).toEqual(balances);
  expect(finance.listAccounts()).toEqual(accounts);
  const gift = inventory.createOutboundTransfer({ ...input, requestId: "gift", transferType: "GIFT", debtAmountDzd: undefined, firstPaymentAmountDzd: undefined });
  expect(gift).toMatchObject({ associatedDebtAccountId: null, debtEntryId: null, initialPaymentEntryId: null });
});
it.each(["memory", "plain", "keyed"] as const)("%s: rolls back outbound stock and money when its aggregate receipt cannot be saved", kind => {
  const { inventory, finance, repo, ledger } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "outbound-stock", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  const input = { requestId: "outbound-journal", fromType: "WAREHOUSE" as const, fromId: "warehouse", counterpartyId: partyId, transferType: "SALE" as const, debtAmountDzd: "0.30", firstPaymentAmountDzd: "0.10", items: [{ itemId: "material", optionId: purchase.consumableBalances[0]!.id, quantity: 1 }] };
  const before = { balances: repo.listBalances(), movements: repo.listMovements() };
  const save = ledger.saveAggregateCommand.bind(ledger);
  ledger.saveAggregateCommand = () => { throw new Error("Injected outbound receipt failure"); };
  expect(() => inventory.createOutboundTransfer(input)).toThrow(/receipt failure/);
  expect(repo.listBalances()).toEqual(before.balances);
  expect(repo.listMovements()).toEqual(before.movements);
  expect(repo.listOutbounds()).toEqual([]);
  expect(finance.listAccounts()).toEqual([]);
  ledger.saveAggregateCommand = save;
  const result = inventory.createOutboundTransfer(input);
  expect(inventory.createOutboundTransfer(input)).toEqual(result);
  expect(finance.remaining(result.debtEntryId!)).toBe("0.20");
  expect(repo.listOutbounds()).toHaveLength(1);
});
it.each(["memory", "plain", "keyed"] as const)("%s: rolls back purchase stock, placement charges and debt on whole-command receipt failure", kind => {
  const { inventory, repo, ledger, finance } = setup(kind);
  const input = { requestId: "purchase-failure", projectId: "project", createDebt: true, externalCounterpartyId: partyId, paymentInputType: "AMOUNT" as const, paidAmountDzd: "0.10", entries: [
    { kind: "ASSET" as const, itemDefinitionId: "asset", assets: [{ assetName: "Synthetic unit", purchasePriceDzd: "0.30" }] },
  ] };
  const save = ledger.saveAggregateCommand.bind(ledger);
  ledger.saveAggregateCommand = () => { throw new Error("Injected final journal failure"); };
  expect(() => inventory.createInvoiceGroup(input)).toThrow(/journal failure/);
  expect([repo.listGroups(), repo.listEntries(), repo.listAssets(), repo.listCharges(), repo.listMovements(), finance.listAccounts()]).toEqual([[], [], [], [], [], []]);
  ledger.saveAggregateCommand = save;
  const result = inventory.createInvoiceGroup(input);
  expect(finance.remaining(result.group.debtEntryId!)).toBe("0.20");
  expect(inventory.getProjectCharges("project").totalDzd).toBe("0.30");
  expect(inventory.createInvoiceGroup(input)).toEqual(result);
  expect(repo.listCharges()).toHaveLength(1);
  expect(() => inventory.createInvoiceGroup({ ...input, actorUserId: "different-actor" })).toThrow(/conflict/i);
});
it.each(["memory", "plain", "keyed"] as const)("%s: keeps equipment purchase out of project cost and counts only its placement charge plus net material", kind => {
  const { inventory } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "mixed-cost", projectId: "project", entries: [
    { kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 300, priceSource: { mode: "agreed-total", total: "10000.00", quantity: "300" } },
    { kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "Synthetic unit", purchasePriceDzd: "10.00" }] },
  ] });
  const contribution = inventory.getProjectContribution("project");
  expect(contribution).toMatchObject({ chargedMaterialsDzd: "10000.00", equipmentChargesDzd: "10.00", totalDzd: "10010.00", parkedAssetValueDzd: "10.00" });
  inventory.transferConsumable({ requestId: "return-material", inventoryEntryId: purchase.entries.find(row => row.itemType === "CONSUMABLE")!.id, quantity: 100, fromProjectId: "project", toWarehouseId: "warehouse" });
  expect(inventory.getProjectContribution("project")).toMatchObject({ chargedMaterialsDzd: "6666.67", totalDzd: "6676.67" });
});
it.each(["memory", "plain", "keyed"] as const)("%s: charges each asset placement once and retains exact correction/void history", kind => {
  const { inventory, repo } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "assets", projectId: "project", entries: [{ kind: "ASSET", itemDefinitionId: "asset", assets: [
    { assetName: "First unit", purchasePriceDzd: "0.10" }, { assetName: "Second unit", purchasePriceDzd: "0.20" },
  ] }] });
  expect(purchase.group.grossTotalDzd).toBe("0.30");
  expect(inventory.getProjectCharges("project").totalDzd).toBe("0.30");
  const asset = purchase.entries[0]!.assets[0]!;
  const firstCharge = repo.listCharges().find(row => row.assetUnitId === asset.id)!;
  inventory.updateAssetCharge({ requestId: "correct", chargeId: firstCharge.id, amountDzd: "0.15", reason: "Approved correction", actorUserId: "operator" });
  inventory.transferAsset({ requestId: "warehouse", assetUnitId: asset.id, toWarehouseId: "warehouse" });
  inventory.transferAsset({ requestId: "project-again", assetUnitId: asset.id, toProjectId: "project" });
  expect(inventory.getAssetChargeDefault(asset.id)).toMatchObject({ amountDzd: "0.15", source: "LAST_CHARGE", purchasePriceDzd: "0.10" });
  expect(inventory.getProjectCharges("project").totalDzd).toBe("0.50");
  inventory.voidAssetCharge({ requestId: "void", chargeId: firstCharge.id, reason: "Wrong placement" });
  expect(inventory.getProjectCharges("project").totalDzd).toBe("0.35");
  expect(repo.getCharge(firstCharge.id)?.revisions.map(row => [row.previousAmountDzd, row.newAmountDzd])).toEqual([["0.10", "0.15"], ["0.15", null]]);
  expect(repo.listMovements()).toHaveLength(4);
});
it.each(["memory", "plain", "keyed"] as const)("%s: preserves numeric percentage semantics independently of quantity scale", kind => {
  const { inventory } = setup(kind);
  const result = inventory.createInvoiceGroup({ requestId: "tiny-percent", warehouseId: "warehouse", createDebt: true, externalCounterpartyId: partyId, paymentInputType: "PERCENT", paidPercent: 1e-19,
    entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  expect(result.group).toMatchObject({ grossTotalDzd: "1.00", paidAmountDzd: "0.00", remainingDebtDzd: "1.00" });
});
it.each(["memory", "plain", "keyed"] as const)("%s: keeps unsafe-number money2, price4 and charge revisions exact through persisted readback", kind => {
  const { inventory, repo, finance } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "large-purchase", projectId: "project", createDebt: true, externalCounterpartyId: partyId, paymentInputType: "AMOUNT", paidAmountDzd: "0.30", entries: [
    { kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "900719925474.0993" },
    { kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "Exact large equipment", purchasePriceDzd: "90071992547409.93" }] },
  ] });
  const read = inventory.getInvoiceGroup(purchase.group.id);
  expect(read.group).toMatchObject({ grossTotalDzd: "90972712472884.03", paidAmountDzd: "0.30", remainingDebtDzd: "90972712472883.73" });
  expect(read.entries[0]).toMatchObject({ unitPriceDzd: "900719925474.0993" });
  expect(read.entries[1]!.assets[0]!.purchasePriceDzd).toBe("90071992547409.93");
  expect(finance.remaining(read.group.debtEntryId!)).toBe("90972712472883.73");
  const charge = repo.listCharges()[0]!;
  inventory.updateAssetCharge({ requestId: "large-correction", chargeId: charge.id, amountDzd: "90071992547409.92" });
  expect(repo.getCharge(charge.id)?.revisions[0]).toMatchObject({ previousAmountDzd: "90071992547409.93", newAmountDzd: "90071992547409.92" });
  expect(() => JSON.stringify(inventory.getProjectContribution("project"))).not.toThrow();
});
it.each(["memory", "plain", "keyed"] as const)("%s: cannot reintroduce an externally transferred asset through an internal placement", kind => {
  const { inventory, repo } = setup(kind);
  const purchase = inventory.createInvoiceGroup({ requestId: "asset-outbound-stock", warehouseId: "warehouse", entries: [{ kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "Transferred equipment", purchasePriceDzd: "10.00" }] }] });
  const asset = purchase.entries[0]!.assets[0]!;
  inventory.createOutboundTransfer({ requestId: "asset-outbound", fromType: "WAREHOUSE", fromId: "warehouse", counterpartyId: partyId, transferType: "GIFT", items: [{ itemId: "asset", optionId: asset.id, quantity: 1 }] });
  const movements = repo.listMovements();
  expect(() => inventory.transferAsset({ requestId: "resurrect-asset", assetUnitId: asset.id, toProjectId: "project" })).toThrow(/source|available|external/i);
  expect(repo.getAsset(asset.id)).toMatchObject({ currentWarehouseId: null, currentProjectId: null });
  expect(repo.listMovements()).toEqual(movements);
  expect(repo.listCharges()).toEqual([]);
});
it.each(["memory", "plain", "keyed"] as const)("%s: retains an agreed 10000 total over 300 units without replacing it with a rounded rate", kind => {
  const { inventory } = setup(kind);
  const result = inventory.createInvoiceGroup({ requestId: "agreed", warehouseId: "warehouse", entries: [
    { kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 300, priceSource: { mode: "agreed-total", total: "10000.00", quantity: "300" } },
  ] });
  expect(result.group.grossTotalDzd).toBe("10000.00");
  expect(result.entries[0]).toMatchObject({ unitPriceDzd: null, priceSource: { mode: "agreed-total", total: "10000.00", quantity: "300" } });
});
