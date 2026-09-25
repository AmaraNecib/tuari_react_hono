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

function cloneMap<T>(source: Map<string, T>): Map<string, T> {
  const copy = new Map<string, T>();
  for (const [key, value] of source) {
    copy.set(key, structuredClone(value));
  }
  return copy;
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

  /** Run a callback with rollback semantics matching the SQLite adapter. */
  transaction<T>(callback: () => T): T {
    const snapshots = {
      roles: cloneMap(this.roles),
      employees: cloneMap(this.employees),
      projects: cloneMap(this.projects),
      warehouses: cloneMap(this.warehouses),
      managerAssignments: cloneMap(this.managerAssignments),
      projectAssignments: cloneMap(this.projectAssignments),
      warehouseAssignments: cloneMap(this.warehouseAssignments),
      employeeStateHistory: cloneMap(this.employeeStateHistory),
      projectManagerOwnershipHistory: cloneMap(this.projectManagerOwnershipHistory),
      warehouseManagerOwnershipHistory: cloneMap(this.warehouseManagerOwnershipHistory),
      salaryPayments: cloneMap(this.salaryPayments),
      externalCounterparties: cloneMap(this.externalCounterparties),
      debtAccounts: cloneMap(this.debtAccounts),
      debtEntries: cloneMap(this.debtEntries),
      userProfileHistory: cloneMap(this.userProfileHistory),
      users: cloneMap(this.users),
      bootstrapState: cloneMap(this.bootstrapState),
    };

    try {
      return callback();
    } catch (error) {
      this.roles = snapshots.roles;
      this.employees = snapshots.employees;
      this.projects = snapshots.projects;
      this.warehouses = snapshots.warehouses;
      this.managerAssignments = snapshots.managerAssignments;
      this.projectAssignments = snapshots.projectAssignments;
      this.warehouseAssignments = snapshots.warehouseAssignments;
      this.employeeStateHistory = snapshots.employeeStateHistory;
      this.projectManagerOwnershipHistory = snapshots.projectManagerOwnershipHistory;
      this.warehouseManagerOwnershipHistory = snapshots.warehouseManagerOwnershipHistory;
      this.salaryPayments = snapshots.salaryPayments;
      this.externalCounterparties = snapshots.externalCounterparties;
      this.debtAccounts = snapshots.debtAccounts;
      this.debtEntries = snapshots.debtEntries;
      this.userProfileHistory = snapshots.userProfileHistory;
      this.users = snapshots.users;
      this.bootstrapState = snapshots.bootstrapState;
      throw error;
    }
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
