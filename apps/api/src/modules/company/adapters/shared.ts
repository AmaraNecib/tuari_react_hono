/**
 * Shared helpers for the SQLite repository adapters.
 *
 * Row mappers, audit normalisation, and Drizzle query utilities
 * extracted from the former monolithic `SqliteCompanyRepository`.
 */

import { eq, and, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "../../../schema";
import type {
  DebtAccountRecord,
  DebtEntryRecord,
  EmployeeManagerAssignmentRecord,
  UserProfileHistoryRecord,
  EmployeeProjectAssignmentRecord,
  EmployeeRecord,
  EmployeeSalaryPaymentRecord,
  EmployeeStateHistoryRecord,
  EmployeeWarehouseAssignmentRecord,
  ExternalCounterpartyRecord,
  MutationAuditContext,
  ProjectManagerOwnershipHistoryRecord,
  ProjectRecord,
  RoleRecord,
  WarehouseManagerOwnershipHistoryRecord,
  WarehouseRecord,
} from "../company.types";

/** Drizzle database type for the full schema. */
export type DrizzleDb = BetterSQLite3Database<typeof schema>;

/** Normalize audit context with null defaults. */
export function normalizeAudit(ctx?: MutationAuditContext) {
  return {
    actorUserId: ctx?.actorUserId ?? null,
    actorLabel: ctx?.actorLabel ?? null,
    transactionId: ctx?.transactionId ?? null,
  };
}

type WhereCond = ReturnType<typeof eq> | ReturnType<typeof and> | ReturnType<typeof isNull>;

/** Build a Drizzle WHERE clause from an array of conditions. */
export function buildWhere(conditions: WhereCond[]): WhereCond | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

export function toRole(r: typeof schema.role.$inferSelect): RoleRecord {
  return {
    id: r.id, key: r.key, name: r.name, description: r.description ?? null,
    isSystem: r.isSystem === 1, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toEmployee(r: typeof schema.employee.$inferSelect): EmployeeRecord {
  return {
    id: r.id, firstName: r.firstName, lastName: r.lastName, phone: r.phone,
    roleId: r.roleId, status: r.status as EmployeeRecord["status"],
    salaryAmountDzd: r.salaryAmountDzd ?? null,
    salaryPeriod: r.salaryPeriod as EmployeeRecord["salaryPeriod"],
    notes: r.notes ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toProject(r: typeof schema.project.$inferSelect): ProjectRecord {
  return {
    id: r.id, name: r.name, location: r.location ?? null,
    managerId: r.managerId ?? null, status: r.status as ProjectRecord["status"],
    notes: r.notes ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toWarehouse(r: typeof schema.warehouse.$inferSelect): WarehouseRecord {
  return {
    id: r.id, name: r.name, address: r.address ?? null,
    managerId: r.managerId ?? null, status: r.status as WarehouseRecord["status"],
    notes: r.notes ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toManagerAssignment(
  r: typeof schema.employeeManagerAssignment.$inferSelect,
): EmployeeManagerAssignmentRecord {
  return {
    id: r.id, workerId: r.workerId, managerId: r.managerId,
    status: r.status as EmployeeManagerAssignmentRecord["status"],
    startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toProjectAssignment(
  r: typeof schema.employeeProjectAssignment.$inferSelect,
): EmployeeProjectAssignmentRecord {
  return {
    id: r.id, employeeId: r.employeeId, projectId: r.projectId,
    status: r.status as EmployeeProjectAssignmentRecord["status"],
    startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toWarehouseAssignment(
  r: typeof schema.employeeWarehouseAssignment.$inferSelect,
): EmployeeWarehouseAssignmentRecord {
  return {
    id: r.id, employeeId: r.employeeId, warehouseId: r.warehouseId,
    status: r.status as EmployeeWarehouseAssignmentRecord["status"],
    startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toStateHistory(
  r: typeof schema.employeeStateHistory.$inferSelect,
): EmployeeStateHistoryRecord {
  return {
    id: r.id, employeeId: r.employeeId, roleId: r.roleId,
    status: r.status as EmployeeStateHistoryRecord["status"],
    salaryAmountDzd: r.salaryAmountDzd ?? null,
    salaryPeriod: r.salaryPeriod as EmployeeStateHistoryRecord["salaryPeriod"],
    eventType: r.eventType as EmployeeStateHistoryRecord["eventType"],
    startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toProjectManagerHistory(
  r: typeof schema.projectManagerOwnershipHistory.$inferSelect,
): ProjectManagerOwnershipHistoryRecord {
  return {
    id: r.id, projectId: r.projectId, managerId: r.managerId,
    status: r.status as ProjectManagerOwnershipHistoryRecord["status"],
    startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toWarehouseManagerHistory(
  r: typeof schema.warehouseManagerOwnershipHistory.$inferSelect,
): WarehouseManagerOwnershipHistoryRecord {
  return {
    id: r.id, warehouseId: r.warehouseId, managerId: r.managerId,
    status: r.status as WarehouseManagerOwnershipHistoryRecord["status"],
    startDate: r.startDate, endDate: r.endDate ?? null, notes: r.notes ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toExternalCounterparty(
  r: typeof schema.externalCounterparty.$inferSelect,
): ExternalCounterpartyRecord {
  return {
    id: r.id, fullName: r.fullName, phoneNumber: r.phoneNumber,
    note: r.note ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toDebtAccount(r: typeof schema.debtAccount.$inferSelect): DebtAccountRecord {
  return {
    id: r.id, partyType: r.partyType as DebtAccountRecord["partyType"],
    workerId: r.workerId ?? null, externalCounterpartyId: r.externalCounterpartyId ?? null,
    status: r.status as DebtAccountRecord["status"],
    direction: r.direction as DebtAccountRecord["direction"],
    currentBalance: r.currentBalance, note: r.note ?? null, settledAt: r.settledAt ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toDebtEntry(r: typeof schema.debtEntry.$inferSelect): DebtEntryRecord {
  return {
    id: r.id, debtAccountId: r.debtAccountId,
    entryType: r.entryType as DebtEntryRecord["entryType"],
    signedAmountDzd: r.signedAmount, entryDate: r.entryDate, note: r.note ?? null,
    balanceAfterDzd: r.balanceAfter,
    reasonCategory: r.reasonCategory as DebtEntryRecord["reasonCategory"],
    reasonDetail: r.reasonDetail ?? null,
    paymentMethod: r.paymentMethod as DebtEntryRecord["paymentMethod"],
    status: r.status as DebtEntryRecord["status"],
    voidedAt: r.voidedAt ?? null, voidedBy: r.voidedBy ?? null,
    voidReason: r.voidReason ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toSalaryPayment(
  r: typeof schema.employeeSalaryPayment.$inferSelect,
): EmployeeSalaryPaymentRecord {
  return {
    id: r.id, employeeId: r.employeeId,
    periodType: r.periodType as EmployeeSalaryPaymentRecord["periodType"],
    expectedAmountDzd: r.expectedAmountDzd, actualAmountDzd: r.actualAmountDzd,
    paymentDate: r.paymentDate, note: r.note ?? null,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function toUserProfileHistory(
  r: typeof schema.userProfileHistory.$inferSelect,
): UserProfileHistoryRecord {
  return {
    id: r.id, userId: r.userId, name: r.name ?? null, phone: r.phone ?? null,
    previousName: r.previousName ?? null, previousPhone: r.previousPhone ?? null,
    passwordChanged: r.passwordChanged === 1,
    actorUserId: r.actorUserId ?? null, actorLabel: r.actorLabel ?? null,
    transactionId: r.transactionId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}


