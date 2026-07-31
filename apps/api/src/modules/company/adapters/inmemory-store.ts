/**
 * Shared in-memory store for the InMemory repository adapters.
 *
 * Mirrors the tables of the SQLite schema in Maps so the four
 * domain adapters can share the same data store (just like they
 * share the same Drizzle handle in the SQLite adapters).
 */

import crypto from "node:crypto";
import { createAlgeriaTimestamp } from "../company-time";
import type { MutationAuditContext } from "../company.types";

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
  roles = new Map<string, any>();
  employees = new Map<string, any>();
  projects = new Map<string, any>();
  warehouses = new Map<string, any>();
  managerAssignments = new Map<string, any>();
  projectAssignments = new Map<string, any>();
  warehouseAssignments = new Map<string, any>();
  employeeStateHistory = new Map<string, any>();
  projectManagerOwnershipHistory = new Map<string, any>();
  warehouseManagerOwnershipHistory = new Map<string, any>();
  salaryPayments = new Map<string, any>();
  externalCounterparties = new Map<string, any>();
  debtAccounts = new Map<string, any>();
  debtEntries = new Map<string, any>();
  userProfileHistory = new Map<string, any>();
  users = new Map<string, any>();
  bootstrapState = new Map<string, any>();

  /** Run a callback "in a transaction" (no-op in-memory, kept for API parity). */
  transaction<T>(callback: () => T): T {
    return callback();
  }
}
