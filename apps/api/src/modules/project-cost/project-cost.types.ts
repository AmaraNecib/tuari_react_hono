/**
 * Project cost (issue #414) — the raw rows the project-cost service aggregates.
 *
 * These records are storage-shaped (plain values, names already resolved where
 * cheap), so the service can be tested without a database and the sqlite
 * adapter owns the joins. Every money field is whatever the source stored; the
 * service rounds only the computed parts/total.
 */

export type ProjectCostProjectRecord = {
  id: string;
};

/** A non-voided expense tagged to the project (counted in full). */
export type ProjectCostExpenseRecord = {
  id: string;
  expenseDate: string;
  whatFor: string | null;
  amountDzd: number;
  responsibleWorkerId: string | null;
  responsibleWorkerName: string | null;
  sellerId: string | null;
  sellerName: string | null;
};

/**
 * One hand-typed per-project split line of a salary payment. `paymentDays` and
 * `paymentAmountDzd` are the payment's authoritative days/amount; the service
 * derives the share and the day rate so the two rules live in one place.
 */
export type ProjectCostSalarySplitRecord = {
  paymentId: string;
  employeeId: string;
  employeeName: string | null;
  paymentDays: number;
  paymentAmountDzd: number;
  splitDays: number;
  paymentDate: string;
};

/** A LIVE stock-placement charge for the project. */
export type ProjectCostStockChargeRecord = {
  id: string;
  assetUnitId: string;
  assetName: string | null;
  amountDzd: number;
  placedAt: string;
};

/**
 * A consumable movement whose destination is the project. `unitPriceDzd` is the
 * linked entry's unit price (null when the movement has no entry link), so the
 * service can value it exactly like the inventory module's movement report.
 */
export type ProjectCostConsumableIssueRecord = {
  id: string;
  itemDefinitionId: string | null;
  itemName: string | null;
  unit: string | null;
  quantity: number;
  unitPriceDzd: number | null;
  occurredAt: string;
};

/** An asset unit physically at the project right now (inventory value). */
export type ProjectCostParkedAssetRecord = {
  assetUnitId: string;
  assetName: string | null;
  purchasePriceDzd: number;
};

/** A consumable balance physically at the project right now (inventory value). */
export type ProjectCostParkedConsumableRecord = {
  id: string;
  itemDefinitionId: string | null;
  itemName: string | null;
  unit: string | null;
  quantity: number;
  unitPriceDzd: number | null;
};

/**
 * ProjectCostRepository — the storage port for the project-cost read model.
 *
 * Read-only by design: the screen explains money that other modules already
 * wrote; it never mutates a source. Every method takes a project id and returns
 * only that project's rows.
 */
export interface ProjectCostRepository {
  /** getProject — the project's identity, or null when it does not exist. */
  getProject(projectId: string): ProjectCostProjectRecord | null;

  /** listProjectExpenses — non-voided expenses tagged to the project. */
  listProjectExpenses(projectId: string): ProjectCostExpenseRecord[];

  /** listProjectSalarySplits — the project's split lines with their payment. */
  listProjectSalarySplits(projectId: string): ProjectCostSalarySplitRecord[];

  /** listProjectStockCharges — the project's LIVE placement charges. */
  listProjectStockCharges(projectId: string): ProjectCostStockChargeRecord[];

  /** listProjectConsumableIssues — consumable movements INTO the project. */
  listProjectConsumableIssues(projectId: string): ProjectCostConsumableIssueRecord[];

  /** getProjectParkedInventory — what is physically at the project right now. */
  getProjectParkedInventory(projectId: string): {
    assets: ProjectCostParkedAssetRecord[];
    consumables: ProjectCostParkedConsumableRecord[];
  };
}
