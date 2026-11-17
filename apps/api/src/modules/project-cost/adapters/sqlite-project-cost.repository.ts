import { asc, eq, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { Money, Quantity, UnitPrice } from "@tuari/contracts";

import * as schema from "../../../schema";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type {
  ProjectCostExpenseRecord,
  ProjectCostMaterialMovementRecord,
  ProjectCostParkedAssetRecord,
  ProjectCostProjectRecord,
  ProjectCostRepository,
  ProjectCostSalarySplitRecord,
  ProjectCostStockChargeRecord,
} from "../project-cost.types";

/** Read-only cost adapter. Approved earnings, not cash payments, own labor cost. */
export class SqliteProjectCostRepository implements ProjectCostRepository {
  private readonly orm: BetterSQLite3Database<typeof schema>;

  constructor(private readonly db: BetterSqliteDatabase) {
    this.orm = drizzle(db, { schema });
  }

  getProject(projectId: string): ProjectCostProjectRecord | null {
    const row = this.db.prepare('SELECT id FROM "project" WHERE id = ?').get(projectId) as { id: string } | undefined;
    return row ? { id: String(row.id) } : null;
  }

  listProjectExpenses(projectId: string): ProjectCostExpenseRecord[] {
    const rows = this.db.prepare(`SELECT
      e.id AS id,
      e.expense_date AS expense_date,
      e.what_for AS what_for,
      CAST(e.amount_dzd AS TEXT) AS amount,
      e.responsible_worker_id AS responsible_worker_id,
      TRIM(COALESCE(emp.first_name, '') || ' ' || COALESCE(emp.last_name, '')) AS responsible_worker_name,
      e.seller_id AS seller_id,
      cp.full_name AS seller_name
      FROM "expense" e
      LEFT JOIN "employee" emp ON emp.id = e.responsible_worker_id
      LEFT JOIN "external_counterparty" cp ON cp.id = e.seller_id
      WHERE e.project_id = ? AND e.status = 'LIVE'`).all(projectId) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: String(row.id),
      expenseDate: String(row.expense_date),
      whatFor: emptyToNull(row.what_for),
      amount: Money.parse(String(row.amount ?? "0")).toWire(),
      responsibleWorkerId: emptyToNull(row.responsible_worker_id),
      responsibleWorkerName: emptyToNull(row.responsible_worker_name),
      sellerId: emptyToNull(row.seller_id),
      sellerName: emptyToNull(row.seller_name),
    }));
  }

  listProjectSalarySplits(projectId: string): ProjectCostSalarySplitRecord[] {
    const rows = this.orm.select({
      earningId: schema.employeeEarning.id,
      segmentId: schema.employeeEarningSegment.id,
      employeeId: schema.employeeEarning.employeeId,
      employeeName: sql<string>`TRIM(COALESCE(${schema.employee.firstName}, '') || ' ' || COALESCE(${schema.employee.lastName}, ''))`,
      ordinal: schema.employeeEarningSegment.ordinal,
      amountMinor: sql<string>`CAST(${schema.employeeEarningSegment.amountMinor} AS TEXT)`,
      periodStart: schema.employeeEarning.periodStart,
      periodEnd: schema.employeeEarning.periodEnd,
      approvedAt: schema.employeeEarning.approvedAt,
    }).from(schema.employeeEarningSegment)
      .innerJoin(schema.employeeEarning, eq(schema.employeeEarningSegment.earningId, schema.employeeEarning.id))
      .innerJoin(schema.employee, eq(schema.employeeEarning.employeeId, schema.employee.id))
      .where(eq(schema.employeeEarningSegment.projectId, projectId))
      .orderBy(asc(schema.employeeEarning.approvedAt), asc(schema.employeeEarning.id), asc(schema.employeeEarningSegment.ordinal))
      .all();

    return rows.map(row => ({
      earningId: row.earningId,
      segmentId: row.segmentId,
      employeeId: row.employeeId,
      employeeName: emptyToNull(row.employeeName),
      ordinal: row.ordinal,
      amount: Money.fromMinorUnits(row.amountMinor).toWire(),
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      approvedAt: row.approvedAt,
    }));
  }

  listProjectStockCharges(projectId: string): ProjectCostStockChargeRecord[] {
    const rows = this.db.prepare(`SELECT
      c.id AS id,
      c.asset_unit_id AS asset_unit_id,
      u.asset_name AS asset_name,
      CAST(c.amount_dzd AS TEXT) AS amount,
      c.created_at AS created_at
      FROM "inventory_asset_charge" c
      LEFT JOIN "inventory_asset_unit" u ON u.id = c.asset_unit_id
      WHERE c.project_id = ? AND c.status = 'LIVE'`).all(projectId) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: String(row.id),
      assetUnitId: String(row.asset_unit_id),
      assetName: emptyToNull(row.asset_name),
      amount: Money.parse(String(row.amount ?? "0")).toWire(),
      placedAt: String(row.created_at),
    }));
  }

  listProjectMaterialMovements(projectId: string): ProjectCostMaterialMovementRecord[] {
    const rows = this.db.prepare(`SELECT
      m.id AS id,
      e.item_definition_id AS item_definition_id,
      e.item_name AS item_name,
      e.unit AS unit,
      CAST(m.quantity AS TEXT) AS quantity,
      CAST(e.unit_price_dzd AS TEXT) AS unit_price,
      m.occurred_at AS occurred_at,
      m.to_project_id AS to_project_id
      FROM "inventory_movement" m
      LEFT JOIN "inventory_entry" e ON e.id = m.inventory_entry_id
      WHERE m.item_type = 'CONSUMABLE'
        AND (
          (m.to_project_id = ? AND (m.from_project_id IS NULL OR m.from_project_id <> ?))
          OR (m.from_project_id = ? AND (m.to_project_id IS NULL OR m.to_project_id <> ?))
        )`).all(projectId, projectId, projectId, projectId) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      id: String(row.id),
      itemDefinitionId: emptyToNull(row.item_definition_id),
      itemName: emptyToNull(row.item_name),
      unit: emptyToNull(row.unit),
      quantity: Quantity.inventory(String(row.quantity ?? "0")).toWire(),
      unitPrice: row.unit_price == null ? null : UnitPrice.parse(String(row.unit_price)).toWire(),
      direction: String(row.to_project_id) === projectId ? "IN" : "OUT",
      occurredAt: String(row.occurred_at),
    }));
  }

  getProjectParkedAssets(projectId: string): ProjectCostParkedAssetRecord[] {
    const rows = this.db.prepare(`SELECT
      u.id AS asset_unit_id,
      u.asset_name AS asset_name,
      CAST(u.purchase_price_dzd AS TEXT) AS purchase_amount
      FROM "inventory_asset_unit" u
      WHERE u.current_project_id = ?`).all(projectId) as Array<Record<string, unknown>>;

    return rows.map(row => ({
      assetUnitId: String(row.asset_unit_id),
      assetName: emptyToNull(row.asset_name),
      purchaseAmount: Money.parse(String(row.purchase_amount ?? "0")).toWire(),
    }));
  }
}

function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.trim().length > 0 ? text : null;
}

export function createProjectCostRepository(db: BetterSqliteDatabase): ProjectCostRepository {
  return new SqliteProjectCostRepository(db);
}
