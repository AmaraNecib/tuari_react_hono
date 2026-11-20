import {
  ExactLine,
  Money,
  Quantity,
  UnitPrice,
  finalizeLines,
  parseExactLine,
  sumExactLineHistory,
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
    return this.repository.withReadConsistency
      ? this.repository.withReadConsistency(() => this.getProjectCostFromSnapshot(input))
      : this.getProjectCostFromSnapshot(input);
  }

  private getProjectCostFromSnapshot(input: ProjectCostInput) {
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
    const valuedMaterialMovements = sortByDateDesc(
      this.repository.listProjectMaterialMovements(project.id).map(valueMaterialMovement),
      row => row.occurredAt,
      row => row.id,
    );
    const materialMovements = valuedMaterialMovements.map(({ exactLine, priceSource, ...row }) => {
      void exactLine;
      void priceSource;
      return row;
    });

    const expensesAmount = sumAmounts(expenses.map(row => row.amount));
    const salariesAmount = sumAmounts(salaries.map(row => row.amount));
    const stockAmount = sumAmounts(stock.map(row => row.amount));
    const chargedMaterialsAmount = netMaterialCost(valuedMaterialMovements);
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
  const source = row.priceSource === undefined
    ? row.unitPrice === null ? null : ExactLine.fromPrice(UnitPrice.parse(row.unitPrice), Quantity.inventory(row.quantity))
    : parseExactLine(row.priceSource);
  const valueAmount = source === null
    ? "0.00"
    : finalizeLines([lineForMovement(source, row.quantity)]).toWire();
  return { ...row, unitPrice: source?.source.mode === "unit-price" ? source.source.price : null, valueAmount, exactLine: source };
}

function lineForMovement(source: ExactLine, quantity: string): ExactLine {
  const movementQuantity = Quantity.inventory(quantity);
  if (source.source.mode === "unit-price") return ExactLine.fromPrice(UnitPrice.parse(source.source.price), movementQuantity);
  if (source.source.mode === "agreed-total") return ExactLine.fromDerived(Money.parse(source.source.total), Quantity.inventory(source.source.quantity), movementQuantity);
  return ExactLine.fromDerived(Money.parse(source.source.total), Quantity.inventory(source.source.originalQuantity), movementQuantity);
}

function netMaterialCost(rows: Array<{ direction: ProjectCostMaterialDirection; quantity: string; valueAmount: string; exactLine?: ExactLine | null }>): string {
  if (rows.some(row => row.exactLine !== undefined)) {
    return sumExactLineHistory(rows.flatMap(row => {
      if (!row.exactLine) return [];
      return [lineForMovement(row.exactLine, row.direction === "OUT" ? `-${row.quantity}` : row.quantity)];
    }));
  }
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
