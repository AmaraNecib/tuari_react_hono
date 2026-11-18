import { describe, expect, it } from "vitest";

import type { ProjectCostInput } from "@tuari/contracts";
import { ProjectCostService } from "./project-cost.service";
import type { ProjectCostRepository } from "./project-cost.types";

const NOW = "2026-06-01T00:00:00.000Z";

function createRepository(overrides: Partial<ProjectCostRepository> = {}): ProjectCostRepository {
  return {
    getProject: id => ({ id }),
    listProjectExpenses: () => [],
    listProjectSalarySplits: () => [],
    listProjectStockCharges: () => [],
    listProjectMaterialMovements: () => [],
    getProjectParkedAssets: () => [],
    ...overrides,
  };
}

function read(repository: ProjectCostRepository) {
  return new ProjectCostService(repository).getProjectCost({ projectId: "project-a" } satisfies ProjectCostInput).item;
}

describe("ProjectCostService exact read model", () => {
  it("adds exact stored amounts without converting through Number", () => {
    const result = read(createRepository({
      listProjectExpenses: () => [{
        id: "expense-1", expenseDate: NOW, whatFor: null, amount: "12500.00",
        responsibleWorkerId: null, responsibleWorkerName: null, sellerId: null, sellerName: null,
      }],
      listProjectSalarySplits: () => [
        { earningId: "earn-1", segmentId: "seg-a1", employeeId: "employee-1", employeeName: "Worker", ordinal: 0, days: 5, amount: "10000.00", periodStart: NOW, periodEnd: NOW, approvedAt: NOW },
        { earningId: "earn-1", segmentId: "seg-b", employeeId: "employee-1", employeeName: "Worker", ordinal: 1, days: 15, amount: "37500.00", periodStart: NOW, periodEnd: NOW, approvedAt: NOW },
        { earningId: "earn-1", segmentId: "seg-a2", employeeId: "employee-1", employeeName: "Worker", ordinal: 2, days: 5, amount: "15000.00", periodStart: NOW, periodEnd: NOW, approvedAt: NOW },
      ],
      listProjectStockCharges: () => [{ id: "stock-1", assetUnitId: "asset-1", assetName: "Tool", amount: "500.00", placedAt: NOW }],
      listProjectMaterialMovements: () => [{
        id: "move-in", itemDefinitionId: "item-1", itemName: "Cement", unit: "bag", quantity: "2", unitPrice: "850.0000", direction: "IN", occurredAt: NOW,
      }],
    }));

    expect(result.currencyCode).toBe("DZD");
    expect(result.salaries.map(row => [row.segmentId, row.amount])).toEqual([
      ["seg-a1", "10000.00"], ["seg-b", "37500.00"], ["seg-a2", "15000.00"],
    ]);
    expect(result.parts).toEqual({
      expensesAmount: "12500.00",
      salariesAmount: "62500.00",
      stockAmount: "500.00",
      chargedMaterialsAmount: "1700.00",
    });
    expect(result.totalAmount).toBe("77200.00");
  });

  it("sums signed material movements exactly", () => {
    const result = read(createRepository({
      listProjectMaterialMovements: () => [
        { id: "in", itemDefinitionId: null, itemName: null, unit: null, quantity: "3", unitPrice: "0.1000", direction: "IN", occurredAt: NOW },
        { id: "out", itemDefinitionId: null, itemName: null, unit: null, quantity: "1", unitPrice: "0.1000", direction: "OUT", occurredAt: NOW },
      ],
    }));

    expect(result.parts.chargedMaterialsAmount).toBe("0.20");
    expect(result.totalAmount).toBe("0.20");
    expect(result.materialMovements.map(row => row.valueAmount)).toEqual(["0.30", "0.10"]);
  });

  it("keeps aggregate precision above JavaScript's safe integer range", () => {
    const result = read(createRepository({
      listProjectExpenses: () => ["90071992547409.93", "90071992547409.93"].map((amount, index) => ({
        id: `expense-${index}`, expenseDate: NOW, whatFor: null, amount,
        responsibleWorkerId: null, responsibleWorkerName: null, sellerId: null, sellerName: null,
      })),
    }));

    expect(result.parts.expensesAmount).toBe("180143985094819.86");
    expect(result.totalAmount).toBe("180143985094819.86");
  });

  it("orders rows deterministically and preserves approval segment order", () => {
    const result = read(createRepository({
      listProjectExpenses: () => [
        { id: "expense-b", expenseDate: "2026-05-10T00:00:00.000Z", whatFor: null, amount: "2.00", responsibleWorkerId: null, responsibleWorkerName: null, sellerId: null, sellerName: null },
        { id: "expense-a", expenseDate: "2026-05-10T00:00:00.000Z", whatFor: null, amount: "1.00", responsibleWorkerId: null, responsibleWorkerName: null, sellerId: null, sellerName: null },
      ],
      listProjectSalarySplits: () => [
        { earningId: "earning-old", segmentId: "old", employeeId: "employee", employeeName: null, ordinal: 0, days: 1, amount: "1.00", periodStart: NOW, periodEnd: NOW, approvedAt: "2026-05-01T00:00:00.000Z" },
        { earningId: "earning-new", segmentId: "new-2", employeeId: "employee", employeeName: null, ordinal: 1, days: 2, amount: "2.00", periodStart: NOW, periodEnd: NOW, approvedAt: "2026-05-02T00:00:00.000Z" },
        { earningId: "earning-new", segmentId: "new-1", employeeId: "employee", employeeName: null, ordinal: 0, days: 3, amount: "3.00", periodStart: NOW, periodEnd: NOW, approvedAt: "2026-05-02T00:00:00.000Z" },
        { earningId: "earning-middle", segmentId: "middle", employeeId: "employee", employeeName: null, ordinal: 0, days: 4, amount: "4.00", periodStart: NOW, periodEnd: NOW, approvedAt: "2026-05-02T00:00:00.000Z" },
      ],
      listProjectStockCharges: () => [
        { id: "stock-old", assetUnitId: "asset-old", assetName: null, amount: "1.00", placedAt: "2026-05-01T00:00:00.000Z" },
        { id: "stock-new", assetUnitId: "asset-new", assetName: null, amount: "2.00", placedAt: "2026-05-02T00:00:00.000Z" },
      ],
      listProjectMaterialMovements: () => [
        { id: "move-old", itemDefinitionId: null, itemName: null, unit: null, quantity: "1", unitPrice: "1.0000", direction: "IN", occurredAt: "2026-05-01T00:00:00.000Z" },
        { id: "move-new", itemDefinitionId: null, itemName: null, unit: null, quantity: "2", unitPrice: "1.0000", direction: "IN", occurredAt: "2026-05-02T00:00:00.000Z" },
      ],
    }));

    expect(result.expenses.map(row => row.id)).toEqual(["expense-a", "expense-b"]);
    expect(result.salaries.map(row => row.segmentId)).toEqual(["new-1", "new-2", "middle", "old"]);
    expect(result.stock.map(row => row.id)).toEqual(["stock-new", "stock-old"]);
    expect(result.materialMovements.map(row => row.id)).toEqual(["move-new", "move-old"]);
  });

  it("reports parked assets separately from charged project cost", () => {
    const result = read(createRepository({
      getProjectParkedAssets: () => [
        { assetUnitId: "asset-1", assetName: "Mixer", purchaseAmount: "180000.00" },
      ],
    }));

    expect(result.totalAmount).toBe("0.00");
    expect(result.parkedInventory.totalAmount).toBe("180000.00");
    expect(result.parkedInventory.assets).toHaveLength(1);
  });

  it("returns exact zero totals for an empty project", () => {
    const result = read(createRepository());
    expect(result.parts).toEqual({
      expensesAmount: "0.00", salariesAmount: "0.00", stockAmount: "0.00", chargedMaterialsAmount: "0.00",
    });
    expect(result.totalAmount).toBe("0.00");
    expect(result.parkedInventory.totalAmount).toBe("0.00");
  });

  it("rejects a missing project", () => {
    const service = new ProjectCostService(createRepository({ getProject: () => null }));
    expect(() => service.getProjectCost({ projectId: "missing" })).toThrow("تعذر العثور على المشروع المطلوب.");
  });
});
