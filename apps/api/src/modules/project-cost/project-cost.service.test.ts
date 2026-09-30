import { describe, expect, it } from "vitest";

import { ProjectCostService } from "./project-cost.service";
import { ProjectCostError } from "./project-cost.errors";
import type { ProjectCostRepository } from "./project-cost.types";

/**
 * Service rules of the project-cost read model (issue #414):
 * each source in isolation, the combination, an empty project, the salary
 * day-rate math, the parked/cost separation (parked is NEVER cost) and the
 * aggregate bound guard.
 */

function makeRepo(overrides: Partial<ProjectCostRepository> = {}): ProjectCostRepository {
  return {
    getProject: (id) => ({ id, name: "مشروع أ" }),
    listProjectExpenses: () => [],
    listProjectSalarySplits: () => [],
    listProjectStockCharges: () => [],
    listProjectConsumableIssues: () => [],
    getProjectParkedInventory: () => ({ assets: [], consumables: [] }),
    ...overrides,
  };
}

const service = (repo: ProjectCostRepository) => new ProjectCostService(repo);

describe("ProjectCostService (#414)", () => {
  it("sums non-voided expenses tagged to the project, in full", () => {
    const result = service(
      makeRepo({
        listProjectExpenses: () => [
          {
            id: "e-1",
            expenseDate: "2026-10-02T00:00:00.000Z",
            whatFor: "وقود",
            amountDzd: 12_500,
            responsibleWorkerId: "w-1",
            responsibleWorkerName: "كريم",
            sellerId: null,
            sellerName: null,
          },
          {
            id: "e-2",
            expenseDate: "2026-10-01T00:00:00.000Z",
            whatFor: null,
            amountDzd: 7_500,
            responsibleWorkerId: null,
            responsibleWorkerName: null,
            sellerId: "s-1",
            sellerName: "مورد",
          },
        ],
      }),
    ).getProjectCost({ projectId: "p-1" });

    expect(result.success).toBe(true);
    expect(result.item.parts.expensesDzd).toBe(20_000);
    expect(result.item.totalDzd).toBe(20_000);
    expect(result.item.expenses.map((row) => row.id)).toEqual(["e-1", "e-2"]);
  });

  it("computes a salary share as allocated days × the payment's day rate", () => {
    const result = service(
      makeRepo({
        listProjectSalarySplits: () => [
          {
            paymentId: "pay-1",
            employeeId: "emp-1",
            employeeName: "كريم ب.",
            paymentDays: 30,
            paymentAmountDzd: 60_000,
            splitDays: 18,
            paymentDate: "2026-10-01T00:00:00.000Z",
          },
        ],
      }),
    ).getProjectCost({ projectId: "p-1" });

    expect(result.item.parts.salariesDzd).toBe(36_000);
    expect(result.item.salaries[0]).toMatchObject({
      days: 18,
      dayRateDzd: 2_000,
      amountDzd: 36_000,
    });
  });

  it("keeps the exact division when the day rate is not a whole dinar", () => {
    const result = service(
      makeRepo({
        listProjectSalarySplits: () => [
          {
            paymentId: "pay-1",
            employeeId: "emp-1",
            employeeName: null,
            paymentDays: 30,
            paymentAmountDzd: 50_000,
            splitDays: 15,
            paymentDate: "2026-10-01T00:00:00.000Z",
          },
        ],
      }),
    ).getProjectCost({ projectId: "p-1" });

    // 50_000 × 15 / 30 = 25_000 exactly; the displayed rounded day rate must
    // not be multiplied back in, or the part would drift to 25_000.05.
    expect(result.item.salaries[0]?.amountDzd).toBe(25_000);
    expect(result.item.parts.salariesDzd).toBe(25_000);
  });

  it("sums live stock charges for the project at their stored amount", () => {
    const result = service(
      makeRepo({
        listProjectStockCharges: () => [
          {
            id: "c-1",
            assetUnitId: "a-1",
            assetName: "خلاطة",
            amountDzd: 180_000,
            placedAt: "2026-09-20T00:00:00.000Z",
          },
          {
            id: "c-2",
            assetUnitId: "a-2",
            assetName: "مولدة",
            amountDzd: 95_000,
            placedAt: "2026-09-18T00:00:00.000Z",
          },
        ],
      }),
    ).getProjectCost({ projectId: "p-1" });

    expect(result.item.parts.stockDzd).toBe(275_000);
    expect(result.item.stock.map((row) => row.assetName)).toEqual(["خلاطة", "مولدة"]);
  });

  it("values consumables issued to the project at the entry unit price", () => {
    const result = service(
      makeRepo({
        listProjectConsumableIssues: () => [
          {
            id: "m-1",
            itemDefinitionId: "def-1",
            itemName: "إسمنت",
            unit: "كيس",
            quantity: 40,
            unitPriceDzd: 850,
            movementType: "TRANSFER",
            occurredAt: "2026-09-25T00:00:00.000Z",
          },
          {
            id: "m-2",
            itemDefinitionId: "def-2",
            itemName: "حديد",
            unit: "طن",
            quantity: 2,
            unitPriceDzd: null,
            movementType: "PURCHASE",
            occurredAt: "2026-09-22T00:00:00.000Z",
          },
        ],
      }),
    ).getProjectCost({ projectId: "p-1" });

    expect(result.item.parts.consumablesDzd).toBe(34_000);
    expect(result.item.consumables).toHaveLength(2);
    // A movement with no entry link is honest value 0, never an estimate.
    expect(result.item.consumables[1]?.valueDzd).toBe(0);
  });

  it("adds the four parts into one total and keeps them separate", () => {
    const result = service(
      makeRepo({
        listProjectExpenses: () => [
          { id: "e-1", expenseDate: "2026-10-01T00:00:00.000Z", whatFor: null, amountDzd: 10_000, responsibleWorkerId: null, responsibleWorkerName: null, sellerId: null, sellerName: null },
        ],
        listProjectSalarySplits: () => [
          { paymentId: "pay-1", employeeId: "emp-1", employeeName: null, paymentDays: 30, paymentAmountDzd: 60_000, splitDays: 15, paymentDate: "2026-10-01T00:00:00.000Z" },
        ],
        listProjectStockCharges: () => [
          { id: "c-1", assetUnitId: "a-1", assetName: null, amountDzd: 5_000, placedAt: "2026-09-30T00:00:00.000Z" },
        ],
        listProjectConsumableIssues: () => [
          { id: "m-1", itemDefinitionId: null, itemName: null, unit: null, quantity: 4, unitPriceDzd: 250, movementType: "TRANSFER", occurredAt: "2026-09-29T00:00:00.000Z" },
        ],
      }),
    ).getProjectCost({ projectId: "p-1" });

    expect(result.item.parts).toEqual({ expensesDzd: 10_000, salariesDzd: 30_000, stockDzd: 5_000, consumablesDzd: 1_000 });
    expect(result.item.totalDzd).toBe(46_000);
  });

  it("returns an honest zero total for a project with no activity", () => {
    const result = service(makeRepo()).getProjectCost({ projectId: "p-empty" });

    expect(result.item.totalDzd).toBe(0);
    expect(result.item.parts).toEqual({ expensesDzd: 0, salariesDzd: 0, stockDzd: 0, consumablesDzd: 0 });
    expect(result.item.expenses).toEqual([]);
    expect(result.item.salaries).toEqual([]);
    expect(result.item.stock).toEqual([]);
    expect(result.item.consumables).toEqual([]);
    expect(result.item.parkedInventory.totalDzd).toBe(0);
  });

  it("reports parked inventory separately and never adds it to the total", () => {
    const result = service(
      makeRepo({
        listProjectStockCharges: () => [
          { id: "c-1", assetUnitId: "a-1", assetName: "خلاطة", amountDzd: 180_000, placedAt: "2026-09-20T00:00:00.000Z" },
        ],
        getProjectParkedInventory: () => ({
          assets: [{ assetUnitId: "a-9", assetName: "رافعة", purchasePriceDzd: 500_000 }],
          consumables: [
            { itemDefinitionId: "def-1", itemName: "إسمنت", unit: "كيس", quantity: 10, unitPriceDzd: 850 },
          ],
        }),
      }),
    ).getProjectCost({ projectId: "p-1" });

    expect(result.item.totalDzd).toBe(180_000);
    expect(result.item.parkedInventory.totalDzd).toBe(508_500);
    expect(result.item.parkedInventory.assets).toHaveLength(1);
    expect(result.item.parkedInventory.consumables[0]?.valueDzd).toBe(8_500);
  });

  it("rejects an unknown project", () => {
    expect(() => service(makeRepo({ getProject: () => null })).getProjectCost({ projectId: "missing" }))
      .toThrowError(ProjectCostError);
  });

  it("refuses an aggregate above MAX_MONEY_DZD instead of emitting it", () => {
    const nearBound = Number.MAX_SAFE_INTEGER - 1;
    expect(() =>
      service(
        makeRepo({
          listProjectStockCharges: () => [
            { id: "c-1", assetUnitId: "a-1", assetName: null, amountDzd: nearBound, placedAt: "2026-09-20T00:00:00.000Z" },
            { id: "c-2", assetUnitId: "a-2", assetName: null, amountDzd: 10, placedAt: "2026-09-19T00:00:00.000Z" },
          ],
        }),
      ).getProjectCost({ projectId: "p-1" }),
    ).toThrowError(ProjectCostError);
  });
});
