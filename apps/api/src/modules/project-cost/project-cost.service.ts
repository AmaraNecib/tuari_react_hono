import { MAX_MONEY_DZD, roundMoney, type ProjectCostInput, type ProjectCostMaterialDirection } from "@tuari/contracts";

import { successResult } from "../company/company.helpers";
import { ProjectCostError } from "./project-cost.errors";
import type {
  ProjectCostMaterialMovementRecord,
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
 *    The share keeps the exact quotient and only rounds once, matching
 *    `computeProposedSalaryAmount`'s convention; the displayed day rate is a
 *    rounded derivative and is never multiplied back in.
 *  - Stock placement charges are the LIVE charges for the project.
 *  - Material charged to the project is the NET of consumable movements the
 *    project is a party to: a movement INTO the project (a direct purchase, or
 *    a warehouse → project transfer) adds `quantity × the linked entry's unit
 *    price`, a movement OUT (project → warehouse, project → another project)
 *    subtracts it. Cost follows the material, not the physical consumption
 *    event; the product has no "consumed" event and needs none. The net may be
 *    negative when more material left than entered (a real correction, or a
 *    transfer out recorded without its matching in): the figure is shown as
 *    computed and the screen warns, rather than refusing the whole screen or
 *    clamping the anomaly away.
 *  - `parkedInventory` (what is physically at the project now, ASSETS ONLY) is
 *    reported separately and is NEVER added to the total: parked stock is
 *    inventory value, not money the project spent. A consumable at a project
 *    is charged, so it is not parked.
 *  - Money is rounded with the shared `roundMoney`, and every computed
 *    aggregate is refused if it is non-finite or leaves `MAX_MONEY_DZD`,
 *    rather than emitting a number the contract cannot represent.
 */
export class ProjectCostService {
  constructor(private readonly repository: ProjectCostRepository) {}

  getProjectCost(input: ProjectCostInput) {
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
        // A payment's `days` is a positive integer by contract, but the DB has
        // no positivity CHECK (#427). A non-positive divisor must fail loudly:
        // falling back to 1 would fabricate a plausible-looking multiple of the
        // real wage rather than refusing it.
        if (!Number.isFinite(split.paymentDays) || split.paymentDays <= 0) {
          throw new ProjectCostError(
            "BUSINESS_RULE",
            "تعذر احتساب نصيب المشروع من الأجر: عدد أيام الدفع غير صالح.",
          );
        }
        return {
          paymentId: split.paymentId,
          employeeId: split.employeeId,
          employeeName: split.employeeName,
          days: split.splitDays,
          dayRateDzd: roundMoney(split.paymentAmountDzd / split.paymentDays),
          amountDzd: roundMoney((split.paymentAmountDzd * split.splitDays) / split.paymentDays),
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

    const materialMovements = sortByDateDesc(
      this.repository.listProjectMaterialMovements(project.id).map(valueMaterialMovement),
      (row) => row.occurredAt,
      (row) => row.id,
    );

    const expensesDzd = sumMoney(expenses.map((row) => row.amountDzd));
    const salariesDzd = sumMoney(salaries.map((row) => row.amountDzd));
    const stockDzd = sumMoney(stock.map((row) => row.amountDzd));
    const chargedMaterialsDzd = netMaterialCost(materialMovements);
    const totalDzd = sumMoney([expensesDzd, salariesDzd, stockDzd, chargedMaterialsDzd]);

    const parkedAssets = this.repository.getProjectParkedAssets(project.id);
    const parkedTotalDzd = sumMoney(parkedAssets.map((asset) => asset.purchasePriceDzd));

    return successResult("تم تحميل تكلفة المشروع بنجاح.", {
      projectId: project.id,
      totalDzd,
      parts: { expensesDzd, salariesDzd, stockDzd, chargedMaterialsDzd },
      expenses,
      salaries,
      stock,
      materialMovements,
      parkedInventory: {
        totalDzd: parkedTotalDzd,
        assets: parkedAssets,
      },
    });
  }
}

/**
 * Value one material movement: quantity × the linked entry's unit price, the
 * same valuation the inventory module uses. `valueDzd` is the positive
 * magnitude; `direction` carries the sign.
 */
function valueMaterialMovement(row: ProjectCostMaterialMovementRecord) {
  return {
    id: row.id,
    itemDefinitionId: row.itemDefinitionId,
    itemName: row.itemName,
    unit: row.unit,
    quantity: row.quantity,
    unitPriceDzd: row.unitPriceDzd,
    direction: row.direction,
    occurredAt: row.occurredAt,
    valueDzd: roundMoney((row.unitPriceDzd ?? 0) * row.quantity),
  };
}

/**
 * The project's material cost: sum the movements IN and subtract the movements
 * OUT. The result is shown as computed even when negative — a negative net is
 * an anomaly the operator must see, not one to hide or refuse.
 */
function netMaterialCost(rows: Array<{ direction: ProjectCostMaterialDirection; valueDzd: number }>): number {
  return sumMoney(rows.map((row) => (row.direction === "IN" ? row.valueDzd : -row.valueDzd)));
}

/**
 * Sum money and refuse a result that is non-finite or leaves `MAX_MONEY_DZD` in
 * EITHER direction. Individual stored rows may predate the bound (they are read
 * permissively), but a computed aggregate must stay representable; refusing
 * beats emitting a wrong number (#413 round 2).
 */
function sumMoney(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total = roundMoney(total + value);
    if (!Number.isFinite(total) || Math.abs(total) > MAX_MONEY_DZD) {
      throw new ProjectCostError(
        "BUSINESS_RULE",
        "إجمالي تكلفة المشروع يتجاوز الحد الأقصى المسموح به.",
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
