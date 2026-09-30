import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type {
  ProjectCostConsumableIssueRecord,
  ProjectCostExpenseRecord,
  ProjectCostParkedAssetRecord,
  ProjectCostParkedConsumableRecord,
  ProjectCostProjectRecord,
  ProjectCostRepository,
  ProjectCostSalarySplitRecord,
  ProjectCostStockChargeRecord,
} from "../project-cost.types";

/**
 * SQLite project-cost repository (issue #414).
 *
 * Read-only: the cost screen explains money other modules already wrote, so
 * there is no write path and no connection-lock transaction here. Each source
 * is read with the SAME predicate the owning module uses (non-voided expenses,
 * LIVE charges, split rows, consumable movements into the project), so the
 * total cannot disagree with the module that wrote the rows.
 *
 * Names are resolved with LEFT JOINs rather than per-row lookups, so one
 * project cost is a fixed number of queries, not one per expense/tool/day.
 */
export class SqliteProjectCostRepository implements ProjectCostRepository {
  constructor(private readonly db: BetterSqliteDatabase) {}

  /** getProject. */
  getProject(projectId: string): ProjectCostProjectRecord | null {
    const row = this.db
      .prepare(`SELECT id, name FROM "project" WHERE id = ?`)
      .get(projectId) as { id: string; name: string } | undefined;
    return row ? { id: String(row.id), name: String(row.name) } : null;
  }

  /** listProjectExpenses. */
  listProjectExpenses(projectId: string): ProjectCostExpenseRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
           e.id AS id,
           e.expense_date AS expense_date,
           e.what_for AS what_for,
           e.amount_dzd AS amount_dzd,
           e.responsible_worker_id AS responsible_worker_id,
           TRIM(COALESCE(emp.first_name, '') || ' ' || COALESCE(emp.last_name, '')) AS responsible_worker_name,
           e.seller_id AS seller_id,
           cp.full_name AS seller_name
         FROM "expense" e
         LEFT JOIN "employee" emp ON emp.id = e.responsible_worker_id
         LEFT JOIN "external_counterparty" cp ON cp.id = e.seller_id
         WHERE e.project_id = ? AND e.status = 'LIVE'
         ORDER BY e.expense_date DESC, e.id ASC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      expenseDate: String(row.expense_date),
      whatFor: nullableString(row.what_for),
      amountDzd: Number(row.amount_dzd ?? 0),
      responsibleWorkerId: nullableString(row.responsible_worker_id),
      responsibleWorkerName: emptyToNull(nullableString(row.responsible_worker_name)),
      sellerId: nullableString(row.seller_id),
      sellerName: nullableString(row.seller_name),
    }));
  }

  /** listProjectSalarySplits. */
  listProjectSalarySplits(projectId: string): ProjectCostSalarySplitRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
           p.id AS payment_id,
           p.employee_id AS employee_id,
           TRIM(COALESCE(emp.first_name, '') || ' ' || COALESCE(emp.last_name, '')) AS employee_name,
           p.days AS payment_days,
           p.actual_amount_dzd AS payment_amount_dzd,
           s.days AS split_days,
           p.payment_date AS payment_date
         FROM "employee_salary_payment_split" s
         JOIN "employee_salary_payment" p ON p.id = s.payment_id
         LEFT JOIN "employee" emp ON emp.id = p.employee_id
         WHERE s.project_id = ?
         ORDER BY p.payment_date DESC, p.id ASC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      paymentId: String(row.payment_id),
      employeeId: String(row.employee_id),
      employeeName: emptyToNull(nullableString(row.employee_name)),
      paymentDays: Number(row.payment_days ?? 0),
      paymentAmountDzd: Number(row.payment_amount_dzd ?? 0),
      splitDays: Number(row.split_days ?? 0),
      paymentDate: String(row.payment_date),
    }));
  }

  /** listProjectStockCharges. */
  listProjectStockCharges(projectId: string): ProjectCostStockChargeRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
           c.id AS id,
           c.asset_unit_id AS asset_unit_id,
           u.asset_name AS asset_name,
           c.amount_dzd AS amount_dzd,
           c.created_at AS created_at
         FROM "inventory_asset_charge" c
         LEFT JOIN "inventory_asset_unit" u ON u.id = c.asset_unit_id
         WHERE c.project_id = ? AND c.status = 'LIVE'
         ORDER BY c.created_at DESC, c.id ASC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      assetUnitId: String(row.asset_unit_id),
      assetName: nullableString(row.asset_name),
      amountDzd: Number(row.amount_dzd ?? 0),
      placedAt: String(row.created_at),
    }));
  }

  /** listProjectConsumableIssues. */
  listProjectConsumableIssues(projectId: string): ProjectCostConsumableIssueRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
           m.id AS id,
           e.item_definition_id AS item_definition_id,
           e.item_name AS item_name,
           e.unit AS unit,
           m.quantity AS quantity,
           e.unit_price_dzd AS unit_price_dzd,
           m.movement_type AS movement_type,
           m.occurred_at AS occurred_at
         FROM "inventory_movement" m
         LEFT JOIN "inventory_entry" e ON e.id = m.inventory_entry_id
         WHERE m.to_project_id = ? AND m.item_type = 'CONSUMABLE'
         ORDER BY m.occurred_at DESC, m.id ASC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      itemDefinitionId: nullableString(row.item_definition_id),
      itemName: nullableString(row.item_name),
      unit: nullableString(row.unit),
      quantity: Number(row.quantity ?? 0),
      unitPriceDzd: row.unit_price_dzd != null ? Number(row.unit_price_dzd) : null,
      movementType: String(row.movement_type) as ProjectCostConsumableIssueRecord["movementType"],
      occurredAt: String(row.occurred_at),
    }));
  }

  /** getProjectParkedInventory. */
  getProjectParkedInventory(projectId: string): {
    assets: ProjectCostParkedAssetRecord[];
    consumables: ProjectCostParkedConsumableRecord[];
  } {
    const assetRows = this.db
      .prepare(
        `SELECT u.id AS asset_unit_id, u.asset_name AS asset_name, u.purchase_price_dzd AS purchase_price_dzd
         FROM "inventory_asset_unit" u
         WHERE u.current_project_id = ?
         ORDER BY u.asset_name ASC, u.id ASC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    const consumableRows = this.db
      .prepare(
        `SELECT
           b.item_definition_id AS item_definition_id,
           e.item_name AS item_name,
           e.unit AS unit,
           b.quantity AS quantity,
           e.unit_price_dzd AS unit_price_dzd
         FROM "inventory_consumable_balance" b
         LEFT JOIN "inventory_entry" e ON e.id = b.inventory_entry_id
         WHERE b.project_id = ?
         ORDER BY e.item_name ASC, b.id ASC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return {
      assets: assetRows.map((row) => ({
        assetUnitId: String(row.asset_unit_id),
        assetName: nullableString(row.asset_name),
        purchasePriceDzd: Number(row.purchase_price_dzd ?? 0),
      })),
      consumables: consumableRows.map((row) => ({
        itemDefinitionId: nullableString(row.item_definition_id),
        itemName: nullableString(row.item_name),
        unit: nullableString(row.unit),
        quantity: Number(row.quantity ?? 0),
        unitPriceDzd: row.unit_price_dzd != null ? Number(row.unit_price_dzd) : null,
      })),
    };
  }
}

function nullableString(value: unknown): string | null {
  return value != null ? String(value) : null;
}

/** A `TRIM(...)` name join yields "" when neither name column is set. */
function emptyToNull(value: string | null): string | null {
  return value != null && value.length > 0 ? value : null;
}

/** Create a SQLite-backed project-cost repository. */
export function createProjectCostRepository(db: BetterSqliteDatabase): ProjectCostRepository {
  return new SqliteProjectCostRepository(db);
}
