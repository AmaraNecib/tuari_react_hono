import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import type { AppClient } from "@tuari/contracts";
import { randomUUID } from "node:crypto";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createRouterClient } from "@orpc/server";
import { createFreshExactAppDependencies } from "../app/fresh-exact-dependencies";
import { createAppConfig } from "../config";
import { createRpcContext } from "./context";
import { createRouter } from "./router";

const roots: { close(): void }[] = [];
afterEach(() => { for (const root of roots.splice(0)) root.close(); });

async function fixture() {
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-637-source-privacy-")), "app.sqlite");
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
  const root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(root);
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Privacy owner", phone: "0612345678", password: "password123" });
  if (!owner.success) throw new Error("Owner bootstrap failed");
  const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> };
  const clientFor = async (id: string): Promise<AppClient> => {
    const session = await adapter.createSession(id);
    return createRouterClient(createRouter(root), { context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService) }) as AppClient;
  };
  const ownerClient = await clientFor(owner.item.id);
  const party = await ownerClient.externalCounterpartiesCreate({ fullName: "Disposable privacy party", phoneNumber: "0555123637" });
  const warehouse = await ownerClient.warehousesCreate({ name: "Disposable privacy warehouse" });
  const material = await ownerClient.inventoryItemDefinitionsCreate({ name: "Disposable privacy material", itemType: "CONSUMABLE", unit: "unit" });
  if (!party.success || !warehouse.success || !material.success) throw new Error("Disposable inventory fixture creation failed");
  const purchase = await ownerClient.financial.inventory.createInvoice({ requestId: "privacy-purchase", warehouseId: warehouse.item.id, externalCounterpartyId: party.item.id, createDebt: true, paymentInputType: "AMOUNT", paidAmountDzd: "0.00", entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 2, priceSource: { mode: "agreed-total", total: "100.00", quantity: "2" } }] });
  const sale = await ownerClient.financial.inventory.createOutbound({ requestId: "privacy-sale", fromType: "WAREHOUSE", fromId: warehouse.item.id, counterpartyId: party.item.id, transferType: "SALE", debtAmountDzd: "30.00", firstPaymentAmountDzd: "0.00", items: [{ itemId: material.item.id, quantity: 1, unitPriceDzd: "30.00" }] });
  const invoiceLabel = purchase.group.invoiceNumber;
  if (!invoiceLabel) throw new Error("Purchase fixture did not receive an invoice label");
  const pair = { externalCounterpartyId: party.item.id, payableOriginalEntryId: purchase.group.debtEntryId!, receivableOriginalEntryId: sale.debtEntryId!, currency: "DZD" as const, amountDzd: "10.00" };
  const confirmation = await ownerClient.financial.manualSettlement.confirm({ ...pair, requestId: "privacy-settle", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "30.00" });
  const db = createDatabaseConnection(databasePath, "");
  roots.push(db);
  const employeeId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)').run(employeeId, "Disposable debt reader", "+213555000637", now, now);
  const role = root.workforceService.listRoles().items.find(row => row.key === "worker")!;
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(randomUUID(), "Debt", "Reader", "+213555000637", role.id, now, now);
  db.prepare("DELETE FROM role_permission WHERE role_id=?").run(role.id);
  db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)").run(randomUUID(), role.id, "debts:read", now, now);
  const employeeClient = await clientFor(employeeId);
  return { ownerClient, employeeClient, partyId: party.item.id, purchase, sale, pair, settlement: confirmation.settlement, invoiceLabel };
}

const forbiddenInventoryRead = async (client: AppClient, purchaseId: string, saleId: string) => {
  await expect(client.financial.inventory.getInvoice({ id: purchaseId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(client.financial.inventory.getOutbound({ id: saleId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(client.financial.inventory.listOutbounds()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(client.financial.invoices.listInvoices({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
};
const expectNoInventoryIdentity = (value: unknown, ids: string[], labels: string[]) => {
  const serialized = JSON.stringify(value);
  for (const secret of [...ids, ...labels]) {
    expect.soft(serialized).not.toContain(secret);
    expect.soft(serialized).not.toContain(encodeURIComponent(secret));
  }
  expect.soft(serialized).not.toMatch(/\/invoices\/|\/outbound-transfers\?/);
};

it("debt-only candidates retain debt entries but do not disclose inventory source identity", async () => {
  const f = await fixture();
  await forbiddenInventoryRead(f.employeeClient, f.purchase.group.id, f.sale.id);
  const ownerSources = await f.ownerClient.financial.manualSettlement.candidates({ externalCounterpartyId: f.partyId });
  expect(ownerSources).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: f.pair.payableOriginalEntryId, debtAccountId: f.purchase.group.debtAccountId, direction: "PAYABLE", sourceKind: "PURCHASE", sourceId: f.purchase.group.id, sourceLabel: f.invoiceLabel }),
    expect.objectContaining({ id: f.pair.receivableOriginalEntryId, debtAccountId: f.sale.associatedDebtAccountId, direction: "RECEIVABLE", sourceKind: "SALE", sourceId: f.sale.id, sourceLabel: `SALE · ${f.sale.id}` }),
  ]));
  const candidates = await f.employeeClient.financial.manualSettlement.candidates({ externalCounterpartyId: f.partyId });
  expect(candidates).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: f.pair.payableOriginalEntryId, debtAccountId: f.purchase.group.debtAccountId, direction: "PAYABLE", postingSequence: 1, remainingDzd: "90.00" }),
    expect.objectContaining({ id: f.pair.receivableOriginalEntryId, debtAccountId: f.sale.associatedDebtAccountId, direction: "RECEIVABLE", postingSequence: 1, remainingDzd: "20.00" }),
  ]));
  expect(candidates).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: f.pair.payableOriginalEntryId, sourceKind: "RESTRICTED" }),
    expect.objectContaining({ id: f.pair.receivableOriginalEntryId, sourceKind: "RESTRICTED" }),
  ]));
  expect(candidates.filter(row => row.sourceKind === "RESTRICTED").every(row => !("sourceId" in row) && !("sourceLabel" in row))).toBe(true);
  expectNoInventoryIdentity(candidates, [f.purchase.group.id, f.sale.id], [f.invoiceLabel]);
});

it("debt-only settlement history retains financial history but does not disclose inventory source identity", async () => {
  const f = await fixture();
  await forbiddenInventoryRead(f.employeeClient, f.purchase.group.id, f.sale.id);
  const ownerHistory = await f.ownerClient.financial.manualSettlement.history({ externalCounterpartyId: f.partyId });
  expect(ownerHistory.items[0]?.payableSource).toMatchObject({ kind: "PURCHASE", id: f.purchase.group.id, label: f.invoiceLabel });
  expect(ownerHistory.items[0]?.receivableSource).toMatchObject({ kind: "SALE", id: f.sale.id });
  const history = await f.employeeClient.financial.manualSettlement.history({ externalCounterpartyId: f.partyId });
  expect(history.items.map(row => row.id)).toContain(f.settlement.id);
  expect(history.items[0]).toMatchObject({ id: f.settlement.id, payableOriginalEntryId: f.pair.payableOriginalEntryId, receivableOriginalEntryId: f.pair.receivableOriginalEntryId, payableSettlementEntryId: f.settlement.payableSettlementEntryId, receivableSettlementEntryId: f.settlement.receivableSettlementEntryId });
  expect(history.items[0]?.payableSource).toEqual({ kind: "RESTRICTED" });
  expect(history.items[0]?.receivableSource).toEqual({ kind: "RESTRICTED" });
  expectNoInventoryIdentity(history, [f.purchase.group.id, f.sale.id], [f.invoiceLabel]);
});

it("debt-only account history retains financial history but does not disclose inventory source identity", async () => {
  const f = await fixture();
  await forbiddenInventoryRead(f.employeeClient, f.purchase.group.id, f.sale.id);
  const ownerHistory = await f.ownerClient.financial.manualSettlement.accountHistory({ debtAccountId: f.purchase.group.debtAccountId! });
  expect(ownerHistory.items[0]?.payableSource).toMatchObject({ kind: "PURCHASE", id: f.purchase.group.id, label: f.invoiceLabel });
  expect(ownerHistory.items[0]?.receivableSource).toMatchObject({ kind: "SALE", id: f.sale.id });
  const payableHistory = await f.employeeClient.financial.manualSettlement.accountHistory({ debtAccountId: f.purchase.group.debtAccountId! });
  const receivableHistory = await f.employeeClient.financial.manualSettlement.accountHistory({ debtAccountId: f.sale.associatedDebtAccountId! });
  for (const history of [payableHistory, receivableHistory]) {
    expect(history.items.map(row => row.id)).toContain(f.settlement.id);
    expect(history.items[0]?.payableSource).toEqual({ kind: "RESTRICTED" });
    expect(history.items[0]?.receivableSource).toEqual({ kind: "RESTRICTED" });
    expect(history.items[0]).toMatchObject({ id: f.settlement.id, payableOriginalEntryId: f.pair.payableOriginalEntryId, receivableOriginalEntryId: f.pair.receivableOriginalEntryId, payableSettlementEntryId: f.settlement.payableSettlementEntryId, receivableSettlementEntryId: f.settlement.receivableSettlementEntryId });
    expectNoInventoryIdentity(history, [f.purchase.group.id, f.sale.id], [f.invoiceLabel]);
  }
});
