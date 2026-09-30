/**
 * Project material cost over the REAL inventory module (issue #414).
 *
 * The owner's settled rule: project material cost is the NET value of the
 * consumable movements in which the project is a party. A movement INTO the
 * project (a direct purchase, or a warehouse → project transfer) adds its
 * value; a movement OUT of the project (project → warehouse, or project → other
 * project) removes it. Physical consumption has no event and does not move the
 * figure.
 *
 * The movements are driven through the real `InventoryService`, so the figure
 * is pinned against the rows the inventory module actually writes rather than a
 * re-derivation from a current balance.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { roundMoney } from "@tuari/contracts";

import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createInventoryRepository } from "../../modules/inventory/adapters/sqlite-inventory.repository";
import { createAssetChargeRepository } from "../../modules/inventory/adapters/sqlite-asset-charge.repository";
import type { InventoryRepository } from "../../modules/inventory/inventory.repository";
import { InventoryService } from "../../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../../modules/inventory/inventory.storage";
import { AssetChargeService } from "../../modules/inventory/asset-charge.service";
import { createProjectCostRepository } from "../../modules/project-cost/adapters/sqlite-project-cost.repository";
import { ProjectCostService } from "../../modules/project-cost/project-cost.service";

const NOW = "2026-06-01T00:00:00.000Z";
const PROJECT_A = "p-a";
const PROJECT_B = "p-b";
const WAREHOUSE = "wh-1";

function createEnv() {
  const rawDb = new Database(":memory:") as unknown as BetterSqliteDatabase;
  rawDb.pragma("foreign_keys = ON");
  for (const statement of schemaStatements) {
    rawDb.exec(statement);
  }

  rawDb
    .prepare(`INSERT INTO "project" ("id","name","status","created_at","updated_at") VALUES (?,?,?,?,?)`)
    .run(PROJECT_A, "مشروع أ", "ACTIVE", NOW, NOW);
  rawDb
    .prepare(`INSERT INTO "project" ("id","name","status","created_at","updated_at") VALUES (?,?,?,?,?)`)
    .run(PROJECT_B, "مشروع ب", "ACTIVE", NOW, NOW);
  rawDb
    .prepare(`INSERT INTO "warehouse" ("id","name","status","created_at","updated_at") VALUES (?,?,?,?,?)`)
    .run(WAREHOUSE, "المستودع الرئيسي", "ACTIVE", NOW, NOW);

  const inventoryRepository = createInventoryRepository(rawDb);
  const attachmentDir = mkdtempSync(join(tmpdir(), "project-cost-materials-"));
  const storage = new InventoryAttachmentStorage(attachmentDir);
  const chargeService = new AssetChargeService(createAssetChargeRepository(rawDb), inventoryRepository);
  const inventory = new InventoryService(inventoryRepository, storage, undefined, undefined, chargeService);
  const projectCost = new ProjectCostService(createProjectCostRepository(rawDb));

  return {
    rawDb,
    inventoryRepository,
    inventory,
    projectCost,
    dispose: () => {
      rawDb.close();
      rmSync(attachmentDir, { recursive: true, force: true });
    },
  };
}

type Env = ReturnType<typeof createEnv>;

function chargedMaterials(env: Env, projectId: string): number {
  return env.projectCost.getProjectCost({ projectId }).item.parts.chargedMaterialsDzd;
}

function total(env: Env, projectId: string): number {
  return env.projectCost.getProjectCost({ projectId }).item.totalDzd;
}

/** Buy consumables into the warehouse and return the entry id. */
function buyIntoWarehouse(env: Env, itemDefinitionId: string, quantity: number, unitPriceDzd: number): string {
  const result = env.inventory.createInvoiceGroup({
    warehouseId: WAREHOUSE,
    createDebt: false,
    entries: [
      {
        kind: "CONSUMABLE",
        itemDefinitionId,
        quantity,
        unitPriceDzd,
        totalPriceDzd: roundMoney(quantity * unitPriceDzd),
      },
    ],
  });
  return result.item.entries[0]!.id;
}

describe("project material cost nets the movements in and out (#414)", () => {
  let env: Env;
  beforeEach(() => {
    env = createEnv();
  });
  afterEach(() => {
    env.dispose();
  });

  it("follows the owner's worked example at 500 DZD per bag", () => {
    const item = env.inventory.createItemDefinition({
      name: "إسمنت",
      itemType: "CONSUMABLE",
      unit: "كيس",
    }).item;

    // 1) Buy 10 into the warehouse: no project is charged.
    const entryId = buyIntoWarehouse(env, item.id, 10, 500);
    expect(chargedMaterials(env, PROJECT_A)).toBe(0);
    expect(total(env, PROJECT_A)).toBe(0);

    // 2) Warehouse → A 10: A is charged 5,000.
    env.inventory.transferConsumable({
      inventoryEntryId: entryId,
      quantity: 10,
      fromWarehouseId: WAREHOUSE,
      toProjectId: PROJECT_A,
    });
    expect(chargedMaterials(env, PROJECT_A)).toBe(5_000);
    expect(total(env, PROJECT_A)).toBe(5_000);

    // 3) Physical use has no event: the charge is unchanged.
    expect(chargedMaterials(env, PROJECT_A)).toBe(5_000);

    // 4) A → warehouse 3 reverses 1,500; A keeps 3,500.
    env.inventory.transferConsumable({
      inventoryEntryId: entryId,
      quantity: 3,
      fromProjectId: PROJECT_A,
      toWarehouseId: WAREHOUSE,
    });
    expect(chargedMaterials(env, PROJECT_A)).toBe(3_500);
    expect(total(env, PROJECT_A)).toBe(3_500);

    // 5) A → B 2 moves 1,000 from A to B.
    env.inventory.transferConsumable({
      inventoryEntryId: entryId,
      quantity: 2,
      fromProjectId: PROJECT_A,
      toProjectId: PROJECT_B,
    });
    expect(chargedMaterials(env, PROJECT_A)).toBe(2_500);
    expect(chargedMaterials(env, PROJECT_B)).toBe(1_000);
  });

  it("equals the net of the consumable movements the inventory module wrote", () => {
    const item = env.inventory.createItemDefinition({
      name: "إسمنت",
      itemType: "CONSUMABLE",
      unit: "كيس",
    }).item;
    const entryId = buyIntoWarehouse(env, item.id, 10, 500);
    env.inventory.transferConsumable({
      inventoryEntryId: entryId,
      quantity: 10,
      fromWarehouseId: WAREHOUSE,
      toProjectId: PROJECT_A,
    });
    env.inventory.transferConsumable({
      inventoryEntryId: entryId,
      quantity: 3,
      fromProjectId: PROJECT_A,
      toWarehouseId: WAREHOUSE,
    });
    env.inventory.transferConsumable({
      inventoryEntryId: entryId,
      quantity: 2,
      fromProjectId: PROJECT_A,
      toProjectId: PROJECT_B,
    });

    // The independent oracle: reduce the inventory module's own movements.
    const netOfMovements = env.inventoryRepository
      .listMovementValuations()
      .filter(
        ({ movement }) =>
          movement.itemType === "CONSUMABLE" &&
          (movement.toProjectId === PROJECT_A || movement.fromProjectId === PROJECT_A),
      )
      .reduce((sum, { movement, unitPriceDzd }) => {
        const value = roundMoney((unitPriceDzd ?? 0) * movement.quantity);
        return roundMoney(sum + (movement.toProjectId === PROJECT_A ? value : -value));
      }, 0);

    expect(netOfMovements).toBe(2_500);
    expect(chargedMaterials(env, PROJECT_A)).toBe(netOfMovements);
  });

  it("charges a consumable at the project and parks only the assets there", () => {
    const consumable = env.inventory.createItemDefinition({
      name: "إسمنت",
      itemType: "CONSUMABLE",
      unit: "كيس",
    }).item;
    const assetDefinition = env.inventory.createItemDefinition({
      name: "خلاطة",
      itemType: "ASSET",
    }).item;

    env.inventory.createInvoiceGroup({
      projectId: PROJECT_A,
      createDebt: false,
      entries: [
        {
          kind: "CONSUMABLE",
          itemDefinitionId: consumable.id,
          quantity: 5,
          unitPriceDzd: 500,
          totalPriceDzd: 2_500,
        },
      ],
    });
    env.inventory.createInvoiceGroup({
      projectId: PROJECT_A,
      createDebt: false,
      entries: [
        {
          kind: "ASSET",
          itemDefinitionId: assetDefinition.id,
          assets: [{ assetName: "خلاطة", purchasePriceDzd: 180_000 }],
        },
      ],
    });

    const cost = env.projectCost.getProjectCost({ projectId: PROJECT_A }).item;
    expect(cost.parts.chargedMaterialsDzd).toBe(2_500);
    expect(cost.parts.stockDzd).toBe(180_000);
    // The tool is parked inventory; the material is charged, not parked.
    expect(cost.parkedInventory.assets.map((asset) => asset.assetName)).toEqual(["خلاطة"]);
    expect(cost.parkedInventory.totalDzd).toBe(180_000);
    expect("consumables" in cost.parkedInventory).toBe(false);
  });
});
