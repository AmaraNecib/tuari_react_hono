import type { ProjectCostMaterialDirection } from "@tuari/contracts";

export type ProjectCostProjectRecord = { id: string };

export type ProjectCostExpenseRecord = {
  id: string;
  expenseDate: string;
  whatFor: string | null;
  amount: string;
  responsibleWorkerId: string | null;
  responsibleWorkerName: string | null;
  sellerId: string | null;
  sellerName: string | null;
};

export type ProjectCostSalarySplitRecord = {
  earningId: string;
  segmentId: string;
  employeeId: string;
  employeeName: string | null;
  ordinal: number;
  days: number;
  amount: string;
  periodStart: string;
  periodEnd: string;
  approvedAt: string;
};

export type ProjectCostStockChargeRecord = {
  id: string;
  assetUnitId: string;
  assetName: string | null;
  amount: string;
  placedAt: string;
};

export type ProjectCostMaterialMovementRecord = {
  id: string;
  itemDefinitionId: string | null;
  itemName: string | null;
  unit: string | null;
  quantity: string;
  unitPrice: string | null;
  direction: ProjectCostMaterialDirection;
  occurredAt: string;
};

export type ProjectCostParkedAssetRecord = {
  assetUnitId: string;
  assetName: string | null;
  purchaseAmount: string;
};

export interface ProjectCostRepository {
  getProject(projectId: string): ProjectCostProjectRecord | null;
  listProjectExpenses(projectId: string): ProjectCostExpenseRecord[];
  listProjectSalarySplits(projectId: string): ProjectCostSalarySplitRecord[];
  listProjectStockCharges(projectId: string): ProjectCostStockChargeRecord[];
  listProjectMaterialMovements(projectId: string): ProjectCostMaterialMovementRecord[];
  getProjectParkedAssets(projectId: string): ProjectCostParkedAssetRecord[];
}
