import { asc, eq, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { Quantity, UnitPrice, parseExactLine } from "@tuari/contracts";

import * as schema from "../../../schema";
import { prepareMoneyRead } from "../../../infrastructure/database/exact-money-storage";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type {
  ProjectCostExpenseRecord, ProjectCostMaterialMovementRecord, ProjectCostParkedAssetRecord,
  ProjectCostProjectRecord, ProjectCostRepository, ProjectCostSalarySplitRecord, ProjectCostStockChargeRecord,
} from "../project-cost.types";

/** Exact-schema read adapter. Every synchronous read reserves the root-shared connection lock. */
export class SqliteExactProjectCostRepository implements ProjectCostRepository {
  private readonly orm: BetterSQLite3Database<typeof schema>;
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    requireExactMoneySchema(db, "expenses");
    requireExactMoneySchema(db, "inventory");
    requireExactMoneySchema(db, "workforce");
    this.orm = drizzle(db, { schema });
  }
  private read<T>(work: () => T): T { return this.lock.runSync(work); }
  withReadConsistency<T>(work: () => T): T {
    return this.read(() => this.db.transaction(work).deferred());
  }
  private money(table: string, column: string, id: string): string {
    const value = prepareMoneyRead(this.db, `SELECT "${column}" AS minor_units FROM "${table}" WHERE id=?`).get(id);
    if (value === undefined || value === null) throw new TypeError(`Missing exact amount in ${table}`);
    return value.toWire();
  }
  getProject(projectId: string): ProjectCostProjectRecord | null {
    return this.read(() => {
      const row = this.db.prepare('SELECT id FROM "project" WHERE id=?').get(projectId) as { id: string } | undefined;
      return row ? { id: String(row.id) } : null;
    });
  }
  listProjectExpenses(projectId: string): ProjectCostExpenseRecord[] {
    return this.read(() => {
      const rows = this.db.prepare(`SELECT e.id,e.expense_date,e.what_for,e.responsible_worker_id,
        TRIM(COALESCE(emp.first_name,'') || ' ' || COALESCE(emp.last_name,'')) AS responsible_worker_name,
        e.seller_id,cp.full_name AS seller_name FROM expense e
        LEFT JOIN employee emp ON emp.id=e.responsible_worker_id
        LEFT JOIN external_counterparty cp ON cp.id=e.seller_id
        WHERE e.project_id=? AND e.status='LIVE'`).all(projectId) as Record<string, unknown>[];
      return rows.map(row => ({ id: String(row.id), expenseDate: String(row.expense_date), whatFor: emptyToNull(row.what_for), amount: this.money("expense", "amount_minor", String(row.id)), responsibleWorkerId: emptyToNull(row.responsible_worker_id), responsibleWorkerName: emptyToNull(row.responsible_worker_name), sellerId: emptyToNull(row.seller_id), sellerName: emptyToNull(row.seller_name) }));
    });
  }
  listProjectSalarySplits(projectId: string): ProjectCostSalarySplitRecord[] {
    return this.read(() => {
      const rows = this.orm.select({ earningId: schema.employeeEarning.id, segmentId: schema.employeeEarningSegment.id,
        employeeId: schema.employeeEarning.employeeId,
        employeeName: sql<string>`TRIM(COALESCE(${schema.employee.firstName}, '') || ' ' || COALESCE(${schema.employee.lastName}, ''))`,
        ordinal: schema.employeeEarningSegment.ordinal, days: schema.employeeEarningSegment.days,
        periodStart: schema.employeeEarning.periodStart,
        periodEnd: schema.employeeEarning.periodEnd, approvedAt: schema.employeeEarning.approvedAt,
      }).from(schema.employeeEarningSegment).innerJoin(schema.employeeEarning, eq(schema.employeeEarningSegment.earningId, schema.employeeEarning.id))
        .innerJoin(schema.employee, eq(schema.employeeEarning.employeeId, schema.employee.id))
        .where(eq(schema.employeeEarningSegment.projectId, projectId))
        .orderBy(asc(schema.employeeEarning.approvedAt), asc(schema.employeeEarning.id), asc(schema.employeeEarningSegment.ordinal)).all();
      return rows.map(row => ({ earningId: row.earningId, segmentId: row.segmentId, employeeId: row.employeeId,
        employeeName: emptyToNull(row.employeeName), ordinal: row.ordinal, days: row.days,
        amount: this.money("employee_earning_segment", "amount_minor", row.segmentId), periodStart: row.periodStart,
        periodEnd: row.periodEnd, approvedAt: row.approvedAt }));
    });
  }
  listProjectStockCharges(projectId: string): ProjectCostStockChargeRecord[] {
    return this.read(() => {
      const rows = this.db.prepare(`SELECT c.id,c.asset_unit_id,u.asset_name,c.created_at FROM inventory_asset_charge c
        LEFT JOIN inventory_asset_unit u ON u.id=c.asset_unit_id WHERE c.project_id=? AND c.status='LIVE'`).all(projectId) as Record<string, unknown>[];
      return rows.map(row => ({ id: String(row.id), assetUnitId: String(row.asset_unit_id), assetName: emptyToNull(row.asset_name), amount: this.money("inventory_asset_charge", "amount_minor", String(row.id)), placedAt: String(row.created_at) }));
    });
  }
  listProjectMaterialMovements(projectId: string): ProjectCostMaterialMovementRecord[] {
    return this.read(() => {
      const rows = this.db.prepare(`SELECT m.id,m.quantity,m.occurred_at,m.to_project_id,e.item_definition_id,e.item_name,e.unit,e.price_source
        FROM inventory_movement m LEFT JOIN inventory_entry e ON e.id=m.inventory_entry_id
        WHERE m.item_type='CONSUMABLE' AND ((m.to_project_id=? AND (m.from_project_id IS NULL OR m.from_project_id<>?))
        OR (m.from_project_id=? AND (m.to_project_id IS NULL OR m.to_project_id<>?)))`).all(projectId, projectId, projectId, projectId) as Record<string, unknown>[];
      return rows.map(row => {
        if (typeof row.price_source !== "string") throw new TypeError("Exact inventory movement has no price source");
        const priceSource: unknown = JSON.parse(row.price_source);
        const parsed = parseExactLine(priceSource);
        const quantity = Quantity.inventory(sqliteNumberToDecimal(row.quantity)).toWire();
        return { id: String(row.id), itemDefinitionId: emptyToNull(row.item_definition_id), itemName: emptyToNull(row.item_name), unit: emptyToNull(row.unit), quantity,
          unitPrice: parsed.source.mode === "unit-price" ? UnitPrice.parse(parsed.source.price).toWire() : null,
          priceSource, direction: String(row.to_project_id) === projectId ? "IN" : "OUT", occurredAt: String(row.occurred_at) };
      });
    });
  }
  getProjectParkedAssets(projectId: string): ProjectCostParkedAssetRecord[] {
    return this.read(() => {
      const rows = this.db.prepare("SELECT id,asset_name FROM inventory_asset_unit WHERE current_project_id=?").all(projectId) as Record<string, unknown>[];
      return rows.map(row => ({ assetUnitId: String(row.id), assetName: emptyToNull(row.asset_name), purchaseAmount: this.money("inventory_asset_unit", "purchase_price_minor", String(row.id)) }));
    });
  }
}

function sqliteNumberToDecimal(value: unknown): string {
  const text = String(value).toLowerCase();
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) throw new TypeError("Invalid inventory quantity");
  const sign = match[1] ?? "", whole = match[2] ?? "0", fraction = match[3] ?? "", exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent)) throw new TypeError("Invalid inventory quantity exponent");
  const digits = whole + fraction, point = whole.length + exponent;
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.trim().length ? text : null;
}
export function createExactProjectCostRepository(db: BetterSqliteDatabase, lock: FifoLock): ProjectCostRepository {
  return new SqliteExactProjectCostRepository(db, lock);
}
