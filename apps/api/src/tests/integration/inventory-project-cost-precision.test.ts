import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRouterClient } from "@orpc/server";
import type { AppClient } from "@tuari/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createAppConfig } from "../../config";
import { createAppDependencies } from "../../app/dependencies";
import { createRpcContext } from "../../rpc/context";
import { createRouter } from "../../rpc/router";

const directories: string[] = [];
const openRoots: Array<{ close: () => void }> = [];

function expectSuccess<T extends { success: boolean }>(result: T): asserts result is T & { success: true } {
  if (!result.success) throw new Error("Expected authenticated inventory RPC to succeed");
}

afterEach(() => {
  for (const root of openRoots.splice(0)) root.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("legacy inventory costs read through strict project-cost codecs", { timeout: 60_000 }, () => {
  it("rejects unsupported purchase scales before writes and reads accepted legacy REAL values", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-inventory-cost-precision-"));
    directories.push(directory);
    const config = createAppConfig({ BETTER_AUTH_SECRET: "inventory-cost-precision-secret-543", DB_ADAPTER: "sqlite" });
    const root = await createAppDependencies({ databasePath: join(directory, "inventory.sqlite") }, config);
    openRoots.push(root);
    const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Inventory owner", phone: "0612345790", password: "password123" });
    if (!owner.success) throw new Error("Could not create the test owner");
    const authContext = await root.auth.$context;
    const adapter = authContext.internalAdapter as unknown as { createSession: (userId: string) => Promise<{ token: string }> };
    const session = await adapter.createSession(owner.item.id);
    const router = createRouter(root as never);
    const client = createRouterClient(router, {
      context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService) as never,
    }) as unknown as AppClient;

    const project = await client.projectsCreate({ name: "Inventory cost precision", status: "ACTIVE" });
    const warehouse = await client.warehousesCreate({ name: "Inventory cost warehouse", status: "ACTIVE" });
    const assetType = await client.inventoryItemDefinitionsCreate({ name: "Cost asset", itemType: "ASSET" });
    const materialType = await client.inventoryItemDefinitionsCreate({ name: "Cost material", itemType: "CONSUMABLE", unit: "kg" });
    expectSuccess(project);
    expectSuccess(warehouse);
    expectSuccess(assetType);
    expectSuccess(materialType);
    const projectId = project.item.id;
    const invoiceGroupsBefore = await client.inventoryInvoiceGroupsList({ projectId });

    const invalidQuantityInput = {
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 0.1234567, unitPriceDzd: 1, totalPriceDzd: 1 }],
    } satisfies Parameters<AppClient["inventoryInvoiceGroupsCreate"]>[0];
    expect(() => root.inventoryService.createInvoiceGroup(invalidQuantityInput, { actorUserId: owner.item.id, actorLabel: owner.item.name, transactionId: "invalid-quantity-scale" })).toThrow(expect.objectContaining({ appError: expect.objectContaining({ fieldErrors: [expect.objectContaining({ field: "entries.0.quantity" })] }) }));
    await expect(client.inventoryInvoiceGroupsCreate(invalidQuantityInput)).rejects.toMatchObject({ code: "BAD_REQUEST", data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["entries", 0, "quantity"] })]) } });
    const invalidLargePriceInput = {
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 1_000_000_000_000_000, totalPriceDzd: 1 }],
    } satisfies Parameters<AppClient["inventoryInvoiceGroupsCreate"]>[0];
    expect(() => root.inventoryService.createInvoiceGroup(invalidLargePriceInput, { actorUserId: owner.item.id, actorLabel: owner.item.name, transactionId: "invalid-large-unit-price" })).toThrow(expect.objectContaining({ appError: expect.objectContaining({ fieldErrors: [expect.objectContaining({ field: "entries.0.unitPriceDzd" })] }) }));
    await expect(client.inventoryInvoiceGroupsCreate(invalidLargePriceInput)).rejects.toMatchObject({ code: "BAD_REQUEST", data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["entries", 0, "unitPriceDzd"] })]) } });
    const groupsAfterRejectedBoundaryWrites = await client.inventoryInvoiceGroupsList({ projectId });
    expect(groupsAfterRejectedBoundaryWrites.items.map(({ id }) => id)).toEqual(invoiceGroupsBefore.items.map(({ id }) => id));

    const microQuantity = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 0.000001, unitPriceDzd: 1.2345, totalPriceDzd: 1 }],
    });
    expectSuccess(microQuantity);
    expect(microQuantity.item.entries[0]!.quantity).toBe(0.000001);
    const microQuantityCost = await client.projectCostGet({ projectId });
    expectSuccess(microQuantityCost);
    expect(microQuantityCost.item.materialMovements).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: "0.000001", unitPrice: "1.2345" }),
    ]));
    const nearMaximumPrice = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 922_337_203_685_477.5, totalPriceDzd: 1 }],
    });
    expectSuccess(nearMaximumPrice);
    const nearMaximumCost = await client.projectCostGet({ projectId });
    expectSuccess(nearMaximumCost);
    expect(nearMaximumCost.item.materialMovements).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: "1", unitPrice: "922337203685477.5000", valueAmount: "922337203685477.50" }),
    ]));
    const invoiceGroupsBeforeExistingScaleChecks = await client.inventoryInvoiceGroupsList({ projectId });

    for (const amount of [0.375]) {
      const invalidAssetInput = {
        projectId, createDebt: false,
        entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Invalid asset", purchasePriceDzd: amount }] }],
      } satisfies Parameters<AppClient["inventoryInvoiceGroupsCreate"]>[0];
      expect(() => root.inventoryService.createInvoiceGroup(invalidAssetInput, { actorUserId: owner.item.id, actorLabel: owner.item.name, transactionId: "invalid-asset-scale" })).toThrow(/سعر الشراء/);
      await expect(client.inventoryInvoiceGroupsCreate(invalidAssetInput)).rejects.toMatchObject({ code: "BAD_REQUEST", data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["entries", 0, "assets", 0, "purchasePriceDzd"] })]) } });
      const invalidMaterialInput = {
        projectId, createDebt: false,
        entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.123456, totalPriceDzd: 0.123456 }],
      } satisfies Parameters<AppClient["inventoryInvoiceGroupsCreate"]>[0];
      expect(() => root.inventoryService.createInvoiceGroup(invalidMaterialInput, { actorUserId: owner.item.id, actorLabel: owner.item.name, transactionId: "invalid-material-scale" })).toThrow(/سعر الوحدة/);
      await expect(client.inventoryInvoiceGroupsCreate(invalidMaterialInput)).rejects.toMatchObject({ code: "BAD_REQUEST", data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["entries", 0, "unitPriceDzd"] })]) } });
    }
    const invoiceGroupsAfterRejectedWrites = await client.inventoryInvoiceGroupsList({ projectId });
    expect(invoiceGroupsAfterRejectedWrites.items.map(({ id }) => id)).toEqual(invoiceGroupsBeforeExistingScaleChecks.items.map(({ id }) => id));

    const validAsset = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Valid asset", purchasePriceDzd: 0.37 }] }],
    });
    expectSuccess(validAsset);
    expect(validAsset.item.entries[0]!.assets[0]!.purchasePriceDzd).toBe(0.37);
    const validMaterial = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.1234, totalPriceDzd: 0.12 }],
    });
    expectSuccess(validMaterial);
    expect(validMaterial.item.entries[0]!.unitPriceDzd).toBe(0.1234);
    expect(validMaterial.item.entries[0]!.totalPriceDzd).toBe(0.1234);
    expect(validMaterial.item.group).toMatchObject({ grossTotalDzd: 0.12, paidAmountDzd: 0.12, remainingDebtDzd: 0 });
    const fractionQuantityProduct = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 0.1, unitPriceDzd: 0.12, totalPriceDzd: 0.01 }],
    });
    expectSuccess(fractionQuantityProduct);
    expect(fractionQuantityProduct.item.entries[0]!.totalPriceDzd).toBe(0.012);
    expect(fractionQuantityProduct.item.group).toMatchObject({ grossTotalDzd: 0.01, paidAmountDzd: 0.01, remainingDebtDzd: 0 });
    const persistedFractionalLine = await client.inventoryInvoiceGroupsGet({ id: fractionQuantityProduct.item.group.id });
    expectSuccess(persistedFractionalLine);
    expect(persistedFractionalLine.item.entries[0]!.totalPriceDzd).toBe(0.012);
    const mixedProducts = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [
        { kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.1234, totalPriceDzd: 0.12 },
        { kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 0.1, unitPriceDzd: 0.12, totalPriceDzd: 0.01 },
      ],
    });
    expectSuccess(mixedProducts);
    expect(mixedProducts.item.group).toMatchObject({ grossTotalDzd: 0.14, paidAmountDzd: 0.14, remainingDebtDzd: 0 });

    const supplier = await client.externalCounterpartiesCreate({ fullName: "Invoice finalization supplier", phoneNumber: "0558005432" });
    expectSuccess(supplier);
    const groupsBeforeInvalidDirectPayment = await client.inventoryInvoiceGroupsList({ warehouseId: warehouse.item.id });
    expect(() => root.inventoryService.createInvoiceGroup({
      warehouseId: warehouse.item.id,
      externalCounterpartyId: supplier.item.id,
      createDebt: true,
      paymentInputType: "AMOUNT",
      paidAmountDzd: 0.375,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.375, totalPriceDzd: 0.38 }],
    }, { actorUserId: owner.item.id, actorLabel: owner.item.name, transactionId: "invalid-initial-payment-scale" })).toThrow(/المبلغ المدفوع/);
    const groupsAfterInvalidDirectPayment = await client.inventoryInvoiceGroupsList({ warehouseId: warehouse.item.id });
    expect(groupsAfterInvalidDirectPayment.items.map(({ id }) => id)).toEqual(groupsBeforeInvalidDirectPayment.items.map(({ id }) => id));
    const debtPurchase = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id,
      externalCounterpartyId: supplier.item.id,
      createDebt: true,
      paymentInputType: "AMOUNT",
      paidAmountDzd: 0.25,
      entries: [
        { kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.375, totalPriceDzd: 0.38 },
        { kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.375, totalPriceDzd: 0.38 },
      ],
    });
    expectSuccess(debtPurchase);
    expect(debtPurchase.item.group).toMatchObject({ grossTotalDzd: 0.75, paidAmountDzd: 0.25, remainingDebtDzd: 0.5 });
    const persistedDebtPurchase = await client.inventoryInvoiceGroupsGet({ id: debtPurchase.item.group.id });
    expectSuccess(persistedDebtPurchase);
    expect(persistedDebtPurchase.item.group).toMatchObject({ grossTotalDzd: 0.75, paidAmountDzd: 0.25, remainingDebtDzd: 0.5 });
    const purchaseDebtAccount = await client.debtAccountsGet({ id: persistedDebtPurchase.item.group.debtAccountId! });
    expectSuccess(purchaseDebtAccount);
    expect(purchaseDebtAccount.item.currentBalance).toBe(0.5);
    const purchaseDebtEntries = await client.debtEntriesList({ debtAccountId: purchaseDebtAccount.item.id });
    expect(purchaseDebtEntries.items.map(({ signedAmountDzd }) => signedAmountDzd)).toEqual(expect.arrayContaining([0.75, -0.25]));
    expect(purchaseDebtEntries.items).toHaveLength(2);

    const percentageDebtPurchase = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id,
      externalCounterpartyId: supplier.item.id,
      createDebt: true,
      paymentInputType: "PERCENT",
      paidPercent: 50,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.375, totalPriceDzd: 0.38 }],
    });
    expectSuccess(percentageDebtPurchase);
    expect(percentageDebtPurchase.item.group).toMatchObject({ grossTotalDzd: 0.38, paidAmountDzd: 0.19, remainingDebtDzd: 0.19 });
    const persistedPercentageDebt = await client.inventoryInvoiceGroupsGet({ id: percentageDebtPurchase.item.group.id });
    expectSuccess(persistedPercentageDebt);
    expect(persistedPercentageDebt.item.group).toMatchObject({ grossTotalDzd: 0.38, paidAmountDzd: 0.19, remainingDebtDzd: 0.19 });
    const percentageDebtAccount = await client.debtAccountsGet({ id: persistedPercentageDebt.item.group.debtAccountId! });
    expectSuccess(percentageDebtAccount);
    expect(percentageDebtAccount.item.currentBalance).toBe(0.69);

    const groupsBeforeOverflow = await client.inventoryInvoiceGroupsList({ warehouseId: warehouse.item.id });
    const accountsBeforeOverflow = await client.debtAccountsList({ externalCounterpartyId: supplier.item.id });
    const overflowPurchase = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id,
      externalCounterpartyId: supplier.item.id,
      createDebt: true,
      paymentInputType: "AMOUNT",
      paidAmountDzd: 0,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 10_001, unitPriceDzd: 900_719_925_474.09, totalPriceDzd: 1 }],
    });
    expect(overflowPurchase).toMatchObject({ success: false, error: { code: "BUSINESS_RULE" } });
    const groupsAfterOverflow = await client.inventoryInvoiceGroupsList({ warehouseId: warehouse.item.id });
    const accountsAfterOverflow = await client.debtAccountsList({ externalCounterpartyId: supplier.item.id });
    expect(groupsAfterOverflow.items.map(({ id }) => id)).toEqual(groupsBeforeOverflow.items.map(({ id }) => id));
    expect(accountsAfterOverflow.items.map(({ id }) => id)).toEqual(accountsBeforeOverflow.items.map(({ id }) => id));

    const highUnitPrice = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 900_719_925_474.09, totalPriceDzd: 900_719_925_474.09 }],
    });
    expectSuccess(highUnitPrice);
    expect(highUnitPrice.item.entries[0]!.unitPriceDzd).toBe(900_719_925_474.09);
    expect(highUnitPrice.item.group).toMatchObject({ grossTotalDzd: 900_719_925_474.09, paidAmountDzd: 900_719_925_474.09, remainingDebtDzd: 0 });

    const parkedProject = await client.projectsCreate({ name: "Large parked inventory", status: "ACTIVE" });
    expectSuccess(parkedProject);
    const parkedPurchase = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Large parked", purchasePriceDzd: 1_000_000_000_000_000 }] }],
    });
    expectSuccess(parkedPurchase);
    expect(parkedPurchase.item.group.grossTotalDzd).toBe(1_000_000_000_000_000);
    const parkedAsset = parkedPurchase.item.entries[0]!.assets[0]!;
    await client.inventoryAssetsTransfer({ assetUnitId: parkedAsset.id, toProjectId: parkedProject.item.id, chargeAmountDzd: 0 });
    const maxSafeParkedPurchase = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Max safe parked", purchasePriceDzd: Number.MAX_SAFE_INTEGER }] }],
    });
    expectSuccess(maxSafeParkedPurchase);
    expect(maxSafeParkedPurchase.item.group).toMatchObject({ grossTotalDzd: Number.MAX_SAFE_INTEGER, paidAmountDzd: Number.MAX_SAFE_INTEGER, remainingDebtDzd: 0 });
    await client.inventoryAssetsTransfer({ assetUnitId: maxSafeParkedPurchase.item.entries[0]!.assets[0]!.id, toProjectId: parkedProject.item.id, chargeAmountDzd: 0 });

    const chargeProject = await client.projectsCreate({ name: "Large stock charge", status: "ACTIVE" });
    expectSuccess(chargeProject);
    const chargeAsset = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Charge asset", purchasePriceDzd: 0 }] }],
    });
    expectSuccess(chargeAsset);
    const unitId = chargeAsset.item.entries[0]!.assets[0]!.id;
    await client.inventoryAssetsTransfer({ assetUnitId: unitId, toProjectId: chargeProject.item.id, chargeAmountDzd: 1_000_000_000_000_000 });
    const highCost = await client.projectCostGet({ projectId: chargeProject.item.id });
    expectSuccess(highCost);
    expect(highCost.item.stock).toEqual([expect.objectContaining({ amount: "1000000000000000.00" })]);

    const maxSafeProject = await client.projectsCreate({ name: "Max safe stock charge", status: "ACTIVE" });
    expectSuccess(maxSafeProject);
    const maxSafeAsset = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Max safe charge", purchasePriceDzd: 0 }] }],
    });
    expectSuccess(maxSafeAsset);
    await client.inventoryAssetsTransfer({ assetUnitId: maxSafeAsset.item.entries[0]!.assets[0]!.id, toProjectId: maxSafeProject.item.id, chargeAmountDzd: Number.MAX_SAFE_INTEGER });
    await expect(client.projectCostGet({ projectId: maxSafeProject.item.id })).resolves.toMatchObject({ item: { stock: [expect.objectContaining({ amount: "9007199254740991.00" })] } });

    const parkedCost = await client.projectCostGet({ projectId: parkedProject.item.id });
    expectSuccess(parkedCost);
    expect(parkedCost.item.parkedInventory.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ purchaseAmount: "1000000000000000.00" }),
      expect.objectContaining({ purchaseAmount: "9007199254740991.00" }),
    ]));
    const materialCost = await client.projectCostGet({ projectId });
    expectSuccess(materialCost);
    expect(materialCost.item.materialMovements).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitPrice: "0.1234" }),
      expect.objectContaining({ unitPrice: "900719925474.0900" }),
      expect.objectContaining({ quantity: "0.1", unitPrice: "0.1200", valueAmount: "0.01" }),
      expect.objectContaining({ quantity: "1", unitPrice: "0.1234", valueAmount: "0.12" }),
    ]));
    expect(materialCost.item.parkedInventory.assets).toEqual([expect.objectContaining({ purchaseAmount: "0.37" })]);

    const roundedProject = await client.projectsCreate({ name: "Rounded legacy charge", status: "ACTIVE" });
    expectSuccess(roundedProject);
    const roundedAsset = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Rounded charge", purchasePriceDzd: 0 }] }],
    });
    expectSuccess(roundedAsset);
    await client.inventoryAssetsTransfer({ assetUnitId: roundedAsset.item.entries[0]!.assets[0]!.id, toProjectId: roundedProject.item.id, chargeAmountDzd: 0.375 });
    await expect(client.projectCostGet({ projectId: roundedProject.item.id })).resolves.toMatchObject({ item: { stock: [expect.objectContaining({ amount: "0.38" })] } });
  });
});
