/**
 * SqliteProjectCostRepository against a REAL in-memory sqlite database.
 *
 * Pins the SQL the service's fake port cannot: the live/void predicates, the
 * name joins, the salary split join and the movement-into-project valuation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements } from "../../../infrastructure/database/schema-definitions";
import { createProjectCostRepository } from "./sqlite-project-cost.repository";
import { ProjectCostService } from "../project-cost.service";

const NOW = "2026-06-01T00:00:00.000Z";

function createTestEnv() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const statement of schemaStatements) {
    db.exec(statement);
  }

  db.prepare(`INSERT INTO "role" ("id","key","name","is_system","created_at","updated_at") VALUES ('role-1','WORKER','عامل',0,?,?)`).run(NOW, NOW);
  db.prepare(`INSERT INTO "employee" ("id","first_name","last_name","phone","role_id","status","created_at","updated_at") VALUES ('emp-1','كريم','ب.','0550000001','role-1','ACTIVE',?,?)`).run(NOW, NOW);
  db.prepare(`INSERT INTO "external_counterparty" ("id","full_name","phone_number","created_at","updated_at") VALUES ('seller-1','مورد الإسمنت','0550000002',?,?)`).run(NOW, NOW);
  db.prepare(`INSERT INTO "project" ("id","name","status","created_at","updated_at") VALUES ('p-1','فيلا حيدرة','ACTIVE',?,?)`).run(NOW, NOW);
  db.prepare(`INSERT INTO "project" ("id","name","status","created_at","updated_at") VALUES ('p-2','مشروع ب','ACTIVE',?,?)`).run(NOW, NOW);

  // Expenses: LIVE on p-1, VOIDED on p-1, LIVE on p-2.
  const insertExpense = db.prepare(
    `INSERT INTO "expense" ("id","amount_dzd","expense_date","what_for","responsible_worker_id","seller_id","project_id","status","created_at","updated_at")
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  insertExpense.run("e-live", 10_000, "2026-05-10T00:00:00.000Z", "وقود", "emp-1", "seller-1", "p-1", "LIVE", NOW, NOW);
  insertExpense.run("e-void", 99_999, "2026-05-11T00:00:00.000Z", "ملغى", null, null, "p-1", "VOIDED", NOW, NOW);
  insertExpense.run("e-other", 5_000, "2026-05-12T00:00:00.000Z", "مشروع آخر", null, null, "p-2", "LIVE", NOW, NOW);

  // Salary payment + split: 18 of 30 days on p-1.
  db.prepare(
    `INSERT INTO "employee_salary_payment" ("id","employee_id","period_type","days","expected_amount_dzd","actual_amount_dzd","payment_date","created_at","updated_at")
     VALUES ('pay-1','emp-1','MONTHLY',30,60000,60000,'2026-05-31T00:00:00.000Z',?,?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO "employee_salary_payment_split" ("id","payment_id","project_id","days","created_at") VALUES ('split-1','pay-1','p-1',18,?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO "employee_salary_payment_split" ("id","payment_id","project_id","days","created_at") VALUES ('split-2','pay-1','p-2',12,?)`,
  ).run(NOW);

  // Inventory: consumable entry + asset unit + charge.
  db.prepare(`INSERT INTO "inventory_item_definition" ("id","name","item_type","unit","is_active","created_at","updated_at") VALUES ('def-c','إسمنت','CONSUMABLE','كيس',1,?,?)`).run(NOW, NOW);
  db.prepare(`INSERT INTO "inventory_item_definition" ("id","name","item_type","is_active","created_at","updated_at") VALUES ('def-a','خلاطة','ASSET',1,?,?)`).run(NOW, NOW);
  db.prepare(`INSERT INTO "inventory_invoice_group" ("id","supplier_name","created_at","updated_at") VALUES ('group-1','مورد',?,?)`).run(NOW, NOW);
  db.prepare(
    `INSERT INTO "inventory_entry" ("id","invoice_group_id","item_definition_id","item_type","item_name","unit","quantity","unit_price_dzd","total_price_dzd","created_at","updated_at")
     VALUES ('entry-c','group-1','def-c','CONSUMABLE','إسمنت','كيس',100,850,85000,?,?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO "inventory_entry" ("id","invoice_group_id","item_definition_id","item_type","item_name","quantity","unit_price_dzd","total_price_dzd","created_at","updated_at")
     VALUES ('entry-a','group-1','def-a','ASSET','خلاطة',1,180000,180000,?,?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO "inventory_asset_unit" ("id","inventory_entry_id","asset_name","purchase_price_dzd","current_project_id","created_at","updated_at")
     VALUES ('asset-1','entry-a','خلاطة',180000,'p-1',?,?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO "inventory_asset_charge" ("id","asset_unit_id","project_id","amount_dzd","status","created_at","updated_at")
     VALUES ('charge-live','asset-1','p-1',180000,'LIVE',?,?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO "inventory_asset_charge" ("id","asset_unit_id","project_id","amount_dzd","status","created_at","updated_at")
     VALUES ('charge-void','asset-1','p-1',99999,'VOID',?,?)`,
  ).run(NOW, NOW);

  // Movements: 40 bags transferred into p-1, 2 bought into p-2, and one
  // transfer OUT of p-1 (must not count).
  const insertMovement = db.prepare(
    `INSERT INTO "inventory_movement" ("id","movement_type","item_type","inventory_entry_id","quantity","from_warehouse_id","from_project_id","to_warehouse_id","to_project_id","occurred_at","created_at")
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  insertMovement.run("m-in", "TRANSFER", "CONSUMABLE", "entry-c", 40, null, null, null, "p-1", "2026-05-20T00:00:00.000Z", NOW);
  insertMovement.run("m-other", "PURCHASE", "CONSUMABLE", "entry-c", 2, null, null, null, "p-2", "2026-05-21T00:00:00.000Z", NOW);
  insertMovement.run("m-out", "TRANSFER", "CONSUMABLE", "entry-c", 5, null, "p-1", "wh-1", null, "2026-05-22T00:00:00.000Z", NOW);

  // 10 bags still parked at p-1.
  db.prepare(
    `INSERT INTO "inventory_consumable_balance" ("id","inventory_entry_id","item_definition_id","project_id","quantity","created_at","updated_at")
     VALUES ('bal-1','entry-c','def-c','p-1',10,?,?)`,
  ).run(NOW, NOW);

  return { db, repository: createProjectCostRepository(db) };
}

describe("SqliteProjectCostRepository (#414)", () => {
  let env: ReturnType<typeof createTestEnv>;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(() => {
    env.db.close();
  });

  it("reads only LIVE expenses for the project and resolves worker/seller names", () => {
    const rows = env.repository.listProjectExpenses("p-1");
    expect(rows.map((row) => row.id)).toEqual(["e-live"]);
    expect(rows[0]?.responsibleWorkerName).toBe("كريم ب.");
    expect(rows[0]?.sellerName).toBe("مورد الإسمنت");
    expect(rows[0]?.amountDzd).toBe(10_000);
  });

  it("normalizes blank text to null so output validation cannot fail", () => {
    env.db
      .prepare(
        `INSERT INTO "expense" ("id","amount_dzd","expense_date","what_for","seller_id","project_id","status","created_at","updated_at")
         VALUES ('e-blank', 1, '2026-05-01T00:00:00.000Z', '   ', 'seller-blank', 'p-1', 'LIVE', ?, ?)`,
      )
      .run(NOW, NOW);
    env.db
      .prepare(
        `INSERT INTO "external_counterparty" ("id","full_name","phone_number","created_at","updated_at") VALUES ('seller-blank', '   ', '0550000003', ?, ?)`,
      )
      .run(NOW, NOW);

    const row = env.repository.listProjectExpenses("p-1").find((expense) => expense.id === "e-blank");
    expect(row?.whatFor).toBeNull();
    expect(row?.sellerName).toBeNull();
  });

  it("reads the project's split lines with the payment's days and amount", () => {
    const rows = env.repository.listProjectSalarySplits("p-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      paymentId: "pay-1",
      paymentDays: 30,
      paymentAmountDzd: 60_000,
      splitDays: 18,
      employeeName: "كريم ب.",
    });
  });

  it("reads only LIVE charges and resolves the asset name", () => {
    const rows = env.repository.listProjectStockCharges("p-1");
    expect(rows.map((row) => row.id)).toEqual(["charge-live"]);
    expect(rows[0]?.assetName).toBe("خلاطة");
  });

  it("values only consumable movements INTO the project", () => {
    const rows = env.repository.listProjectConsumableIssues("p-1");
    expect(rows.map((row) => row.id)).toEqual(["m-in"]);
    expect(rows[0]).toMatchObject({ itemName: "إسمنت", unit: "كيس", quantity: 40, unitPriceDzd: 850 });
  });

  it("reads the parked assets and consumable balances at the project", () => {
    const parked = env.repository.getProjectParkedInventory("p-1");
    expect(parked.assets.map((asset) => asset.assetUnitId)).toEqual(["asset-1"]);
    expect(parked.assets[0]?.purchasePriceDzd).toBe(180_000);
    expect(parked.consumables).toHaveLength(1);
    expect(parked.consumables[0]).toMatchObject({ id: "bal-1", itemName: "إسمنت", quantity: 10, unitPriceDzd: 850 });
  });

  it("returns null for an unknown project", () => {
    expect(env.repository.getProject("missing")).toBeNull();
    expect(env.repository.getProject("p-1")).toEqual({ id: "p-1" });
  });

  it("agrees with the service end to end over the real SQL", () => {
    const result = new ProjectCostService(env.repository).getProjectCost({ projectId: "p-1" });
    expect(result.item.parts).toEqual({
      expensesDzd: 10_000,
      salariesDzd: 36_000,
      stockDzd: 180_000,
      consumablesDzd: 34_000,
    });
    expect(result.item.totalDzd).toBe(260_000);
    // Parked is 180_000 (asset) + 8_500 (10 bags) and is NOT in the total.
    expect(result.item.parkedInventory.totalDzd).toBe(188_500);
  });
});
