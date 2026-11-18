import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vitest";

import { createAppConfig } from "../../config";
import { createAppDependencies } from "../../app/dependencies";
import { createRpcContext } from "../../rpc/context";
import { createRouter } from "../../rpc/router";

const directories: string[] = [];
const openRoots: Array<{ close: () => void }> = [];

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
    type PurchaseResult = { item: { entries: Array<{ assets: Array<{ id: string; purchasePriceDzd: number }>; unitPriceDzd: number }> } };
    type ProjectResult = { item: { id: string } };
    const client = createRouterClient(router, {
      context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService) as never,
    }) as unknown as {
      projectsCreate(input: { name: string; status: "ACTIVE" }): Promise<ProjectResult>;
      warehousesCreate(input: { name: string; status: "ACTIVE" }): Promise<ProjectResult>;
      inventoryItemDefinitionsCreate(input: { name: string; itemType: "ASSET" | "CONSUMABLE"; unit?: string }): Promise<ProjectResult>;
      inventoryInvoiceGroupsCreate(input: Record<string, unknown>): Promise<PurchaseResult>;
      inventoryAssetsTransfer(input: Record<string, unknown>): Promise<unknown>;
      projectCostGet(input: { projectId: string }): Promise<{
        item: { stock: Array<{ amount: string }>; materialMovements: Array<{ unitPrice: string | null }>; parkedInventory: { assets: Array<{ purchaseAmount: string }> } };
      }>;
    };

    const project = await client.projectsCreate({ name: "Inventory cost precision", status: "ACTIVE" });
    const warehouse = await client.warehousesCreate({ name: "Inventory cost warehouse", status: "ACTIVE" });
    const assetType = await client.inventoryItemDefinitionsCreate({ name: "Cost asset", itemType: "ASSET" });
    const materialType = await client.inventoryItemDefinitionsCreate({ name: "Cost material", itemType: "CONSUMABLE", unit: "kg" });
    const projectId = project.item.id;

    for (const amount of [0.375]) {
      const invalidAssetInput = {
        projectId, createDebt: false,
        entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Invalid asset", purchasePriceDzd: amount }] }],
      };
      await expect(client.inventoryInvoiceGroupsCreate(invalidAssetInput)).rejects.toMatchObject({ code: "BAD_REQUEST", data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["entries", 0, "assets", 0, "purchasePriceDzd"] })]) } });
      const invalidMaterialInput = {
        projectId, createDebt: false,
        entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.123456, totalPriceDzd: 0.123456 }],
      };
      await expect(client.inventoryInvoiceGroupsCreate(invalidMaterialInput)).rejects.toMatchObject({ code: "BAD_REQUEST", data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["entries", 0, "unitPriceDzd"] })]) } });
    }

    const validAsset = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Valid asset", purchasePriceDzd: 0.37 }] }],
    });
    expect(validAsset.item.entries[0]!.assets[0]!.purchasePriceDzd).toBe(0.37);
    const validMaterial = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 0.1234, totalPriceDzd: 0.12 }],
    });
    expect(validMaterial.item.entries[0]!.unitPriceDzd).toBe(0.1234);
    const highUnitPrice = await client.inventoryInvoiceGroupsCreate({
      projectId, createDebt: false,
      entries: [{ kind: "CONSUMABLE", itemDefinitionId: materialType.item.id, quantity: 1, unitPriceDzd: 900_719_925_474.09, totalPriceDzd: 900_719_925_474.09 }],
    });
    expect(highUnitPrice.item.entries[0]!.unitPriceDzd).toBe(900_719_925_474.09);

    const parkedProject = await client.projectsCreate({ name: "Large parked inventory", status: "ACTIVE" });
    const parkedPurchase = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Large parked", purchasePriceDzd: 1_000_000_000_000_000 }] }],
    });
    const parkedAsset = parkedPurchase.item.entries[0]!.assets[0]!;
    await client.inventoryAssetsTransfer({ assetUnitId: parkedAsset.id, toProjectId: parkedProject.item.id, chargeAmountDzd: 0 });
    const maxSafeParkedPurchase = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Max safe parked", purchasePriceDzd: Number.MAX_SAFE_INTEGER }] }],
    });
    await client.inventoryAssetsTransfer({ assetUnitId: maxSafeParkedPurchase.item.entries[0]!.assets[0]!.id, toProjectId: parkedProject.item.id, chargeAmountDzd: 0 });

    const chargeProject = await client.projectsCreate({ name: "Large stock charge", status: "ACTIVE" });
    const chargeAsset = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Charge asset", purchasePriceDzd: 0 }] }],
    });
    const unitId = chargeAsset.item.entries[0]!.assets[0]!.id;
    await client.inventoryAssetsTransfer({ assetUnitId: unitId, toProjectId: chargeProject.item.id, chargeAmountDzd: 1_000_000_000_000_000 });
    const highCost = await client.projectCostGet({ projectId: chargeProject.item.id });
    expect(highCost.item.stock).toEqual([expect.objectContaining({ amount: "1000000000000000.00" })]);

    const maxSafeProject = await client.projectsCreate({ name: "Max safe stock charge", status: "ACTIVE" });
    const maxSafeAsset = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Max safe charge", purchasePriceDzd: 0 }] }],
    });
    await client.inventoryAssetsTransfer({ assetUnitId: maxSafeAsset.item.entries[0]!.assets[0]!.id, toProjectId: maxSafeProject.item.id, chargeAmountDzd: Number.MAX_SAFE_INTEGER });
    await expect(client.projectCostGet({ projectId: maxSafeProject.item.id })).resolves.toMatchObject({ item: { stock: [expect.objectContaining({ amount: "9007199254740991.00" })] } });

    const parkedCost = await client.projectCostGet({ projectId: parkedProject.item.id });
    expect(parkedCost.item.parkedInventory.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ purchaseAmount: "1000000000000000.00" }),
      expect.objectContaining({ purchaseAmount: "9007199254740991.00" }),
    ]));
    const materialCost = await client.projectCostGet({ projectId });
    expect(materialCost.item.materialMovements).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitPrice: "0.1234" }),
      expect.objectContaining({ unitPrice: "900719925474.0900" }),
    ]));
    expect(materialCost.item.parkedInventory.assets).toEqual([expect.objectContaining({ purchaseAmount: "0.37" })]);

    const roundedProject = await client.projectsCreate({ name: "Rounded legacy charge", status: "ACTIVE" });
    const roundedAsset = await client.inventoryInvoiceGroupsCreate({
      warehouseId: warehouse.item.id, createDebt: false,
      entries: [{ kind: "ASSET", itemDefinitionId: assetType.item.id, assets: [{ assetName: "Rounded charge", purchasePriceDzd: 0 }] }],
    });
    await client.inventoryAssetsTransfer({ assetUnitId: roundedAsset.item.entries[0]!.assets[0]!.id, toProjectId: roundedProject.item.id, chargeAmountDzd: 0.375 });
    await expect(client.projectCostGet({ projectId: roundedProject.item.id })).resolves.toMatchObject({ item: { stock: [expect.objectContaining({ amount: "0.38" })] } });
  });
});
