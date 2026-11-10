import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouterClient } from "@orpc/server";
import type { ExactInventoryClient } from "@tuari/contracts";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { exactInvoiceSchemaStatements } from "../modules/invoice/adapters/exact-invoice-schema";
import { exactDebtSchemaStatements } from "../modules/company/adapters/exact-finance-schema";
import { exactInventorySchemaStatements } from "../modules/inventory/adapters/exact-inventory-schema";
import { createExactCommerceComposition } from "./exact-commerce-composition";
import { createRpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";
const date = "2026-11-10T10:00:00.000Z";
const user = { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0", permissions: [] };
it.each(["", "526-public-rpc-key"])("purchase/transfer/charge/outbound input-to-native RPC key=%s", async key => {
  const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-526-rpc-")), "fixture.sqlite"), key);
  try {
    db.pragma("foreign_keys=ON");
    db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE warehouse(id TEXT PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE project(id TEXT PRIMARY KEY,name TEXT NOT NULL); INSERT INTO external_counterparty VALUES ('party'); INSERT INTO warehouse VALUES ('warehouse','Synthetic warehouse'); INSERT INTO project VALUES ('project','Synthetic project')");
    for (const sql of [...exactInvoiceSchemaStatements, ...exactDebtSchemaStatements, ...exactInventorySchemaStatements]) db.exec(sql);
    for (const [id, name, kind, unit] of [["material", "Synthetic material", "CONSUMABLE", "m"], ["asset", "Synthetic asset", "ASSET", null]]) db.prepare("INSERT INTO inventory_item_definition(id,name,item_type,unit,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)").run(id, name, kind, unit, date, date);
    const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === user.id } });
    const composition = createExactCommerceComposition(db, createFifoLock(), middleware, { id: randomUUID, now: () => date });
    const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => user };
    const client = createRouterClient(composition.router.inventory, { context }) as ExactInventoryClient;
    const purchaseInput = { requestId: "purchase", warehouseId: "warehouse", createDebt: true, externalCounterpartyId: "party", paymentInputType: "AMOUNT" as const, paidAmountDzd: "0.10", entries: [
      { kind: "CONSUMABLE" as const, itemDefinitionId: "material", quantity: 0.25, unitPriceDzd: "1.5000" },
      { kind: "CONSUMABLE" as const, itemDefinitionId: "material", quantity: 0.25, unitPriceDzd: "1.5000" },
      { kind: "ASSET" as const, itemDefinitionId: "asset", assets: [{ assetName: "Synthetic unit", purchasePriceDzd: "10.00" }] },
    ] };
    const purchase = await client.createInvoice(purchaseInput);
    expect(purchase.group).toMatchObject({ grossTotalDzd: "10.75", paidAmountDzd: "0.10", remainingDebtDzd: "10.65" });
    expect(await client.createInvoice(purchaseInput)).toEqual(purchase);
    await client.recordPayment({ requestId: "partial", invoiceGroupId: purchase.group.id, amountDzd: "0.20" });
    expect(composition.services.finance.remaining(purchase.group.debtEntryId!)).toBe("10.45");
    const asset = purchase.entries.find(row => row.itemType === "ASSET")!.assets[0]!;
    await client.transferAsset({ requestId: "placement", assetUnitId: asset.id, toProjectId: "project", chargeAmountDzd: "0.30" });
    const charge = (await client.projectCharges({ projectId: "project" })).charges[0]!;
    await client.updateCharge({ requestId: "correct", chargeId: charge.id, amountDzd: "0.25", reason: "Synthetic correction" });
    expect(await client.projectContribution({ projectId: "project" })).toMatchObject({ equipmentChargesDzd: "0.25", totalDzd: "0.25", parkedAssetValueDzd: "10.00" });
    const option = purchase.consumableBalances[0]!;
    const outbound = await client.createOutbound({ requestId: "sale", fromType: "WAREHOUSE", fromId: "warehouse", counterpartyId: "party", transferType: "SALE", debtAmountDzd: "0.30", firstPaymentAmountDzd: "0.10", items: [{ itemId: "material", optionId: option.id, quantity: 0.1, unitPriceDzd: "3.0000" }] });
    expect(outbound).toMatchObject({ actorUserId: user.id, actorLabel: user.name, currency: "DZD" });
    expect(composition.services.finance.remaining(outbound.debtEntryId!)).toBe("0.20");
    expect((await client.getOutbound({ id: outbound.id })).items[0]).toMatchObject({ optionId: option.id, unitPriceDzd: "3.0000", priceSource: { mode: "unit-price", price: "3.0000", quantity: "0.1" } });
    await client.voidCharge({ requestId: "void", chargeId: charge.id, reason: "Wrong placement" });
    expect(await client.projectCharges({ projectId: "project" })).toMatchObject({ totalDzd: "0.00" });
    expect(() => JSON.stringify(composition.services.inventory.getInvoiceGroup(purchase.group.id))).not.toThrow();
    await expect(client.recordPayment({ requestId: "invalid", invoiceGroupId: purchase.group.id, amountDzd: "0.001" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const anonymous = createRouterClient(composition.router.inventory, { context: { ...context, resolveCurrentUser: async () => null } }) as ExactInventoryClient;
    await expect(anonymous.listInvoices()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const nonAdmin = createRouterClient(composition.router.inventory, { context: { ...context, resolveCurrentUser: async () => ({ ...user, id: "not-owner" }) } }) as ExactInventoryClient;
    await expect(nonAdmin.createInvoice(purchaseInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  } finally { db.close(); }
});
