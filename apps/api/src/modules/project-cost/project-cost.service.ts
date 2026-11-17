import {
  Money,
  Quantity,
  UnitPrice,
  finalizeLines,
  priceLine,
  sumMoneyReports,
  type ProjectCostInput,
  type ProjectCostMaterialDirection,
} from "@tuari/contracts";

import { successResult } from "../company/company.helpers";
import { ProjectCostError } from "./project-cost.errors";
import type { ProjectCostMaterialMovementRecord, ProjectCostRepository } from "./project-cost.types";

export class ProjectCostService {
  constructor(private readonly repository: ProjectCostRepository) {}

  getProjectCost(input: ProjectCostInput) {
    const project = this.repository.getProject(input.projectId);
    if (!project) throw new ProjectCostError("NOT_FOUND", "تعذر العثور على المشروع المطلوب.");

    const expenses = sortByDateDesc(
      this.repository.listProjectExpenses(project.id),
      row => row.expenseDate,
      row => row.id,
    );
    const salaries = [...this.repository.listProjectSalarySplits(project.id)].sort((a, b) => {
      const byApproval = b.approvedAt.localeCompare(a.approvedAt);
      if (byApproval !== 0) return byApproval;
      const byEarning = b.earningId.localeCompare(a.earningId);
      return byEarning !== 0 ? byEarning : a.ordinal - b.ordinal;
    });
    const stock = sortByDateDesc(
      this.repository.listProjectStockCharges(project.id),
      row => row.placedAt,
      row => row.id,
    );
    const materialMovements = sortByDateDesc(
      this.repository.listProjectMaterialMovements(project.id).map(valueMaterialMovement),
      row => row.occurredAt,
      row => row.id,
    );

    const expensesAmount = sumAmounts(expenses.map(row => row.amount));
    const salariesAmount = sumAmounts(salaries.map(row => row.amount));
    const stockAmount = sumAmounts(stock.map(row => row.amount));
    const chargedMaterialsAmount = netMaterialCost(materialMovements);
    const totalAmount = sumMoneyReports([
      expensesAmount,
      salariesAmount,
      stockAmount,
      chargedMaterialsAmount,
    ]);

    const assets = this.repository.getProjectParkedAssets(project.id);
    const parkedAmount = sumAmounts(assets.map(asset => asset.purchaseAmount));

    return successResult("تم تحميل تكلفة المشروع بنجاح.", {
      projectId: project.id,
      currencyCode: "DZD" as const,
      totalAmount,
      parts: { expensesAmount, salariesAmount, stockAmount, chargedMaterialsAmount },
      expenses,
      salaries,
      stock,
      materialMovements,
      parkedInventory: { totalAmount: parkedAmount, assets },
    });
  }
}

function valueMaterialMovement(row: ProjectCostMaterialMovementRecord) {
  const valueAmount = row.unitPrice === null
    ? "0.00"
    : finalizeLines([priceLine(UnitPrice.parse(row.unitPrice), Quantity.inventory(row.quantity))]).toWire();
  return { ...row, valueAmount };
}

function netMaterialCost(rows: Array<{ direction: ProjectCostMaterialDirection; valueAmount: string }>): string {
  return sumMoneyReports(rows.map(row => row.direction === "IN" ? row.valueAmount : negate(row.valueAmount)));
}

function sumAmounts(values: string[]): string {
  return sumMoneyReports(values);
}

function negate(value: string): string {
  return Money.parse(value).negate().toWire();
}

function sortByDateDesc<T>(rows: T[], date: (row: T) => string, id: (row: T) => string): T[] {
  return [...rows].sort((a, b) => {
    const byDate = date(b).localeCompare(date(a));
    return byDate !== 0 ? byDate : id(a).localeCompare(id(b));
  });
}
