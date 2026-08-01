/**
 * Shared in-memory store for the InMemory repository adapters.
 *
 * Mirrors the tables of the SQLite schema in Maps so the four
 * domain adapters can share the same data store (just like they
 * share the same Drizzle handle in the SQLite adapters).
 */

import crypto from "node:crypto";
import { createAlgeriaTimestamp } from "../company-time";
import type {
  AuthUserRecord,
  BootstrapStateRecord,
  DebtAccountRecord,
  DebtEntryRecord,
  EmployeeManagerAssignmentRecord,
  EmployeeProjectAssignmentRecord,
  EmployeeRecord,
  EmployeeSalaryPaymentRecord,
  EmployeeStateHistoryRecord,
  EmployeeWarehouseAssignmentRecord,
  ExternalCounterpartyRecord,
  ProjectManagerOwnershipHistoryRecord,
  ProjectRecord,
  RoleRecord,
  UserProfileHistoryRecord,
  WarehouseManagerOwnershipHistoryRecord,
  WarehouseRecord,
  MutationAuditContext,
} from "../company.types";

/** Normalized audit snapshot fields. */
export type AuditSnapshot = {
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
};

export function normalizeAudit(ctx?: MutationAuditContext): AuditSnapshot {
  return {
    actorUserId: ctx?.actorUserId ?? null,
    actorLabel: ctx?.actorLabel ?? null,
    transactionId: ctx?.transactionId ?? null,
  };
}

export function now(): string {
  return createAlgeriaTimestamp();
}

export function newId(): string {
  return crypto.randomUUID();
}

/** In-memory table store. */
export class InMemoryStore {
  roles = new Map<string, RoleRecord>();
  employees = new Map<string, EmployeeRecord>();
  projects = new Map<string, ProjectRecord>();
  warehouses = new Map<string, WarehouseRecord>();
  managerAssignments = new Map<string, EmployeeManagerAssignmentRecord>();
  projectAssignments = new Map<string, EmployeeProjectAssignmentRecord>();
  warehouseAssignments = new Map<string, EmployeeWarehouseAssignmentRecord>();
  employeeStateHistory = new Map<string, EmployeeStateHistoryRecord>();
  projectManagerOwnershipHistory = new Map<string, ProjectManagerOwnershipHistoryRecord>();
  warehouseManagerOwnershipHistory = new Map<string, WarehouseManagerOwnershipHistoryRecord>();
  salaryPayments = new Map<string, EmployeeSalaryPaymentRecord>();
  externalCounterparties = new Map<string, ExternalCounterpartyRecord>();
  debtAccounts = new Map<string, DebtAccountRecord>();
  debtEntries = new Map<string, DebtEntryRecord>();
  userProfileHistory = new Map<string, UserProfileHistoryRecord>();
  users = new Map<string, AuthUserRecord>();
  bootstrapState = new Map<string, BootstrapStateRecord>();

  /** Run a callback "in a transaction" (no-op in-memory, kept for API parity). */
  transaction<T>(callback: () => T): T {
    return callback();
  }

  insertProjectManagerOwnershipHistory(data: Omit<ProjectManagerOwnershipHistoryRecord, "id" | "endDate" | "createdAt" | "updatedAt">): void {
    const id = newId();
    this.projectManagerOwnershipHistory.set(id, { id, ...data, endDate: null, createdAt: data.startDate, updatedAt: data.startDate });
  }
  endActiveProjectManagerOwnershipHistory(projectId: string, endDate: string, a: AuditSnapshot): void {
    for (const [hid, h] of this.projectManagerOwnershipHistory) {
      if (h.projectId === projectId && !h.endDate) {
        this.projectManagerOwnershipHistory.set(hid, { ...h, endDate, status: "ENDED", ...a, updatedAt: endDate });
        break;
      }
    }
  }
  insertWarehouseManagerOwnershipHistory(data: Omit<WarehouseManagerOwnershipHistoryRecord, "id" | "endDate" | "createdAt" | "updatedAt">): void {
    const id = newId();
    this.warehouseManagerOwnershipHistory.set(id, { id, ...data, endDate: null, createdAt: data.startDate, updatedAt: data.startDate });
  }
  endActiveWarehouseManagerOwnershipHistory(warehouseId: string, endDate: string, a: AuditSnapshot): void {
    for (const [hid, h] of this.warehouseManagerOwnershipHistory) {
      if (h.warehouseId === warehouseId && !h.endDate) {
        this.warehouseManagerOwnershipHistory.set(hid, { ...h, endDate, status: "ENDED", ...a, updatedAt: endDate });
        break;
      }
    }
  }
}
