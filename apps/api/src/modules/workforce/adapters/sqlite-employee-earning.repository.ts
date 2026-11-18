import { randomUUID } from "node:crypto";

import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { Money, SalaryReference, UnitPrice, type EmployeeEarning, type EmployeeEarningApprovalInput } from "@tuari/contracts";

import * as schema from "../../../schema";
import { runSyncTransaction, type FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { MutationAuditContext } from "../../company/company.types";
import type { EmployeeEarningRepository } from "../employee-earnings.repository";

type SegmentRow = {
  id: string;
  earningId: string;
  projectId: string;
  ordinal: number;
  days: number;
  amountMinor: string;
  createdAt: string;
};
type EarningRow = {
  id: string;
  employeeId: string;
  requestId: string;
  requestHash: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: "DZD";
  totalMinor: string;
  unallocatedMinor: string;
  referenceSalaryPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  referenceSalaryUnits: string | null;
  approvedAt: string;
  actorUserId: string | null;
  transactionId: string | null;
  createdAt: string;
};

function mapEarning(row: EarningRow, segments: SegmentRow[]): EmployeeEarning {
  return {
    id: row.id,
    employeeId: row.employeeId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    currencyCode: row.currencyCode,
    totalAmount: Money.fromMinorUnits(row.totalMinor).toWire(),
    unallocatedAmount: Money.fromMinorUnits(row.unallocatedMinor).toWire(),
    referenceSalary: row.referenceSalaryPeriod === null || row.referenceSalaryUnits === null
      ? null
      : SalaryReference.parse(
        row.referenceSalaryPeriod,
        row.referenceSalaryPeriod === "DAILY"
          ? UnitPrice.fromScaledUnits(row.referenceSalaryUnits).toWire()
          : Money.fromMinorUnits(row.referenceSalaryUnits).toWire(),
      ).toWire(),
    segments: segments.map((segment) => ({
      id: segment.id,
      projectId: segment.projectId,
      days: segment.days,
      amount: Money.fromMinorUnits(segment.amountMinor).toWire(),
    })),
    approvedAt: row.approvedAt,
    actorUserId: row.actorUserId,
    transactionId: row.transactionId,
    createdAt: row.createdAt,
  };
}

/** SQLite persistence for approved earnings. Normal reads use Drizzle. */
export class SqliteEmployeeEarningRepository implements EmployeeEarningRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(private readonly raw: BetterSqliteDatabase, private readonly lock: FifoLock) {
    this.db = drizzle(raw, { schema });
  }

  findByRequestId(requestId: string): { earning: EmployeeEarning; requestHash: string } | null {
    const row = this.db.select({
      id: schema.employeeEarning.id,
      employeeId: schema.employeeEarning.employeeId,
      requestId: schema.employeeEarning.requestId,
      requestHash: schema.employeeEarning.requestHash,
      periodStart: schema.employeeEarning.periodStart,
      periodEnd: schema.employeeEarning.periodEnd,
      currencyCode: schema.employeeEarning.currencyCode,
      totalMinor: sql<string>`CAST(${schema.employeeEarning.totalMinor} AS TEXT)`,
      unallocatedMinor: sql<string>`CAST(${schema.employeeEarning.unallocatedMinor} AS TEXT)`,
      referenceSalaryPeriod: schema.employeeEarning.referenceSalaryPeriod,
      referenceSalaryUnits: sql<string | null>`CAST(${schema.employeeEarning.referenceSalaryUnits} AS TEXT)`,
      approvedAt: schema.employeeEarning.approvedAt,
      actorUserId: schema.employeeEarning.actorUserId,
      transactionId: schema.employeeEarning.transactionId,
      createdAt: schema.employeeEarning.createdAt,
    }).from(schema.employeeEarning)
      .where(eq(schema.employeeEarning.requestId, requestId)).get();
    return row ? { earning: mapEarning(row as EarningRow, this.segmentsFor(row.id)), requestHash: row.requestHash } : null;
  }

  list(employeeId?: string): EmployeeEarning[] {
    const query = this.db.select({
      id: schema.employeeEarning.id,
      employeeId: schema.employeeEarning.employeeId,
      requestId: schema.employeeEarning.requestId,
      requestHash: schema.employeeEarning.requestHash,
      periodStart: schema.employeeEarning.periodStart,
      periodEnd: schema.employeeEarning.periodEnd,
      currencyCode: schema.employeeEarning.currencyCode,
      totalMinor: sql<string>`CAST(${schema.employeeEarning.totalMinor} AS TEXT)`,
      unallocatedMinor: sql<string>`CAST(${schema.employeeEarning.unallocatedMinor} AS TEXT)`,
      referenceSalaryPeriod: schema.employeeEarning.referenceSalaryPeriod,
      referenceSalaryUnits: sql<string | null>`CAST(${schema.employeeEarning.referenceSalaryUnits} AS TEXT)`,
      approvedAt: schema.employeeEarning.approvedAt,
      actorUserId: schema.employeeEarning.actorUserId,
      transactionId: schema.employeeEarning.transactionId,
      createdAt: schema.employeeEarning.createdAt,
    }).from(schema.employeeEarning);
    const rows = (employeeId === undefined
      ? query
      : query.where(eq(schema.employeeEarning.employeeId, employeeId)))
      .orderBy(desc(schema.employeeEarning.approvedAt), desc(schema.employeeEarning.id)).all();
    if (rows.length === 0) return [];
    const earningIds = rows.map((row) => row.id);
    const selectedSegments = this.db.select({
      id: schema.employeeEarningSegment.id,
      earningId: schema.employeeEarningSegment.earningId,
      projectId: schema.employeeEarningSegment.projectId,
      ordinal: schema.employeeEarningSegment.ordinal,
      days: schema.employeeEarningSegment.days,
      amountMinor: sql<string>`CAST(${schema.employeeEarningSegment.amountMinor} AS TEXT)`,
      createdAt: schema.employeeEarningSegment.createdAt,
    }).from(schema.employeeEarningSegment)
      .where(inArray(schema.employeeEarningSegment.earningId, earningIds))
      .orderBy(asc(schema.employeeEarningSegment.earningId), asc(schema.employeeEarningSegment.ordinal)).all();
    const byEarning = new Map<string, SegmentRow[]>();
    for (const segment of selectedSegments) {
      const group = byEarning.get(segment.earningId) ?? [];
      group.push(segment as SegmentRow);
      byEarning.set(segment.earningId, group);
    }
    return rows.map((row) => mapEarning(row as EarningRow, byEarning.get(row.id) ?? []));
  }

  hasForEmployee(employeeId: string): boolean {
    return this.db.select({ id: schema.employeeEarning.id })
      .from(schema.employeeEarning)
      .where(eq(schema.employeeEarning.employeeId, employeeId))
      .limit(1)
      .get() !== undefined;
  }

  create(
    input: EmployeeEarningApprovalInput,
    requestHash: string,
    approvedAt: string,
    audit?: MutationAuditContext,
  ): EmployeeEarning {
    const earningId = randomUUID();
    const createdAt = approvedAt;
    runSyncTransaction(this.lock, this.raw, () => {
      // SQLite INTEGER affinity converts bounded decimal text to exact int64.
      // The CHECKs reject any value SQLite cannot store as an integer.
      this.raw.prepare(`INSERT INTO employee_earning (
        id, employee_id, request_id, request_hash, period_start, period_end,
        currency_code, total_minor, unallocated_minor, reference_salary_period, reference_salary_units, approved_at,
        actor_user_id, transaction_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        earningId,
        input.employeeId,
        input.requestId,
        requestHash,
        input.periodStart,
        input.periodEnd,
        input.currencyCode,
        Money.parse(input.totalAmount).toMinorUnits(),
        Money.parse(input.unallocatedAmount).toMinorUnits(),
        input.referenceSalary?.period ?? null,
        input.referenceSalary
          ? input.referenceSalary.period === "DAILY"
            ? UnitPrice.parse(input.referenceSalary.amount).toScaledUnits()
            : Money.parse(input.referenceSalary.amount).toMinorUnits()
          : null,
        approvedAt,
        audit?.actorUserId ?? null,
        audit?.transactionId ?? null,
        createdAt,
      );
      const insertSegment = this.raw.prepare(`INSERT INTO employee_earning_segment (
        id, earning_id, project_id, ordinal, days, amount_minor, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const [ordinal, segment] of input.segments.entries()) {
        insertSegment.run(segment.id, earningId, segment.projectId, ordinal, segment.days, Money.parse(segment.amount).toMinorUnits(), createdAt);
      }
    });
    const result = this.findByRequestId(input.requestId);
    if (!result) throw new Error("Approved earning was not readable after commit");
    return result.earning;
  }

  private segmentsFor(earningId: string): SegmentRow[] {
    return this.db.select({
      id: schema.employeeEarningSegment.id,
      earningId: schema.employeeEarningSegment.earningId,
      projectId: schema.employeeEarningSegment.projectId,
      ordinal: schema.employeeEarningSegment.ordinal,
      days: schema.employeeEarningSegment.days,
      amountMinor: sql<string>`CAST(${schema.employeeEarningSegment.amountMinor} AS TEXT)`,
      createdAt: schema.employeeEarningSegment.createdAt,
    }).from(schema.employeeEarningSegment)
      .where(eq(schema.employeeEarningSegment.earningId, earningId))
      .orderBy(asc(schema.employeeEarningSegment.ordinal)).all() as SegmentRow[];
  }
}
