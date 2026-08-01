/**
 * In-memory OperationsRepository for tests and the InMemory adapter.
 */

import type { OperationsRepository } from "../operations.repository";
import type {
  MutationAuditContext, ProjectAssignmentCreateData, ProjectAssignmentEndData,
  ProjectAssignmentListFilters, ProjectCreateData, ProjectListFilters,
  ProjectManagerOwnershipHistoryListFilters, ProjectManagerOwnershipHistoryRecord,
  ProjectRecord, ProjectUpdateData,
  WarehouseAssignmentCreateData, WarehouseAssignmentEndData,
  WarehouseAssignmentListFilters, WarehouseCreateData, WarehouseListFilters,
  WarehouseManagerOwnershipHistoryListFilters, WarehouseManagerOwnershipHistoryRecord,
  WarehouseRecord, WarehouseUpdateData,
  EmployeeProjectAssignmentRecord, EmployeeWarehouseAssignmentRecord,
} from "../company.types";
import { InMemoryStore, normalizeAudit, now, newId } from "./inmemory-store";
import type { AuditSnapshot } from "./inmemory-store";

const sortByName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const sortByDate = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1;

export class InMemoryOperationsRepository implements OperationsRepository {
  constructor(private readonly store: InMemoryStore) {}

  listProjects(filters?: ProjectListFilters): ProjectRecord[] {
    const all = Array.from(this.store.projects.values());
    const filtered = filters ? all.filter((p) =>
      (!filters.managerId || p.managerId === filters.managerId) &&
      (!filters.status || p.status === filters.status),
    ) : all;
    return filtered.sort(sortByName);
  }
  getProjectById(id: string): ProjectRecord | null {
    return this.store.projects.get(id) ?? null;
  }
  createProject(data: ProjectCreateData, audit?: MutationAuditContext): ProjectRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const project: ProjectRecord = { id, name: data.name, location: data.location ?? null, managerId: data.managerId ?? null, status: data.status, notes: data.notes ?? null, createdAt: ts, updatedAt: ts };
    this.store.projects.set(id, project);
    if (data.managerId && data.status === "ACTIVE") this.insertProjectManagerOwnershipHistory({ projectId: id, managerId: data.managerId, status: "ACTIVE", startDate: ts, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    return project;
  }
  updateProject(data: ProjectUpdateData, audit?: MutationAuditContext): ProjectRecord | null {
    const cur = this.store.projects.get(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = now();
    const nm = data.managerId !== undefined ? data.managerId : cur.managerId;
    const ns = data.status ?? cur.status;
    const project = { ...cur, name: data.name ?? cur.name, location: data.location !== undefined ? data.location : cur.location, managerId: nm, status: ns, notes: data.notes !== undefined ? data.notes : cur.notes, updatedAt: ts };
    this.store.projects.set(data.id, project);
    if (cur.managerId !== nm || cur.status !== ns) {
      if (cur.managerId && cur.status === "ACTIVE") this.endActiveProjectManagerOwnershipHistory(data.id, ts, a);
      if (nm && ns === "ACTIVE") this.insertProjectManagerOwnershipHistory({ projectId: data.id, managerId: nm, status: "ACTIVE", startDate: ts, notes: (data.notes !== undefined ? data.notes : cur.notes) ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    }
    return project;
  }

  listWarehouses(filters?: WarehouseListFilters): WarehouseRecord[] {
    const all = Array.from(this.store.warehouses.values());
    const filtered = filters ? all.filter((w) =>
      (!filters.managerId || w.managerId === filters.managerId) &&
      (!filters.status || w.status === filters.status),
    ) : all;
    return filtered.sort(sortByName);
  }
  getWarehouseById(id: string): WarehouseRecord | null {
    return this.store.warehouses.get(id) ?? null;
  }
  createWarehouse(data: WarehouseCreateData, audit?: MutationAuditContext): WarehouseRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const warehouse: WarehouseRecord = { id, name: data.name, address: data.address ?? null, managerId: data.managerId ?? null, status: data.status, notes: data.notes ?? null, createdAt: ts, updatedAt: ts };
    this.store.warehouses.set(id, warehouse);
    if (data.managerId && data.status === "ACTIVE") this.insertWarehouseManagerOwnershipHistory({ warehouseId: id, managerId: data.managerId, status: "ACTIVE", startDate: ts, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    return warehouse;
  }
  updateWarehouse(data: WarehouseUpdateData, audit?: MutationAuditContext): WarehouseRecord | null {
    const cur = this.store.warehouses.get(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = now();
    const nm = data.managerId !== undefined ? data.managerId : cur.managerId;
    const ns = data.status ?? cur.status;
    const warehouse = { ...cur, name: data.name ?? cur.name, address: data.address !== undefined ? data.address : cur.address, managerId: nm, status: ns, notes: data.notes !== undefined ? data.notes : cur.notes, updatedAt: ts };
    this.store.warehouses.set(data.id, warehouse);
    if (cur.managerId !== nm || cur.status !== ns) {
      if (cur.managerId && cur.status === "ACTIVE") this.endActiveWarehouseManagerOwnershipHistory(data.id, ts, a);
      if (nm && ns === "ACTIVE") this.insertWarehouseManagerOwnershipHistory({ warehouseId: data.id, managerId: nm, status: "ACTIVE", startDate: ts, notes: (data.notes !== undefined ? data.notes : cur.notes) ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    }
    return warehouse;
  }

  listProjectAssignments(filters?: ProjectAssignmentListFilters): EmployeeProjectAssignmentRecord[] {
    const all = Array.from(this.store.projectAssignments.values());
    const filtered = filters ? all.filter((x) =>
      (!filters.employeeId || x.employeeId === filters.employeeId) &&
      (!filters.projectId || x.projectId === filters.projectId) &&
      (!filters.status || x.status === filters.status),
    ) : all;
    return filtered.sort(sortByDate);
  }
  getProjectAssignmentById(id: string): EmployeeProjectAssignmentRecord | null {
    return this.store.projectAssignments.get(id) ?? null;
  }
  getActiveProjectAssignmentByEmployeeId(employeeId: string): EmployeeProjectAssignmentRecord | null {
    for (const x of this.store.projectAssignments.values()) if (x.employeeId === employeeId && x.status === "ACTIVE") return x;
    return null;
  }
  createProjectAssignment(data: ProjectAssignmentCreateData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record: EmployeeProjectAssignmentRecord = { id, employeeId: data.employeeId, projectId: data.projectId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.projectAssignments.set(id, record);
    return record;
  }
  endProjectAssignment(data: ProjectAssignmentEndData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord | null {
    const cur = this.store.projectAssignments.get(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit);
    const record = { ...cur, status: "ENDED" as const, endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: now() };
    this.store.projectAssignments.set(data.id, record);
    return record;
  }

  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters): EmployeeWarehouseAssignmentRecord[] {
    const all = Array.from(this.store.warehouseAssignments.values());
    const filtered = filters ? all.filter((x) =>
      (!filters.employeeId || x.employeeId === filters.employeeId) &&
      (!filters.warehouseId || x.warehouseId === filters.warehouseId) &&
      (!filters.status || x.status === filters.status),
    ) : all;
    return filtered.sort(sortByDate);
  }
  getWarehouseAssignmentById(id: string): EmployeeWarehouseAssignmentRecord | null {
    return this.store.warehouseAssignments.get(id) ?? null;
  }
  getActiveWarehouseAssignmentByEmployeeId(employeeId: string): EmployeeWarehouseAssignmentRecord | null {
    for (const x of this.store.warehouseAssignments.values()) if (x.employeeId === employeeId && x.status === "ACTIVE") return x;
    return null;
  }
  createWarehouseAssignment(data: WarehouseAssignmentCreateData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record: EmployeeWarehouseAssignmentRecord = { id, employeeId: data.employeeId, warehouseId: data.warehouseId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.warehouseAssignments.set(id, record);
    return record;
  }
  endWarehouseAssignment(data: WarehouseAssignmentEndData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord | null {
    const cur = this.store.warehouseAssignments.get(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit);
    const record = { ...cur, status: "ENDED" as const, endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: now() };
    this.store.warehouseAssignments.set(data.id, record);
    return record;
  }

  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters): ProjectManagerOwnershipHistoryRecord[] {
    const all = Array.from(this.store.projectManagerOwnershipHistory.values());
    const filtered = filters ? all.filter((h) =>
      (!filters.managerId || h.managerId === filters.managerId) &&
      (!filters.projectId || h.projectId === filters.projectId),
    ) : all;
    return filtered.sort(sortByDate);
  }
  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters): WarehouseManagerOwnershipHistoryRecord[] {
    const all = Array.from(this.store.warehouseManagerOwnershipHistory.values());
    const filtered = filters ? all.filter((h) =>
      (!filters.managerId || h.managerId === filters.managerId) &&
      (!filters.warehouseId || h.warehouseId === filters.warehouseId),
    ) : all;
    return filtered.sort(sortByDate);
  }

  private insertProjectManagerOwnershipHistory(data: Omit<ProjectManagerOwnershipHistoryRecord, "id" | "endDate" | "createdAt" | "updatedAt">) {
    const id = newId();
    this.store.projectManagerOwnershipHistory.set(id, { id, ...data, endDate: null, createdAt: data.startDate, updatedAt: data.startDate });
  }
  private endActiveProjectManagerOwnershipHistory(projectId: string, endDate: string, a: AuditSnapshot) {
    for (const [hid, h] of this.store.projectManagerOwnershipHistory) {
      if (h.projectId === projectId && !h.endDate) {
        this.store.projectManagerOwnershipHistory.set(hid, { ...h, endDate, status: "ENDED", ...a, updatedAt: endDate });
        break;
      }
    }
  }
  private insertWarehouseManagerOwnershipHistory(data: Omit<WarehouseManagerOwnershipHistoryRecord, "id" | "endDate" | "createdAt" | "updatedAt">) {
    const id = newId();
    this.store.warehouseManagerOwnershipHistory.set(id, { id, ...data, endDate: null, createdAt: data.startDate, updatedAt: data.startDate });
  }
  private endActiveWarehouseManagerOwnershipHistory(warehouseId: string, endDate: string, a: AuditSnapshot) {
    for (const [hid, h] of this.store.warehouseManagerOwnershipHistory) {
      if (h.warehouseId === warehouseId && !h.endDate) {
        this.store.warehouseManagerOwnershipHistory.set(hid, { ...h, endDate, status: "ENDED", ...a, updatedAt: endDate });
        break;
      }
    }
  }
}
