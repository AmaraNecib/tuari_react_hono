import { MAX_MONEY_DZD, roundMoney } from "@tuari/contracts";

import { successResult } from "../company/company.helpers";
import { ProjectCostError } from "./project-cost.errors";
import type {
  ProjectCostConsumableIssueRecord,
  ProjectCostRepository,
} from "./project-cost.types";

/**
 * ProjectCostService (issue #414) — one project's total plus the four sources
 * that make it up, and the rows behind each source.
 *
 * Rules owned here:
 *  - Expenses tagged to the project count in FULL; voided rows never do.
 *  - A salary's project share is `amount × splitDays / paymentDays`; the day
 *    rate is `amount / paymentDays` and the payment's amount is authoritative
 *    (the split is hand-typed in #412, so it, not the assignment, decides).
 *  - Stock placement charges are the LIVE charges for the project.
 *  - Consumables are valued at the movement's linked entry unit price — the
 *    same valuation the inventory module uses — and only movements INTO the
 *    project count.
 *  - `parkedInventory` (what is physically at the project now) is reported
 *    separately and is NEVER added to the total: parked stock is inventory
 *    value, not money the project spent.
 *  - Money is rounded with the shared `roundMoney`, and every computed
 *    aggregate is refused if it leaves `MAX_MONEY_DZD`, rather than emitting a
 *    number the contract cannot represent.
 */
export class ProjectCostService {
  constructor(private readonly repository: ProjectCostRepository) {}

  getProjectCost(input: { projectId: string }) {
    const project = this.repository.getProject(input.projectId);
    if (!project) {
      throw new ProjectCostError("NOT_FOUND", "تعذر العثور على المشروع المطلوب.");
    }

    const expenses = sortByDateDesc(
      this.repository.listProjectExpenses(project.id),
      (row) => row.expenseDate,
      (row) => row.id,
    );

    const salaries = sortByDateDesc(
      this.repository.listProjectSalarySplits(project.id).map((split) => {
        // A payment's `days` is a positive integer by contract; guard the
        // division anyway so a legacy/bad row can never yield Infinity/NaN.
        const paymentDays = split.paymentDays > 0 ? split.paymentDays : 1;
        return {
          paymentId: split.paymentId,
          employeeId: split.employeeId,
          employeeName: split.employeeName,
          days: split.splitDays,
          dayRateDzd: roundMoney(split.paymentAmountDzd / paymentDays),
          amountDzd: roundMoney((split.paymentAmountDzd * split.splitDays) / paymentDays),
          paymentDate: split.paymentDate,
        };
      }),
      (row) => row.paymentDate,
      (row) => row.paymentId,
    );

    const stock = sortByDateDesc(
      this.repository.listProjectStockCharges(project.id),
      (row) => row.placedAt,
      (row) => row.id,
    );

    const consumables = sortByDateDesc(
      this.repository.listProjectConsumableIssues(project.id).map(valueConsumableIssue),
      (row) => row.occurredAt,
      (row) => row.id,
    );

    const expensesDzd = sumMoney(expenses.map((row) => row.amountDzd), "expensesDzd");
    const salariesDzd = sumMoney(salaries.map((row) => row.amountDzd), "salariesDzd");
    const stockDzd = sumMoney(stock.map((row) => row.amountDzd), "stockDzd");
    const consumablesDzd = sumMoney(consumables.map((row) => row.valueDzd), "consumablesDzd");
    const totalDzd = sumMoney([expensesDzd, salariesDzd, stockDzd, consumablesDzd], "totalDzd");

    const parked = this.repository.getProjectParkedInventory(project.id);
    const parkedAssets = parked.assets.map((asset) => ({
      assetUnitId: asset.assetUnitId,
      assetName: asset.assetName,
      purchasePriceDzd: asset.purchasePriceDzd,
    }));
    const parkedConsumables = parked.consumables.map((balance) => ({
      itemDefinitionId: balance.itemDefinitionId,
      itemName: balance.itemName,
      unit: balance.unit,
      quantity: balance.quantity,
      unitPriceDzd: balance.unitPriceDzd,
      valueDzd: roundMoney((balance.unitPriceDzd ?? 0) * balance.quantity),
    }));
    const parkedTotalDzd = sumMoney(
      [
        ...parkedAssets.map((asset) => asset.purchasePriceDzd),
        ...parkedConsumables.map((balance) => balance.valueDzd),
      ],
      "parkedInventoryDzd",
    );

    return successResult("تم تحميل تكلفة المشروع بنجاح.", {
      projectId: project.id,
      totalDzd,
      parts: { expensesDzd, salariesDzd, stockDzd, consumablesDzd },
      expenses,
      salaries,
      stock,
      consumables,
      parkedInventory: {
        totalDzd: parkedTotalDzd,
        assets: parkedAssets,
        consumables: parkedConsumables,
      },
    });
  }
}

/** Value one consumable issue: quantity × the linked entry's unit price. */
function valueConsumableIssue(row: ProjectCostConsumableIssueRecord) {
  return {
    id: row.id,
    itemDefinitionId: row.itemDefinitionId,
    itemName: row.itemName,
    unit: row.unit,
    quantity: row.quantity,
    unitPriceDzd: row.unitPriceDzd,
    movementType: row.movementType,
    occurredAt: row.occurredAt,
    valueDzd: roundMoney((row.unitPriceDzd ?? 0) * row.quantity),
  };
}

/**
 * Sum money and refuse a result outside `MAX_MONEY_DZD`. Individual stored
 * rows may predate the bound (they are read permissively), but a computed
 * aggregate must stay representable; refusing beats emitting a wrong number
 * (#413 round 2).
 */
function sumMoney(values: number[], field: string): number {
  let total = 0;
  for (const value of values) {
    total = roundMoney(total + value);
    if (total > MAX_MONEY_DZD) {
      throw new ProjectCostError(
        "BUSINESS_RULE",
        `إجمالي ${field} يتجاوز الحد الأقصى المسموح به.`,
      );
    }
  }

  return total;
}

/** Deterministic newest-first ordering with an id tie-break. */
function sortByDateDesc<T>(rows: T[], date: (row: T) => string, id: (row: T) => string): T[] {
  return [...rows].sort((a, b) => {
    const byDate = date(b).localeCompare(date(a));
    return byDate !== 0 ? byDate : id(a).localeCompare(id(b));
  });
}
