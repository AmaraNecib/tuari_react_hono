/**
 * Drizzle-based CompanyRepository adapter.
 *
 * `CompanyRepository` is a composition of four per-domain
 * repository interfaces, each of which owns the data-access seam
 * for one domain (workforce, operations, finance, audit). The
 * `SqliteCompanyRepository` is isolated from the public composition
 * boundary in `company.repository.ts`.
 *
 * The split is at the **interface** level: callers (services,
 * tests) can depend on the focused `WorkforceRepository`,
 * `OperationsRepository`, `FinanceRepository`, or
 * `AuditRepository` interface and stop crossing the broad multi-domain
 * repository boundary while preserving one transactional SQL adapter.
 */

import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { eq, and, desc, asc, sql, count, like, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { resolveDatabaseEnv } from "../../infrastructure/config/database-env";
import {
  encodeCursor as encodeCursorToken,
  decodeCursor as decodeCursorToken,
} from "../shared/cursor";
import * as schema from "../../schema";
import { createDrizzleFromSqlite } from "../../infrastructure/database/drizzle";
import { createAlgeriaTimestamp } from "./company-time";
import type { WorkforceRepository } from "./workforce.repository";
import type { OperationsRepository } from "./operations.repository";
import type { FinanceRepository } from "./finance.repository";
import type { AuditRepository } from "./audit.repository";
import type { CompanyRepository } from "./company.repository.contracts";
import type {
  DebtAccountCreateData,
  DebtAccountListFilters,
  DebtAccountRecord,
  DebtAccountUpdateData,
  DebtEntryCreateData,
  DebtEntryListFilters,
  DebtEntryRecord,
  DebtEntryVoidData,
  EmployeeBatchCreateData,
  EmployeeBatchCreateResultRecord,
  EmployeeCreateData,
  EmployeeListFilters,
  EmployeeManagerAssignmentRecord,
  EmployeeProjectAssignmentRecord,
  EmployeeSalaryPaymentCreateData,
  EmployeeSalaryPaymentListFilters,
  EmployeeSalaryPaymentRecord,
  EmployeeStateHistoryListFilters,
  EmployeeStateHistoryRecord,
  EmployeeWarehouseAssignmentRecord,
  EmployeeRecord,
  EmployeeUpdateData,
  EmployeeManagedProjectsSyncData,
  EmployeeManagedWarehousesSyncData,
  AuthUserDisplayRecord,
  ExternalCounterpartyCreateData,
  ExternalCounterpartyListFilters,
  ExternalCounterpartyRecord,
  MutationAuditContext,
  InventoryItemDefinitionAuditRecord,
  UserProfileHistoryRecord,
  EmployeeWorkplaceAssignmentData,
  ManagerAssignmentCreateData,
  ManagerAssignmentEndData,
  ManagerAssignmentListFilters,
  ProjectAssignmentCreateData,
  ProjectAssignmentEndData,
  ProjectAssignmentListFilters,
  ProjectCreateData,
  ProjectManagerOwnershipHistoryListFilters,
  ProjectManagerOwnershipHistoryRecord,
  ProjectListFilters,
  ProjectRecord,
  ProjectUpdateData,
  RoleCreateData,
  RoleRecord,
  RoleUpdateData,
  WarehouseCreateData,
  WarehouseAssignmentCreateData,
  WarehouseAssignmentEndData,
  WarehouseAssignmentListFilters,
  WarehouseManagerOwnershipHistoryListFilters,
  WarehouseManagerOwnershipHistoryRecord,
  WarehouseListFilters,
  WarehouseRecord,
  WarehouseUpdateData,
} from "./company.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize audit context with null defaults. */
/** Normalize audit context with null defaults. */
function normalizeAudit(ctx?: MutationAuditContext) {
  return {
    actorUserId: ctx?.actorUserId ?? null,
    actorLabel: ctx?.actorLabel ?? null,
    transactionId: ctx?.transactionId ?? null,
  };
}

type WhereCond = ReturnType<typeof eq> | ReturnType<typeof and> | ReturnType<typeof isNull>;

/** Build a Drizzle WHERE clause from an array of conditions. */
/** Build a Drizzle WHERE clause from an array of conditions. */
function buildWhere(conditions: WhereCond[]): WhereCond | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

// ---------------------------------------------------------------------------
// Drizzle row → Record mappers
// ---------------------------------------------------------------------------

/** Map Drizzle role row to RoleRecord. */
function toRole(r: typeof schema.role.$inferSelect): RoleRecord {
  return { id: r.id, key: r.key, name: r.name, description: r.description ?? null, isSystem: r.isSystem === 1, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle employee row to EmployeeRecord. */
function toEmployee(r: typeof schema.employee.$inferSelect): EmployeeRecord {
  return { id: r.id, firstName: r.firstName, lastName: r.lastName, phone: r.phone, roleId: r.roleId, status: r.status as EmployeeRecord["status"], salaryAmountDzd: r.salaryAmountDzd ?? null, salaryPeriod: r.salaryPeriod as EmployeeRecord["salaryPeriod"], notes: r.notes ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle project row to ProjectRecord. */
function toProject(r: typeof schema.project.$inferSelect): ProjectRecord {
  return { id: r.id, name: r.name, location: r.location ?? null, managerId: r.managerId ?? null, status: r.status as ProjectRecord["status"], notes: r.notes ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle warehouse row to WarehouseRecord. */
function toWarehouse(r: typeof schema.warehouse.$inferSelect): WarehouseRecord {
  return { id: r.id, name: r.name, address: r.address ?? null, managerId: r.managerId ?? null, status: r.status as WarehouseRecord["status"], notes: r.notes ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle manager assignment row. */
function toManagerAssignment(r: typeof schema.employeeManagerAssignment.$inferSelect): EmployeeManagerAssignmentRecord {
  return { id: r.id, workerId: r.workerId, managerId: r.managerId, status: r.status as EmployeeManagerAssignmentRecord["status"], startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle project row to ProjectRecord. */
/** Map Drizzle project assignment row. */
function toProjectAssignment(r: typeof schema.employeeProjectAssignment.$inferSelect): EmployeeProjectAssignmentRecord {
  return { id: r.id, employeeId: r.employeeId, projectId: r.projectId, status: r.status as EmployeeProjectAssignmentRecord["status"], startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle warehouse row to WarehouseRecord. */
/** Map Drizzle warehouse assignment row. */
function toWarehouseAssignment(r: typeof schema.employeeWarehouseAssignment.$inferSelect): EmployeeWarehouseAssignmentRecord {
  return { id: r.id, employeeId: r.employeeId, warehouseId: r.warehouseId, status: r.status as EmployeeWarehouseAssignmentRecord["status"], startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle state history row. */
function toStateHistory(r: typeof schema.employeeStateHistory.$inferSelect): EmployeeStateHistoryRecord {
  return { id: r.id, employeeId: r.employeeId, roleId: r.roleId, status: r.status as EmployeeStateHistoryRecord["status"], salaryAmountDzd: r.salaryAmountDzd ?? null, salaryPeriod: r.salaryPeriod as EmployeeStateHistoryRecord["salaryPeriod"], eventType: r.eventType as EmployeeStateHistoryRecord["eventType"], startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle project row to ProjectRecord. */
/** Map Drizzle project manager history row. */
function toProjectManagerHistory(r: typeof schema.projectManagerOwnershipHistory.$inferSelect): ProjectManagerOwnershipHistoryRecord {
  return { id: r.id, projectId: r.projectId, managerId: r.managerId, status: r.status as ProjectManagerOwnershipHistoryRecord["status"], startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle warehouse row to WarehouseRecord. */
/** Map Drizzle warehouse manager history row. */
function toWarehouseManagerHistory(r: typeof schema.warehouseManagerOwnershipHistory.$inferSelect): WarehouseManagerOwnershipHistoryRecord {
  return { id: r.id, warehouseId: r.warehouseId, managerId: r.managerId, status: r.status as WarehouseManagerOwnershipHistoryRecord["status"], startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle external counterparty row. */
function toExternalCounterparty(r: typeof schema.externalCounterparty.$inferSelect): ExternalCounterpartyRecord {
  return { id: r.id, fullName: r.fullName, phoneNumber: r.phoneNumber, note: r.note ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle debt account row. */
function toDebtAccount(r: typeof schema.debtAccount.$inferSelect): DebtAccountRecord {
  return { id: r.id, partyType: r.partyType as DebtAccountRecord["partyType"], workerId: r.workerId ?? null, externalCounterpartyId: r.externalCounterpartyId ?? null, status: r.status as DebtAccountRecord["status"], direction: r.direction as DebtAccountRecord["direction"], currentBalance: r.currentBalance, note: r.note ?? null, settledAt: r.settledAt ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle debt entry row. */
function toDebtEntry(r: typeof schema.debtEntry.$inferSelect): DebtEntryRecord {
  return { id: r.id, debtAccountId: r.debtAccountId, entryType: r.entryType as DebtEntryRecord["entryType"], signedAmountDzd: r.signedAmount, entryDate: r.entryDate, note: r.note ?? null, balanceAfterDzd: r.balanceAfter, reasonCategory: r.reasonCategory as DebtEntryRecord["reasonCategory"], reasonDetail: r.reasonDetail ?? null, paymentMethod: r.paymentMethod as DebtEntryRecord["paymentMethod"], status: r.status as DebtEntryRecord["status"], voidedAt: r.voidedAt ?? null, voidedBy: r.voidedBy ?? null, voidReason: r.voidReason ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle salary payment row. */
function toSalaryPayment(r: typeof schema.employeeSalaryPayment.$inferSelect): EmployeeSalaryPaymentRecord {
  return { id: r.id, employeeId: r.employeeId, periodType: r.periodType as EmployeeSalaryPaymentRecord["periodType"], expectedAmountDzd: r.expectedAmountDzd, actualAmountDzd: r.actualAmountDzd, paymentDate: r.paymentDate, note: r.note ?? null, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Map Drizzle user profile history row. */
function toUserProfileHistory(r: typeof schema.userProfileHistory.$inferSelect): UserProfileHistoryRecord {
  return { id: r.id, userId: r.userId, name: r.name ?? null, phone: r.phone ?? null, previousName: r.previousName ?? null, previousPhone: r.previousPhone ?? null, passwordChanged: r.passwordChanged === 1, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

// ---------------------------------------------------------------------------
// SqliteCompanyRepository
// ---------------------------------------------------------------------------

type DrizzleDb = BetterSQLite3Database<typeof schema>;

/** Drizzle-based implementation of CompanyRepository. */
export class SqliteCompanyRepository implements CompanyRepository {
  private readonly db: DrizzleDb;
  private readonly raw: any;

  constructor(
    dbOrRaw: DrizzleDb | any,
    rawHandle?: any,
  ) {
    // Support both (drizzleDb, rawDb) and (rawDb) signatures
    if (rawHandle) {
      this.db = dbOrRaw;
      this.raw = rawHandle;
    } else {
      this.raw = dbOrRaw;
      this.raw.pragma("foreign_keys = ON");
      this.db = createDrizzleFromSqlite(this.raw);
    }
  }

  withTransaction<T>(callback: () => T): T {
    return this.raw.transaction(callback)();
  }

  // ── Bootstrap ────────────────────────────────────────────────────────

  isBootstrapOwner(userId: string): boolean {
    const state = this.db.select({ userId: schema.appBootstrapState.userId }).from(schema.appBootstrapState).where(eq(schema.appBootstrapState.singleton, 1)).limit(1).all();
    if (state[0]?.userId) return state[0].userId === userId;

    const first = this.db.select({ id: schema.user.id }).from(schema.user).orderBy(asc(schema.user.createdAt)).limit(1).all();
    return first[0]?.id === userId;
  }

  // ── Roles ────────────────────────────────────────────────────────────

  listRoles(): RoleRecord[] {
    return this.db.select().from(schema.role).orderBy(asc(sql`name COLLATE NOCASE`), asc(schema.role.createdAt)).all().map(toRole);
  }

  getRoleById(id: string): RoleRecord | null {
    return this.db.select().from(schema.role).where(eq(schema.role.id, id)).limit(1).all().map(toRole)[0] ?? null;
  }

  getRoleByKey(key: string): RoleRecord | null {
    return this.db.select().from(schema.role).where(eq(schema.role.key, key)).limit(1).all().map(toRole)[0] ?? null;
  }

  createRole(data: RoleCreateData): RoleRecord {
    const id = crypto.randomUUID();
    const ts = createAlgeriaTimestamp();
    this.db.insert(schema.role).values({ id, key: data.key, name: data.name, description: data.description ?? null, isSystem: 0, createdAt: ts, updatedAt: ts }).run();
    return this.getRoleById(id)!;
  }

  updateRole(data: RoleUpdateData): RoleRecord | null {
    const cur = this.getRoleById(data.id);
    if (!cur) return null;
    const ts = createAlgeriaTimestamp();
    this.db.update(schema.role).set({ key: data.key ?? cur.key, name: data.name ?? cur.name, description: data.description !== undefined ? data.description : cur.description, updatedAt: ts }).where(eq(schema.role.id, data.id)).run();
    return this.getRoleById(data.id);
  }

  deleteRole(id: string): boolean {
    return this.db.delete(schema.role).where(eq(schema.role.id, id)).run().changes > 0;
  }

  countEmployeesByRoleId(roleId: string): number {
    return Number(this.db.select({ count: count() }).from(schema.employee).where(eq(schema.employee.roleId, roleId)).all()[0]?.count ?? 0);
  }

  // ── Employees ────────────────────────────────────────────────────────

  listEmployees(filters?: EmployeeListFilters): EmployeeRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.roleId) conds.push(eq(schema.employee.roleId, filters.roleId));
    if (filters?.status) conds.push(eq(schema.employee.status, filters.status));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.employee);
    return (w ? q.where(w) : q).orderBy(asc(sql`first_name COLLATE NOCASE`), asc(sql`last_name COLLATE NOCASE`), asc(schema.employee.createdAt)).all().map(toEmployee);
  }

  getEmployeeById(id: string): EmployeeRecord | null {
    return this.db.select().from(schema.employee).where(eq(schema.employee.id, id)).limit(1).all().map(toEmployee)[0] ?? null;
  }

  getEmployeeByPhone(phone: string): EmployeeRecord | null {
    return this.db.select().from(schema.employee).where(eq(schema.employee.phone, phone)).limit(1).all().map(toEmployee)[0] ?? null;
  }

  getAuthUserById(id: string): AuthUserDisplayRecord | null {
    const r = this.db.select({ id: schema.user.id, name: schema.user.name, phone: schema.user.phoneNumber }).from(schema.user).where(eq(schema.user.id, id)).limit(1).all()[0];
    return r ? { id: r.id, name: r.name, phone: r.phone } : null;
  }

  createEmployee(data: EmployeeCreateData, audit?: MutationAuditContext): EmployeeRecord {
    const id = crypto.randomUUID();
    const ts = createAlgeriaTimestamp();
    const a = normalizeAudit(audit);
    this.raw.transaction(() => {
      this.db.insert(schema.employee).values({ id, firstName: data.firstName, lastName: data.lastName, phone: data.phone, roleId: data.roleId, status: data.status, salaryAmountDzd: data.salaryAmountDzd ?? null, salaryPeriod: data.salaryPeriod ?? null, notes: data.notes ?? null, createdAt: ts, updatedAt: ts }).run();
      this.insertStateHistory({ employeeId: id, roleId: data.roleId, status: data.status, salaryAmountDzd: data.salaryAmountDzd ?? null, salaryPeriod: data.salaryPeriod ?? null, eventType: "CREATED", startDate: ts, notes: data.notes ?? null, ...a });
    })();
    return this.getEmployeeById(id)!;
  }

  createEmployeesBatch(data: EmployeeBatchCreateData[], audit?: MutationAuditContext): EmployeeBatchCreateResultRecord {
    const a = normalizeAudit(audit);
    const employees: EmployeeRecord[] = [];
    const managerAssignments: EmployeeManagerAssignmentRecord[] = [];
    const projectAssignments: EmployeeProjectAssignmentRecord[] = [];
    this.raw.transaction(() => {
      for (const row of data) {
        const eid = crypto.randomUUID();
        const ts = createAlgeriaTimestamp();
        this.db.insert(schema.employee).values({ id: eid, firstName: row.firstName, lastName: row.lastName, phone: row.phone, roleId: row.roleId, status: row.status, salaryAmountDzd: row.salaryAmountDzd ?? null, salaryPeriod: row.salaryPeriod ?? null, notes: row.notes ?? null, createdAt: ts, updatedAt: ts }).run();
        employees.push(this.getEmployeeById(eid)!);
        if (row.managerId) managerAssignments.push(this.createManagerAssignment({ workerId: eid, managerId: row.managerId, status: "ACTIVE", startDate: ts, endDate: null, notes: null }, audit));
        if (row.projectId) projectAssignments.push(this.createProjectAssignment({ employeeId: eid, projectId: row.projectId, status: "ACTIVE", startDate: ts, endDate: null, notes: null }, audit));
      }
    })();
    return { employees, managerAssignments, projectAssignments };
  }

  updateEmployee(data: EmployeeUpdateData, audit?: MutationAuditContext): EmployeeRecord | null {
    const cur = this.getEmployeeById(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit);
    const ts = createAlgeriaTimestamp();
    this.raw.transaction(() => {
      const u: Record<string, unknown> = { updatedAt: ts };
      if (data.firstName !== undefined) u.firstName = data.firstName;
      if (data.lastName !== undefined) u.lastName = data.lastName;
      if (data.phone !== undefined) u.phone = data.phone;
      if (data.roleId !== undefined) u.roleId = data.roleId;
      if (data.status !== undefined) u.status = data.status;
      if (data.salaryAmountDzd !== undefined) u.salaryAmountDzd = data.salaryAmountDzd;
      if (data.salaryPeriod !== undefined) u.salaryPeriod = data.salaryPeriod;
      if (data.notes !== undefined) u.notes = data.notes;
      this.db.update(schema.employee).set(u).where(eq(schema.employee.id, data.id)).run();
      if (data.status !== undefined || data.roleId !== undefined || data.salaryAmountDzd !== undefined || data.salaryPeriod !== undefined) {
        this.endActiveStateHistory(data.id, ts, a);
        this.insertStateHistory({ employeeId: data.id, roleId: data.roleId ?? cur.roleId, status: data.status ?? cur.status, salaryAmountDzd: data.salaryAmountDzd !== undefined ? data.salaryAmountDzd : cur.salaryAmountDzd, salaryPeriod: data.salaryPeriod !== undefined ? data.salaryPeriod : cur.salaryPeriod, eventType: "UPDATED", startDate: ts, notes: data.notes ?? null, ...a });
      }
    })();
    return this.getEmployeeById(data.id);
  }

  deleteEmployee(id: string): boolean {
    return this.raw.transaction(() => {
      this.db.delete(schema.employeeStateHistory).where(eq(schema.employeeStateHistory.employeeId, id)).run();
      return this.db.delete(schema.employee).where(eq(schema.employee.id, id)).run().changes > 0;
    })();
  }

  listEmployeesPaged(query: { filters?: EmployeeListFilters; cursor?: string; limit: number }): { items: EmployeeRecord[]; total: number; nextCursor: string | null } {
    const fc: WhereCond[] = [];
    if (query.filters?.roleId) fc.push(eq(schema.employee.roleId, query.filters.roleId));
    if (query.filters?.status) fc.push(eq(schema.employee.status, query.filters.status));
    const fw = buildWhere(fc);
    const total = Number((fw ? this.db.select({ count: count() }).from(schema.employee).where(fw) : this.db.select({ count: count() }).from(schema.employee)).all()[0]?.count ?? 0);

    const ac = [...fc];
    if (query.cursor) {
      const d = decodeCursorToken(query.cursor);
      ac.push(sql`(${schema.employee.createdAt} < ${d.createdAt} OR (${schema.employee.createdAt} = ${d.createdAt} AND ${schema.employee.id} < ${d.id}))`);
    }
    const w = buildWhere(ac);
    const q = this.db.select().from(schema.employee);
    const rows = (w ? q.where(w) : q).orderBy(desc(schema.employee.createdAt), desc(schema.employee.id)).limit(query.limit + 1).all().map(toEmployee);
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return { items, total, nextCursor: hasMore && last ? encodeCursorToken({ createdAt: last.createdAt, id: last.id }) : null };
  }

  upsertEmployee(data: EmployeeCreateData | (EmployeeUpdateData & { id: string })): EmployeeRecord {
    const existing = this.getEmployeeById((data as { id: string }).id);
    if (existing) {
      const r = this.updateEmployee({ id: (data as { id: string }).id, firstName: (data as Partial<EmployeeCreateData>).firstName, lastName: (data as Partial<EmployeeCreateData>).lastName, phone: (data as Partial<EmployeeCreateData>).phone, roleId: (data as Partial<EmployeeCreateData>).roleId, status: (data as Partial<EmployeeCreateData>).status, salaryAmountDzd: (data as Partial<EmployeeCreateData>).salaryAmountDzd, salaryPeriod: (data as Partial<EmployeeCreateData>).salaryPeriod, notes: (data as Partial<EmployeeCreateData>).notes });
      if (!r) throw new Error(`Failed to upsert employee ${(data as { id: string }).id}`);
      return r;
    }
    const cd = data as EmployeeCreateData;
    if (!cd.firstName || !cd.lastName || !cd.phone || !cd.roleId || !cd.status) throw new Error("upsertEmployee: missing required fields");
    const id = (data as { id?: string }).id ?? crypto.randomUUID();
    const ca = (data as { createdAt?: string }).createdAt ?? createAlgeriaTimestamp();
    const ua = (data as { updatedAt?: string }).updatedAt ?? ca;
    this.db.insert(schema.employee).values({ id, firstName: cd.firstName, lastName: cd.lastName, phone: cd.phone, roleId: cd.roleId, status: cd.status, salaryAmountDzd: cd.salaryAmountDzd ?? null, salaryPeriod: cd.salaryPeriod ?? null, notes: cd.notes ?? null, createdAt: ca, updatedAt: ua }).run();
    this.insertStateHistory({ employeeId: id, roleId: cd.roleId, status: cd.status, salaryAmountDzd: cd.salaryAmountDzd ?? null, salaryPeriod: cd.salaryPeriod ?? null, eventType: "CREATED", startDate: ca, notes: cd.notes ?? null, actorUserId: null, actorLabel: null, transactionId: null });
    return this.getEmployeeById(id)!;
  }

  assignEmployeeWorkplace(data: EmployeeWorkplaceAssignmentData, audit?: MutationAuditContext): void {
    const a = normalizeAudit(audit);
    this.raw.transaction(() => {
      const am = this.getActiveManagerAssignmentByWorkerId(data.employeeId);
      const ap = this.getActiveProjectAssignmentByEmployeeId(data.employeeId);
      const aw = this.getActiveWarehouseAssignmentByEmployeeId(data.employeeId);
      const ts = createAlgeriaTimestamp();
      if ((data.nextType === "PROJECT" && Boolean(ap) && ap?.projectId === data.projectId && am?.managerId === (data.managerId ?? null) && !aw) || (data.nextType === "WAREHOUSE" && Boolean(aw) && aw?.warehouseId === data.warehouseId && !am && !ap)) return;
      if (am && am.managerId !== (data.managerId ?? null)) this.endManagerAssignment({ id: am.id, endDate: ts, notes: data.notes ?? am.notes }, audit);
      if (ap) this.endProjectAssignment({ id: ap.id, endDate: ts, notes: data.notes ?? ap.notes }, audit);
      if (aw) this.endWarehouseAssignment({ id: aw.id, endDate: ts, notes: data.notes ?? aw.notes }, audit);
      if (data.nextType === "PROJECT" && data.projectId) {
        if (!am || am.managerId !== data.managerId) this.createManagerAssignment({ workerId: data.employeeId, managerId: data.managerId!, status: "ACTIVE", startDate: ts, endDate: null, notes: data.notes ?? null }, audit);
        this.createProjectAssignment({ employeeId: data.employeeId, projectId: data.projectId, status: "ACTIVE", startDate: ts, endDate: null, notes: data.notes ?? null }, audit);
      }
      if (data.nextType === "WAREHOUSE" && data.warehouseId) this.createWarehouseAssignment({ employeeId: data.employeeId, warehouseId: data.warehouseId, status: "ACTIVE", startDate: ts, endDate: null, notes: data.notes ?? null }, audit);
    })();
  }

  syncManagedProjects(data: EmployeeManagedProjectsSyncData, audit?: MutationAuditContext): void {
    const a = normalizeAudit(audit);
    this.raw.transaction(() => {
      const cur = this.listProjects({ managerId: data.employeeId }).map((p) => p.id);
      const curSet = new Set(cur);
      const nextSet = new Set(data.projectIds);
      const ts = createAlgeriaTimestamp();
      for (const pid of cur) { if (!nextSet.has(pid)) this.endActiveProjectManagerOwnershipHistory(pid, ts, a); }
      for (const pid of data.projectIds) {
        if (!curSet.has(pid)) this.insertProjectManagerOwnershipHistory({ projectId: pid, managerId: data.employeeId, status: "ACTIVE", startDate: ts, notes: null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
        this.db.update(schema.project).set({ managerId: data.employeeId, updatedAt: ts }).where(eq(schema.project.id, pid)).run();
      }
      // Clear manager from projects not in the list
      for (const pid of cur) { if (!nextSet.has(pid)) this.db.update(schema.project).set({ managerId: null, updatedAt: ts }).where(eq(schema.project.id, pid)).run(); }
    })();
  }

  syncManagedWarehouses(data: EmployeeManagedWarehousesSyncData, audit?: MutationAuditContext): void {
    const a = normalizeAudit(audit);
    this.raw.transaction(() => {
      const cur = this.listWarehouses({ managerId: data.employeeId }).map((w) => w.id);
      const curSet = new Set(cur);
      const nextSet = new Set(data.warehouseIds);
      const ts = createAlgeriaTimestamp();
      for (const wid of cur) { if (!nextSet.has(wid)) this.endActiveWarehouseManagerOwnershipHistory(wid, ts, a); }
      for (const wid of data.warehouseIds) {
        if (!curSet.has(wid)) this.insertWarehouseManagerOwnershipHistory({ warehouseId: wid, managerId: data.employeeId, status: "ACTIVE", startDate: ts, notes: null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
        this.db.update(schema.warehouse).set({ managerId: data.employeeId, updatedAt: ts }).where(eq(schema.warehouse.id, wid)).run();
      }
      for (const wid of cur) { if (!nextSet.has(wid)) this.db.update(schema.warehouse).set({ managerId: null, updatedAt: ts }).where(eq(schema.warehouse.id, wid)).run(); }
    })();
  }

  // ── External Counterparties ──────────────────────────────────────────

  listExternalCounterparties(filters?: ExternalCounterpartyListFilters): ExternalCounterpartyRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.fullName) conds.push(like(schema.externalCounterparty.fullName, `%${filters.fullName}%`));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.externalCounterparty);
    return (w ? q.where(w) : q).orderBy(asc(sql`full_name COLLATE NOCASE`), asc(schema.externalCounterparty.createdAt)).all().map(toExternalCounterparty);
  }

  getExternalCounterpartyById(id: string): ExternalCounterpartyRecord | null {
    return this.db.select().from(schema.externalCounterparty).where(eq(schema.externalCounterparty.id, id)).limit(1).all().map(toExternalCounterparty)[0] ?? null;
  }

  createExternalCounterparty(data: ExternalCounterpartyCreateData): ExternalCounterpartyRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp();
    this.db.insert(schema.externalCounterparty).values({ id, fullName: data.fullName, phoneNumber: data.phoneNumber, note: data.note ?? null, createdAt: ts, updatedAt: ts }).run();
    return this.getExternalCounterpartyById(id)!;
  }

  // ── Debt Accounts ────────────────────────────────────────────────────

  listDebtAccounts(filters?: DebtAccountListFilters): DebtAccountRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.partyType) conds.push(eq(schema.debtAccount.partyType, filters.partyType));
    if (filters?.workerId) conds.push(eq(schema.debtAccount.workerId, filters.workerId));
    if (filters?.externalCounterpartyId) conds.push(eq(schema.debtAccount.externalCounterpartyId, filters.externalCounterpartyId));
    if (filters?.direction) conds.push(eq(schema.debtAccount.direction, filters.direction));
    if (filters?.status) conds.push(eq(schema.debtAccount.status, filters.status));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.debtAccount);
    return (w ? q.where(w) : q).orderBy(desc(schema.debtAccount.updatedAt), desc(schema.debtAccount.createdAt)).all().map(toDebtAccount);
  }

  getDebtAccountById(id: string): DebtAccountRecord | null {
    return this.db.select().from(schema.debtAccount).where(eq(schema.debtAccount.id, id)).limit(1).all().map(toDebtAccount)[0] ?? null;
  }

  getDebtAccountByWorkerId(workerId: string): DebtAccountRecord | null {
    return this.db.select().from(schema.debtAccount).where(eq(schema.debtAccount.workerId, workerId)).orderBy(desc(schema.debtAccount.updatedAt), desc(schema.debtAccount.createdAt)).limit(1).all().map(toDebtAccount)[0] ?? null;
  }

  getDebtAccountByExternalCounterpartyId(ecId: string): DebtAccountRecord | null {
    return this.db.select().from(schema.debtAccount).where(eq(schema.debtAccount.externalCounterpartyId, ecId)).orderBy(desc(schema.debtAccount.updatedAt), desc(schema.debtAccount.createdAt)).limit(1).all().map(toDebtAccount)[0] ?? null;
  }

  getDebtAccountByExternalCounterpartyIdAndDirection(ecId: string, direction: DebtAccountRecord["direction"]): DebtAccountRecord | null {
    return this.db.select().from(schema.debtAccount).where(and(eq(schema.debtAccount.externalCounterpartyId, ecId), eq(schema.debtAccount.direction, direction))).orderBy(desc(schema.debtAccount.updatedAt), desc(schema.debtAccount.createdAt)).limit(1).all().map(toDebtAccount)[0] ?? null;
  }

  createDebtAccount(data: DebtAccountCreateData, audit?: MutationAuditContext): DebtAccountRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.db.insert(schema.debtAccount).values({ id, partyType: data.partyType, workerId: data.workerId ?? null, externalCounterpartyId: data.externalCounterpartyId ?? null, status: data.status, direction: data.direction, currentBalance: data.currentBalance, note: data.note ?? null, settledAt: data.settledAt ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts }).run();
    return this.getDebtAccountById(id)!;
  }

  updateDebtAccount(data: DebtAccountUpdateData, audit?: MutationAuditContext): DebtAccountRecord | null {
    const cur = this.getDebtAccountById(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = createAlgeriaTimestamp();
    this.db.update(schema.debtAccount).set({ status: data.status, currentBalance: data.currentBalance, settledAt: data.settledAt ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: ts }).where(eq(schema.debtAccount.id, data.id)).run();
    return this.getDebtAccountById(data.id);
  }

  // ── Debt Entries ─────────────────────────────────────────────────────

  listDebtEntries(filters: DebtEntryListFilters): DebtEntryRecord[] {
    return this.db.select().from(schema.debtEntry).where(eq(schema.debtEntry.debtAccountId, filters.debtAccountId)).orderBy(desc(schema.debtEntry.entryDate), desc(schema.debtEntry.createdAt)).all().map(toDebtEntry);
  }

  getDebtEntryById(id: string): DebtEntryRecord | null {
    return this.db.select().from(schema.debtEntry).where(eq(schema.debtEntry.id, id)).limit(1).all().map(toDebtEntry)[0] ?? null;
  }

  getLatestDebtEntry(accountId: string): DebtEntryRecord | null {
    return this.db.select().from(schema.debtEntry).where(eq(schema.debtEntry.debtAccountId, accountId)).orderBy(desc(schema.debtEntry.entryDate), desc(schema.debtEntry.createdAt)).limit(1).all().map(toDebtEntry)[0] ?? null;
  }

  listAllDebtEntries(): DebtEntryRecord[] {
    return this.db.select().from(schema.debtEntry).orderBy(schema.debtEntry.debtAccountId, desc(schema.debtEntry.entryDate), desc(schema.debtEntry.createdAt)).all().map(toDebtEntry);
  }

  createDebtEntry(data: DebtEntryCreateData, audit?: MutationAuditContext): DebtEntryRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.db.insert(schema.debtEntry).values({ id, debtAccountId: data.debtAccountId, entryType: data.entryType, signedAmount: data.signedAmountDzd, entryDate: data.entryDate, note: data.note ?? null, balanceAfter: data.balanceAfterDzd, reasonCategory: data.reasonCategory ?? "INVOICE_DRIVEN", reasonDetail: data.reasonDetail ?? null, paymentMethod: data.paymentMethod ?? null, status: data.status ?? "LIVE", voidedAt: data.voidedAt ?? null, voidedBy: data.voidedBy ?? null, voidReason: data.voidReason ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts }).run();
    return this.getDebtEntryById(id)!;
  }

  voidDebtEntry(data: DebtEntryVoidData, audit?: MutationAuditContext): DebtEntryRecord | null {
    const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.db.update(schema.debtEntry).set({ status: "VOIDED", voidedAt: data.voidedAt, voidedBy: data.voidedBy ?? a.actorLabel ?? a.actorUserId, voidReason: data.voidReason, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: ts }).where(eq(schema.debtEntry.id, data.id)).run();
    return this.getDebtEntryById(data.id);
  }

  updateDebtEntryBalanceAfter(id: string, balanceAfterDzd: number): void {
    this.db.update(schema.debtEntry).set({ balanceAfter: balanceAfterDzd, updatedAt: createAlgeriaTimestamp() }).where(eq(schema.debtEntry.id, id)).run();
  }

  // ── Projects ─────────────────────────────────────────────────────────

  listProjects(filters?: ProjectListFilters): ProjectRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.managerId) conds.push(eq(schema.project.managerId, filters.managerId));
    if (filters?.status) conds.push(eq(schema.project.status, filters.status));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.project);
    return (w ? q.where(w) : q).orderBy(asc(sql`name COLLATE NOCASE`), asc(schema.project.createdAt)).all().map(toProject);
  }

  getProjectById(id: string): ProjectRecord | null {
    return this.db.select().from(schema.project).where(eq(schema.project.id, id)).limit(1).all().map(toProject)[0] ?? null;
  }

  createProject(data: ProjectCreateData, audit?: MutationAuditContext): ProjectRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.raw.transaction(() => {
      this.db.insert(schema.project).values({ id, name: data.name, location: data.location ?? null, managerId: data.managerId ?? null, status: data.status, notes: data.notes ?? null, createdAt: ts, updatedAt: ts }).run();
      if (data.managerId && data.status === "ACTIVE") this.insertProjectManagerOwnershipHistory({ projectId: id, managerId: data.managerId, status: "ACTIVE", startDate: ts, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    })();
    return this.getProjectById(id)!;
  }

  updateProject(data: ProjectUpdateData, audit?: MutationAuditContext): ProjectRecord | null {
    const cur = this.getProjectById(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = createAlgeriaTimestamp();
    this.raw.transaction(() => {
      const nm = data.managerId !== undefined ? data.managerId : cur.managerId;
      const ns = data.status ?? cur.status;
      this.db.update(schema.project).set({ name: data.name ?? cur.name, location: data.location !== undefined ? data.location : cur.location, managerId: nm, status: ns, notes: data.notes !== undefined ? data.notes : cur.notes, updatedAt: ts }).where(eq(schema.project.id, data.id)).run();
      if (cur.managerId !== nm || cur.status !== ns) {
        if (cur.managerId && cur.status === "ACTIVE") this.endActiveProjectManagerOwnershipHistory(data.id, ts, a);
        if (nm && ns === "ACTIVE") this.insertProjectManagerOwnershipHistory({ projectId: data.id, managerId: nm, status: "ACTIVE", startDate: ts, notes: (data.notes !== undefined ? data.notes : cur.notes) ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
      }
      if (nm && ns === "ACTIVE" && data.reassignWorkerIds?.length) this.reassignWorkers({ workerIds: data.reassignWorkerIds, managerId: nm, timestamp: ts }, audit);
    })();
    return this.getProjectById(data.id);
  }

  // ── Warehouses ───────────────────────────────────────────────────────

  listWarehouses(filters?: WarehouseListFilters): WarehouseRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.managerId) conds.push(eq(schema.warehouse.managerId, filters.managerId));
    if (filters?.status) conds.push(eq(schema.warehouse.status, filters.status));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.warehouse);
    return (w ? q.where(w) : q).orderBy(asc(sql`name COLLATE NOCASE`), asc(schema.warehouse.createdAt)).all().map(toWarehouse);
  }

  getWarehouseById(id: string): WarehouseRecord | null {
    return this.db.select().from(schema.warehouse).where(eq(schema.warehouse.id, id)).limit(1).all().map(toWarehouse)[0] ?? null;
  }

  createWarehouse(data: WarehouseCreateData, audit?: MutationAuditContext): WarehouseRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.raw.transaction(() => {
      this.db.insert(schema.warehouse).values({ id, name: data.name, address: data.address ?? null, managerId: data.managerId ?? null, status: data.status, notes: data.notes ?? null, createdAt: ts, updatedAt: ts }).run();
      if (data.managerId && data.status === "ACTIVE") this.insertWarehouseManagerOwnershipHistory({ warehouseId: id, managerId: data.managerId, status: "ACTIVE", startDate: ts, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    })();
    return this.getWarehouseById(id)!;
  }

  updateWarehouse(data: WarehouseUpdateData, audit?: MutationAuditContext): WarehouseRecord | null {
    const cur = this.getWarehouseById(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = createAlgeriaTimestamp();
    this.raw.transaction(() => {
      const nm = data.managerId !== undefined ? data.managerId : cur.managerId;
      const ns = data.status ?? cur.status;
      this.db.update(schema.warehouse).set({ name: data.name ?? cur.name, address: data.address !== undefined ? data.address : cur.address, managerId: nm, status: ns, notes: data.notes !== undefined ? data.notes : cur.notes, updatedAt: ts }).where(eq(schema.warehouse.id, data.id)).run();
      if (cur.managerId !== nm || cur.status !== ns) {
        if (cur.managerId && cur.status === "ACTIVE") this.endActiveWarehouseManagerOwnershipHistory(data.id, ts, a);
        if (nm && ns === "ACTIVE") this.insertWarehouseManagerOwnershipHistory({ warehouseId: data.id, managerId: nm, status: "ACTIVE", startDate: ts, notes: (data.notes !== undefined ? data.notes : cur.notes) ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
      }
    })();
    return this.getWarehouseById(data.id);
  }

  // ── Manager Assignments ──────────────────────────────────────────────

  listManagerAssignments(filters?: ManagerAssignmentListFilters): EmployeeManagerAssignmentRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.workerId) conds.push(eq(schema.employeeManagerAssignment.workerId, filters.workerId));
    if (filters?.managerId) conds.push(eq(schema.employeeManagerAssignment.managerId, filters.managerId));
    if (filters?.status) conds.push(eq(schema.employeeManagerAssignment.status, filters.status));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.employeeManagerAssignment);
    return (w ? q.where(w) : q).orderBy(desc(schema.employeeManagerAssignment.startDate), desc(schema.employeeManagerAssignment.createdAt)).all().map(toManagerAssignment);
  }

  getManagerAssignmentById(id: string): EmployeeManagerAssignmentRecord | null {
    return this.db.select().from(schema.employeeManagerAssignment).where(eq(schema.employeeManagerAssignment.id, id)).limit(1).all().map(toManagerAssignment)[0] ?? null;
  }

  getActiveManagerAssignmentByWorkerId(workerId: string): EmployeeManagerAssignmentRecord | null {
    return this.db.select().from(schema.employeeManagerAssignment).where(and(eq(schema.employeeManagerAssignment.workerId, workerId), eq(schema.employeeManagerAssignment.status, "ACTIVE"))).orderBy(desc(schema.employeeManagerAssignment.startDate), desc(schema.employeeManagerAssignment.createdAt)).limit(1).all().map(toManagerAssignment)[0] ?? null;
  }

  createManagerAssignment(data: ManagerAssignmentCreateData, audit?: MutationAuditContext): EmployeeManagerAssignmentRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.db.insert(schema.employeeManagerAssignment).values({ id, workerId: data.workerId, managerId: data.managerId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts }).run();
    return this.getManagerAssignmentById(id)!;
  }

  endManagerAssignment(data: ManagerAssignmentEndData, audit?: MutationAuditContext): EmployeeManagerAssignmentRecord | null {
    const cur = this.getManagerAssignmentById(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit);
    this.db.update(schema.employeeManagerAssignment).set({ status: "ENDED", endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: createAlgeriaTimestamp() }).where(eq(schema.employeeManagerAssignment.id, data.id)).run();
    return this.getManagerAssignmentById(data.id);
  }

  // ── Project Assignments ──────────────────────────────────────────────

  listProjectAssignments(filters?: ProjectAssignmentListFilters): EmployeeProjectAssignmentRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.employeeId) conds.push(eq(schema.employeeProjectAssignment.employeeId, filters.employeeId));
    if (filters?.projectId) conds.push(eq(schema.employeeProjectAssignment.projectId, filters.projectId));
    if (filters?.status) conds.push(eq(schema.employeeProjectAssignment.status, filters.status));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.employeeProjectAssignment);
    return (w ? q.where(w) : q).orderBy(desc(schema.employeeProjectAssignment.startDate), desc(schema.employeeProjectAssignment.createdAt)).all().map(toProjectAssignment);
  }

  getProjectAssignmentById(id: string): EmployeeProjectAssignmentRecord | null {
    return this.db.select().from(schema.employeeProjectAssignment).where(eq(schema.employeeProjectAssignment.id, id)).limit(1).all().map(toProjectAssignment)[0] ?? null;
  }

  getActiveProjectAssignmentByEmployeeId(employeeId: string): EmployeeProjectAssignmentRecord | null {
    return this.db.select().from(schema.employeeProjectAssignment).where(and(eq(schema.employeeProjectAssignment.employeeId, employeeId), eq(schema.employeeProjectAssignment.status, "ACTIVE"))).orderBy(desc(schema.employeeProjectAssignment.startDate), desc(schema.employeeProjectAssignment.createdAt)).limit(1).all().map(toProjectAssignment)[0] ?? null;
  }

  createProjectAssignment(data: ProjectAssignmentCreateData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.db.insert(schema.employeeProjectAssignment).values({ id, employeeId: data.employeeId, projectId: data.projectId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts }).run();
    return this.getProjectAssignmentById(id)!;
  }

  endProjectAssignment(data: ProjectAssignmentEndData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord | null {
    const cur = this.getProjectAssignmentById(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit);
    this.db.update(schema.employeeProjectAssignment).set({ status: "ENDED", endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: createAlgeriaTimestamp() }).where(eq(schema.employeeProjectAssignment.id, data.id)).run();
    return this.getProjectAssignmentById(data.id);
  }

  // ── Warehouse Assignments ────────────────────────────────────────────

  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters): EmployeeWarehouseAssignmentRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.employeeId) conds.push(eq(schema.employeeWarehouseAssignment.employeeId, filters.employeeId));
    if (filters?.warehouseId) conds.push(eq(schema.employeeWarehouseAssignment.warehouseId, filters.warehouseId));
    if (filters?.status) conds.push(eq(schema.employeeWarehouseAssignment.status, filters.status));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.employeeWarehouseAssignment);
    return (w ? q.where(w) : q).orderBy(desc(schema.employeeWarehouseAssignment.startDate), desc(schema.employeeWarehouseAssignment.createdAt)).all().map(toWarehouseAssignment);
  }

  getWarehouseAssignmentById(id: string): EmployeeWarehouseAssignmentRecord | null {
    return this.db.select().from(schema.employeeWarehouseAssignment).where(eq(schema.employeeWarehouseAssignment.id, id)).limit(1).all().map(toWarehouseAssignment)[0] ?? null;
  }

  getActiveWarehouseAssignmentByEmployeeId(employeeId: string): EmployeeWarehouseAssignmentRecord | null {
    return this.db.select().from(schema.employeeWarehouseAssignment).where(and(eq(schema.employeeWarehouseAssignment.employeeId, employeeId), eq(schema.employeeWarehouseAssignment.status, "ACTIVE"))).orderBy(desc(schema.employeeWarehouseAssignment.startDate), desc(schema.employeeWarehouseAssignment.createdAt)).limit(1).all().map(toWarehouseAssignment)[0] ?? null;
  }

  createWarehouseAssignment(data: WarehouseAssignmentCreateData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.db.insert(schema.employeeWarehouseAssignment).values({ id, employeeId: data.employeeId, warehouseId: data.warehouseId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts }).run();
    return this.getWarehouseAssignmentById(id)!;
  }

  endWarehouseAssignment(data: WarehouseAssignmentEndData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord | null {
    const cur = this.getWarehouseAssignmentById(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit);
    this.db.update(schema.employeeWarehouseAssignment).set({ status: "ENDED", endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: createAlgeriaTimestamp() }).where(eq(schema.employeeWarehouseAssignment.id, data.id)).run();
    return this.getWarehouseAssignmentById(data.id);
  }

  // ── History ──────────────────────────────────────────────────────────

  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters): EmployeeStateHistoryRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.employeeId) conds.push(eq(schema.employeeStateHistory.employeeId, filters.employeeId));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.employeeStateHistory);
    return (w ? q.where(w) : q).orderBy(desc(schema.employeeStateHistory.startDate), desc(schema.employeeStateHistory.createdAt)).all().map(toStateHistory);
  }

  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters): ProjectManagerOwnershipHistoryRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.managerId) conds.push(eq(schema.projectManagerOwnershipHistory.managerId, filters.managerId));
    if (filters?.projectId) conds.push(eq(schema.projectManagerOwnershipHistory.projectId, filters.projectId));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.projectManagerOwnershipHistory);
    return (w ? q.where(w) : q).orderBy(desc(schema.projectManagerOwnershipHistory.startDate), desc(schema.projectManagerOwnershipHistory.createdAt)).all().map(toProjectManagerHistory);
  }

  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters): WarehouseManagerOwnershipHistoryRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.managerId) conds.push(eq(schema.warehouseManagerOwnershipHistory.managerId, filters.managerId));
    if (filters?.warehouseId) conds.push(eq(schema.warehouseManagerOwnershipHistory.warehouseId, filters.warehouseId));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.warehouseManagerOwnershipHistory);
    return (w ? q.where(w) : q).orderBy(desc(schema.warehouseManagerOwnershipHistory.startDate), desc(schema.warehouseManagerOwnershipHistory.createdAt)).all().map(toWarehouseManagerHistory);
  }

  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters): EmployeeSalaryPaymentRecord[] {
    const conds: WhereCond[] = [];
    if (filters?.employeeId) conds.push(eq(schema.employeeSalaryPayment.employeeId, filters.employeeId));
    const w = buildWhere(conds);
    const q = this.db.select().from(schema.employeeSalaryPayment);
    return (w ? q.where(w) : q).orderBy(desc(schema.employeeSalaryPayment.paymentDate), desc(schema.employeeSalaryPayment.createdAt)).all().map(toSalaryPayment);
  }

  createSalaryPayment(data: EmployeeSalaryPaymentCreateData, audit?: MutationAuditContext): EmployeeSalaryPaymentRecord {
    const id = crypto.randomUUID(); const ts = createAlgeriaTimestamp(); const a = normalizeAudit(audit);
    this.db.insert(schema.employeeSalaryPayment).values({ id, employeeId: data.employeeId, periodType: data.periodType, expectedAmountDzd: data.expectedAmountDzd, actualAmountDzd: data.actualAmountDzd, paymentDate: data.paymentDate, note: data.note ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts }).run();
    return this.listSalaryPayments({ employeeId: data.employeeId }).find((e) => e.id === id)!;
  }

  listUserProfileHistory(): UserProfileHistoryRecord[] {
    return this.db.select().from(schema.userProfileHistory).orderBy(desc(schema.userProfileHistory.updatedAt), desc(schema.userProfileHistory.createdAt)).all().map(toUserProfileHistory);
  }

  listInventoryItemDefinitionsForLog(): InventoryItemDefinitionAuditRecord[] {
    try {
      return this.db.select().from(schema.inventoryItemDefinition).orderBy(desc(schema.inventoryItemDefinition.createdAt)).all().map((r) => ({ id: r.id, name: r.name, itemType: r.itemType as InventoryItemDefinitionAuditRecord["itemType"], unit: r.unit ?? null, description: r.description ?? null, isActive: r.isActive === 1, actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null, transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt }));
    } catch (e) { if (e instanceof Error && e.message.includes("no such table")) return []; throw e; }
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /** Insert an employee state history record (hire, update, termination). */
  private insertStateHistory(data: { employeeId: string; roleId: string; status: string; salaryAmountDzd: number | null; salaryPeriod: string | null; eventType: string; startDate: string; notes: string | null; actorUserId: string | null; actorLabel: string | null; transactionId: string | null }) {
    this.db.insert(schema.employeeStateHistory).values({ id: crypto.randomUUID(), employeeId: data.employeeId, roleId: data.roleId, status: data.status, salaryAmountDzd: data.salaryAmountDzd, salaryPeriod: data.salaryPeriod, eventType: data.eventType, startDate: data.startDate, endDate: null, notes: data.notes, actorUserId: data.actorUserId, actorLabel: data.actorLabel, transactionId: data.transactionId, createdAt: data.startDate, updatedAt: data.startDate }).run();
  }

  /** End the current active state history for an employee. */
  private endActiveStateHistory(employeeId: string, endDate: string, a: { actorUserId: string | null; actorLabel: string | null; transactionId: string | null }) {
    this.db.update(schema.employeeStateHistory).set({ endDate, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: endDate }).where(and(eq(schema.employeeStateHistory.employeeId, employeeId), isNull(schema.employeeStateHistory.endDate))).run();
  }

  /** Reassign workers to a new manager within a transaction. */
  private reassignWorkers(data: { workerIds: string[]; managerId: string; timestamp: string }, audit?: MutationAuditContext) {
    const a = normalizeAudit(audit);
    for (const wid of data.workerIds) {
      const cur = this.getActiveManagerAssignmentByWorkerId(wid);
      if (cur?.managerId === data.managerId) continue;
      if (cur) this.db.update(schema.employeeManagerAssignment).set({ status: "ENDED", endDate: data.timestamp, notes: cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: data.timestamp }).where(eq(schema.employeeManagerAssignment.id, cur.id)).run();
      this.db.insert(schema.employeeManagerAssignment).values({ id: crypto.randomUUID(), workerId: wid, managerId: data.managerId, status: "ACTIVE", startDate: data.timestamp, endDate: null, notes: null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: data.timestamp, updatedAt: data.timestamp }).run();
    }
  }

  /** Insert a project manager ownership history record. */
  private insertProjectManagerOwnershipHistory(data: { projectId: string; managerId: string; status: string; startDate: string; notes: string | null; actorUserId: string | null; actorLabel: string | null; transactionId: string | null }) {
    this.db.insert(schema.projectManagerOwnershipHistory).values({ id: crypto.randomUUID(), projectId: data.projectId, managerId: data.managerId, status: data.status, startDate: data.startDate, endDate: null, notes: data.notes, actorUserId: data.actorUserId, actorLabel: data.actorLabel, transactionId: data.transactionId, createdAt: data.startDate, updatedAt: data.startDate }).run();
  }

  /** End the active project manager ownership history. */
  private endActiveProjectManagerOwnershipHistory(projectId: string, endDate: string, a: { actorUserId: string | null; actorLabel: string | null; transactionId: string | null }) {
    this.db.update(schema.projectManagerOwnershipHistory).set({ endDate, status: "ENDED", actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: endDate }).where(and(eq(schema.projectManagerOwnershipHistory.projectId, projectId), isNull(schema.projectManagerOwnershipHistory.endDate))).run();
  }

  /** Insert a warehouse manager ownership history record. */
  private insertWarehouseManagerOwnershipHistory(data: { warehouseId: string; managerId: string; status: string; startDate: string; notes: string | null; actorUserId: string | null; actorLabel: string | null; transactionId: string | null }) {
    this.db.insert(schema.warehouseManagerOwnershipHistory).values({ id: crypto.randomUUID(), warehouseId: data.warehouseId, managerId: data.managerId, status: data.status, startDate: data.startDate, endDate: null, notes: data.notes, actorUserId: data.actorUserId, actorLabel: data.actorLabel, transactionId: data.transactionId, createdAt: data.startDate, updatedAt: data.startDate }).run();
  }

  /** End the active warehouse manager ownership history. */
  private endActiveWarehouseManagerOwnershipHistory(warehouseId: string, endDate: string, a: { actorUserId: string | null; actorLabel: string | null; transactionId: string | null }) {
    this.db.update(schema.warehouseManagerOwnershipHistory).set({ endDate, status: "ENDED", actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: endDate }).where(and(eq(schema.warehouseManagerOwnershipHistory.warehouseId, warehouseId), isNull(schema.warehouseManagerOwnershipHistory.endDate))).run();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a CompanyRepository from a raw SQLite handle.
 */
/** Create a CompanyRepository from a raw SQLite handle. */
export function createCompanyRepository(
  rawDb: any,
): CompanyRepository {
  rawDb.pragma("foreign_keys = ON");
  const drizzleDb = createDrizzleFromSqlite(rawDb);
  return new SqliteCompanyRepository(drizzleDb, rawDb);
}
