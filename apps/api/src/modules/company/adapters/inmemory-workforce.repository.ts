/**
 * In-memory WorkforceRepository for tests and the InMemory adapter.
 *
 * Mirrors the behavior of SqliteWorkforceRepository using Maps.
 */

import type { WorkforceRepository } from "../workforce.repository";
import type {
  EmployeeBatchCreateData, EmployeeBatchCreateResultRecord,
  EmployeeCreateData, EmployeeListFilters, EmployeeRecord,
  EmployeeSalaryPaymentCreateData, EmployeeSalaryPaymentListFilters,
  EmployeeSalaryPaymentRecord, EmployeeStateHistoryListFilters,
  EmployeeStateHistoryRecord, EmployeeUpdateData,
  EmployeeWorkplaceAssignmentData, EmployeeManagedProjectsSyncData,
  EmployeeManagedWarehousesSyncData,
  ManagerAssignmentCreateData, ManagerAssignmentEndData,
  ManagerAssignmentListFilters, MutationAuditContext,
  RoleCreateData, RoleRecord, RoleUpdateData,
  EmployeeManagerAssignmentRecord, EmployeeProjectAssignmentRecord,
  EmployeeWarehouseAssignmentRecord,
  ProjectAssignmentCreateData, ProjectAssignmentEndData,
  WarehouseAssignmentCreateData, WarehouseAssignmentEndData,
} from "../company.types";
import { InMemoryStore, normalizeAudit, now, newId } from "./inmemory-store";
import type { AuditSnapshot } from "./inmemory-store";

const sortByDate = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1;

export class InMemoryWorkforceRepository implements WorkforceRepository {
  constructor(private readonly store: InMemoryStore) {}

  listRoles(): RoleRecord[] {
    return Array.from(this.store.roles.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  getRoleById(id: string): RoleRecord | null {
    return this.store.roles.get(id) ?? null;
  }
  getRoleByKey(key: string): RoleRecord | null {
    for (const r of this.store.roles.values()) if (r.key === key) return r;
    return null;
  }
  createRole(data: RoleCreateData): RoleRecord {
    const id = newId(); const ts = now();
    const role: RoleRecord = { id, key: data.key, name: data.name, description: data.description ?? null, isSystem: false, createdAt: ts, updatedAt: ts };
    this.store.roles.set(id, role);
    return role;
  }
  updateRole(data: RoleUpdateData): RoleRecord | null {
    const cur = this.store.roles.get(data.id);
    if (!cur) return null;
    const role = { ...cur, key: data.key ?? cur.key, name: data.name ?? cur.name, description: data.description !== undefined ? data.description : cur.description, updatedAt: now() };
    this.store.roles.set(data.id, role);
    return role;
  }
  deleteRole(id: string): boolean {
    return this.store.roles.delete(id);
  }
  countEmployeesByRoleId(roleId: string): number {
    let count = 0;
    for (const e of this.store.employees.values()) if (e.roleId === roleId) count++;
    return count;
  }

  listEmployees(filters?: EmployeeListFilters): EmployeeRecord[] {
    const all = Array.from(this.store.employees.values());
    const filtered = filters ? all.filter((e) =>
      (!filters.roleId || e.roleId === filters.roleId) &&
      (!filters.status || e.status === filters.status),
    ) : all;
    return filtered.sort((a, b) => {
      const byName = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      return byName !== 0 ? byName : sortByDate(a, b);
    });
  }
  listEmployeesPaged(query: { filters?: EmployeeListFilters; cursor?: string; limit: number }): { items: EmployeeRecord[]; total: number; nextCursor: string | null } {
    // Sort matches the SQLite index: createdAt DESC, id DESC.
    const all = this.listEmployees(query.filters).sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    // Skip records strictly past the cursor in sort order (opaque token format: createdAt|id).
    let startIndex = 0;
    if (query.cursor) {
      const parts = query.cursor.split("|");
      const createdAt = parts[0];
      const id = parts[1];
      if (createdAt && id) {
        startIndex = all.findIndex(
          (r) => r.createdAt < createdAt || (r.createdAt === createdAt && r.id < id),
        );
      }
      if (startIndex < 0) startIndex = all.length;
    }
    const slice = all.slice(startIndex, startIndex + query.limit);
    const hasMore = startIndex + slice.length < all.length;
    const last = slice[slice.length - 1];
    const nextCursor = hasMore && last ? `${last.createdAt}|${last.id}` : null;
    return { items: slice, total: all.length, nextCursor };
  }
  getEmployeeById(id: string): EmployeeRecord | null {
    return this.store.employees.get(id) ?? null;
  }
  getEmployeeByPhone(phone: string): EmployeeRecord | null {
    for (const e of this.store.employees.values()) if (e.phone === phone) return e;
    return null;
  }
  createEmployee(data: EmployeeCreateData, audit?: MutationAuditContext): EmployeeRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const employee: EmployeeRecord = {
      id, firstName: data.firstName, lastName: data.lastName, phone: data.phone,
      roleId: data.roleId, status: data.status,
      salaryAmountDzd: data.salaryAmountDzd ?? null,
      salaryPeriod: data.salaryPeriod ?? null,
      notes: data.notes ?? null, createdAt: ts, updatedAt: ts,
    };
    this.store.employees.set(id, employee);
    this.insertStateHistory({ employeeId: id, roleId: data.roleId, status: data.status, salaryAmountDzd: data.salaryAmountDzd ?? null, salaryPeriod: data.salaryPeriod ?? null, eventType: "CREATED", startDate: ts, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    return employee;
  }
  createEmployeesBatch(data: EmployeeBatchCreateData[], audit?: MutationAuditContext): EmployeeBatchCreateResultRecord {
    const employees: EmployeeRecord[] = [];
    const managerAssignments: EmployeeManagerAssignmentRecord[] = [];
    const projectAssignments: EmployeeProjectAssignmentRecord[] = [];
    for (const row of data) {
      const e = this.createEmployee(row, audit);
      employees.push(e);
      if (row.managerId) managerAssignments.push(this.createManagerAssignment({ workerId: e.id, managerId: row.managerId, status: "ACTIVE", startDate: e.createdAt, endDate: null, notes: null }, audit));
      if (row.projectId) projectAssignments.push(this.createProjectAssignment({ employeeId: e.id, projectId: row.projectId, status: "ACTIVE", startDate: e.createdAt, endDate: null, notes: null }, audit));
    }
    return { employees, managerAssignments, projectAssignments };
  }
  updateEmployee(data: EmployeeUpdateData, audit?: MutationAuditContext): EmployeeRecord | null {
    const cur = this.store.employees.get(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = now();
    const employee = {
      ...cur,
      firstName: data.firstName ?? cur.firstName,
      lastName: data.lastName ?? cur.lastName,
      phone: data.phone ?? cur.phone,
      roleId: data.roleId ?? cur.roleId,
      status: data.status ?? cur.status,
      salaryAmountDzd: data.salaryAmountDzd !== undefined ? data.salaryAmountDzd : cur.salaryAmountDzd,
      salaryPeriod: data.salaryPeriod !== undefined ? data.salaryPeriod : cur.salaryPeriod,
      notes: data.notes !== undefined ? data.notes : cur.notes,
      updatedAt: ts,
    };
    this.store.employees.set(data.id, employee);
    if (data.status !== undefined || data.roleId !== undefined || data.salaryAmountDzd !== undefined || data.salaryPeriod !== undefined) {
      this.endActiveStateHistory(data.id, ts, a);
      this.insertStateHistory({ employeeId: data.id, roleId: data.roleId ?? cur.roleId, status: data.status ?? cur.status, salaryAmountDzd: data.salaryAmountDzd !== undefined ? data.salaryAmountDzd : cur.salaryAmountDzd, salaryPeriod: data.salaryPeriod !== undefined ? data.salaryPeriod : cur.salaryPeriod, eventType: "UPDATED", startDate: ts, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId });
    }
    return employee;
  }
  deleteEmployee(id: string): boolean {
    for (const [hid, h] of this.store.employeeStateHistory) if (h.employeeId === id) this.store.employeeStateHistory.delete(hid);
    return this.store.employees.delete(id);
  }
  upsertEmployee(data: EmployeeCreateData | (EmployeeUpdateData & { id: string })): EmployeeRecord {
    const withId = data as EmployeeUpdateData & { id: string };
    const existing = this.store.employees.get(withId.id);
    if (existing) {
      const r = this.updateEmployee(withId);
      if (!r) throw new Error(`Failed to upsert employee ${withId.id}`);
      return r;
    }
    const cd = data as EmployeeCreateData;
    if (!cd.firstName || !cd.lastName || !cd.phone || !cd.roleId || !cd.status) throw new Error("upsertEmployee: missing required fields");
    const id = (data as { id?: string }).id ?? newId();
    const ca = (data as { createdAt?: string }).createdAt ?? now();
    const ua = (data as { updatedAt?: string }).updatedAt ?? ca;
    const employee: EmployeeRecord = { id, firstName: cd.firstName, lastName: cd.lastName, phone: cd.phone, roleId: cd.roleId, status: cd.status, salaryAmountDzd: cd.salaryAmountDzd ?? null, salaryPeriod: cd.salaryPeriod ?? null, notes: cd.notes ?? null, createdAt: ca, updatedAt: ua };
    this.store.employees.set(id, employee);
    this.insertStateHistory({ employeeId: id, roleId: cd.roleId, status: cd.status, salaryAmountDzd: cd.salaryAmountDzd ?? null, salaryPeriod: cd.salaryPeriod ?? null, eventType: "CREATED", startDate: ca, notes: cd.notes ?? null, actorUserId: null, actorLabel: null, transactionId: null });
    return employee;
  }
  assignEmployeeWorkplace(data: EmployeeWorkplaceAssignmentData, audit?: MutationAuditContext): void {
    const a = normalizeAudit(audit);
    const ts = now();
    const am = this.getActiveManagerAssignmentByWorkerId(data.employeeId);
    const ap = this.getActiveProjectAssignmentByEmployeeId(data.employeeId);
    const aw = this.getActiveWarehouseAssignmentByEmployeeId(data.employeeId);
    if ((data.nextType === "PROJECT" && Boolean(ap) && ap?.projectId === data.projectId && am?.managerId === (data.managerId ?? null) && !aw) || (data.nextType === "WAREHOUSE" && Boolean(aw) && aw?.warehouseId === data.warehouseId && !am && !ap)) return;
    if (am && am.managerId !== (data.managerId ?? null)) this.endManagerAssignment({ id: am.id, endDate: ts, notes: data.notes ?? am.notes }, audit);
    if (ap) this.endProjectAssignment({ id: ap.id, endDate: ts, notes: data.notes ?? ap.notes }, audit);
    if (aw) this.endWarehouseAssignment({ id: aw.id, endDate: ts, notes: data.notes ?? aw.notes }, audit);
    if (data.nextType === "PROJECT" && data.projectId) {
      if (!am || am.managerId !== data.managerId) this.createManagerAssignment({ workerId: data.employeeId, managerId: data.managerId!, status: "ACTIVE", startDate: ts, endDate: null, notes: data.notes ?? null }, audit);
      this.createProjectAssignment({ employeeId: data.employeeId, projectId: data.projectId, status: "ACTIVE", startDate: ts, endDate: null, notes: data.notes ?? null }, audit);
    }
    if (data.nextType === "WAREHOUSE" && data.warehouseId) this.createWarehouseAssignment({ employeeId: data.employeeId, warehouseId: data.warehouseId, status: "ACTIVE", startDate: ts, endDate: null, notes: data.notes ?? null }, audit);
    void a;
  }
  syncManagedProjects(data: EmployeeManagedProjectsSyncData, audit?: MutationAuditContext): void {
    const a = normalizeAudit(audit);
    const ts = now();
    const current = this.listProjectsByManager(data.employeeId);
    const nextSet = new Set(data.projectIds);
    for (const p of current) if (!nextSet.has(p.id)) this.store.endActiveProjectManagerOwnershipHistory(p.id, ts, a);
    for (const pid of data.projectIds) {
      const p = this.store.projects.get(pid);
      if (p) { if (!current.some((c) => c.id === pid)) this.store.insertProjectManagerOwnershipHistory({ projectId: pid, managerId: data.employeeId, status: "ACTIVE", startDate: ts, notes: null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId }); this.store.projects.set(pid, { ...p, managerId: data.employeeId, updatedAt: ts }); }
    }
    for (const p of current) if (!nextSet.has(p.id)) this.store.projects.set(p.id, { ...p, managerId: null, updatedAt: ts });
  }
  syncManagedWarehouses(data: EmployeeManagedWarehousesSyncData, audit?: MutationAuditContext): void {
    const a = normalizeAudit(audit);
    const ts = now();
    const current = this.listWarehousesByManager(data.employeeId);
    const nextSet = new Set(data.warehouseIds);
    for (const w of current) if (!nextSet.has(w.id)) this.store.endActiveWarehouseManagerOwnershipHistory(w.id, ts, a);
    for (const wid of data.warehouseIds) {
      const w = this.store.warehouses.get(wid);
      if (w) { if (!current.some((c) => c.id === wid)) this.store.insertWarehouseManagerOwnershipHistory({ warehouseId: wid, managerId: data.employeeId, status: "ACTIVE", startDate: ts, notes: null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId }); this.store.warehouses.set(wid, { ...w, managerId: data.employeeId, updatedAt: ts }); }
    }
    for (const w of current) if (!nextSet.has(w.id)) this.store.warehouses.set(w.id, { ...w, managerId: null, updatedAt: ts });
  }

  listManagerAssignments(filters?: ManagerAssignmentListFilters): EmployeeManagerAssignmentRecord[] {
    const all = Array.from(this.store.managerAssignments.values());
    const filtered = filters ? all.filter((x) =>
      (!filters.workerId || x.workerId === filters.workerId) &&
      (!filters.managerId || x.managerId === filters.managerId) &&
      (!filters.status || x.status === filters.status),
    ) : all;
    return filtered.sort(sortByDate);
  }
  getManagerAssignmentById(id: string): EmployeeManagerAssignmentRecord | null {
    return this.store.managerAssignments.get(id) ?? null;
  }
  getActiveManagerAssignmentByWorkerId(workerId: string): EmployeeManagerAssignmentRecord | null {
    for (const x of this.store.managerAssignments.values()) if (x.workerId === workerId && x.status === "ACTIVE") return x;
    return null;
  }
  createManagerAssignment(data: ManagerAssignmentCreateData, audit?: MutationAuditContext): EmployeeManagerAssignmentRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record: EmployeeManagerAssignmentRecord = { id, workerId: data.workerId, managerId: data.managerId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.managerAssignments.set(id, record);
    return record;
  }
  endManagerAssignment(data: ManagerAssignmentEndData, audit?: MutationAuditContext): EmployeeManagerAssignmentRecord | null {
    const cur = this.store.managerAssignments.get(data.id);
    if (!cur) return null;
    if (cur.status !== "ACTIVE") return cur;
    const a = normalizeAudit(audit);
    const record = { ...cur, status: "ENDED" as const, endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: now() };
    this.store.managerAssignments.set(data.id, record);
    return record;
  }

  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters): EmployeeStateHistoryRecord[] {
    const all = Array.from(this.store.employeeStateHistory.values());
    const filtered = filters ? all.filter((h) => !filters.employeeId || h.employeeId === filters.employeeId) : all;
    return filtered.sort(sortByDate);
  }

  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters): EmployeeSalaryPaymentRecord[] {
    const all = Array.from(this.store.salaryPayments.values());
    const filtered = filters ? all.filter((p) => !filters.employeeId || p.employeeId === filters.employeeId) : all;
    return filtered.sort(sortByDate);
  }
  createSalaryPayment(data: EmployeeSalaryPaymentCreateData, audit?: MutationAuditContext): EmployeeSalaryPaymentRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record: EmployeeSalaryPaymentRecord = { id, employeeId: data.employeeId, periodType: data.periodType, expectedAmountDzd: data.expectedAmountDzd, actualAmountDzd: data.actualAmountDzd, paymentDate: data.paymentDate, note: data.note ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.salaryPayments.set(id, record);
    return record;
  }

  // ---------------------------------------------------------------------
  // Cross-domain helpers (shared store access)
  // ---------------------------------------------------------------------

  getActiveProjectAssignmentByEmployeeId(employeeId: string): EmployeeProjectAssignmentRecord | null {
    for (const x of this.store.projectAssignments.values()) if (x.employeeId === employeeId && x.status === "ACTIVE") return x;
    return null;
  }
  getActiveWarehouseAssignmentByEmployeeId(employeeId: string): EmployeeWarehouseAssignmentRecord | null {
    for (const x of this.store.warehouseAssignments.values()) if (x.employeeId === employeeId && x.status === "ACTIVE") return x;
    return null;
  }
  createProjectAssignment(data: ProjectAssignmentCreateData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record = { id, employeeId: data.employeeId, projectId: data.projectId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.projectAssignments.set(id, record);
    return record;
  }
  endProjectAssignment(data: ProjectAssignmentEndData, audit?: MutationAuditContext): EmployeeProjectAssignmentRecord | null {
    const cur = this.store.projectAssignments.get(data.id);
    if (!cur) return null;
    if (cur.status !== "ACTIVE") return cur;
    const a = normalizeAudit(audit);
    const record = { ...cur, status: "ENDED" as const, endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: now() };
    this.store.projectAssignments.set(data.id, record);
    return record;
  }
  createWarehouseAssignment(data: WarehouseAssignmentCreateData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record = { id, employeeId: data.employeeId, warehouseId: data.warehouseId, status: data.status, startDate: data.startDate, endDate: data.endDate ?? null, notes: data.notes ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.warehouseAssignments.set(id, record);
    return record;
  }
  endWarehouseAssignment(data: WarehouseAssignmentEndData, audit?: MutationAuditContext): EmployeeWarehouseAssignmentRecord | null {
    const cur = this.store.warehouseAssignments.get(data.id);
    if (!cur) return null;
    if (cur.status !== "ACTIVE") return cur;
    const a = normalizeAudit(audit);
    const record = { ...cur, status: "ENDED" as const, endDate: data.endDate, notes: data.notes ?? cur.notes, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: now() };
    this.store.warehouseAssignments.set(data.id, record);
    return record;
  }

  private listProjectsByManager(managerId: string) {
    return Array.from(this.store.projects.values()).filter((p) => p.managerId === managerId);
  }
  private listWarehousesByManager(managerId: string) {
    return Array.from(this.store.warehouses.values()).filter((w) => w.managerId === managerId);
  }
  private insertStateHistory(data: Omit<EmployeeStateHistoryRecord, "id" | "endDate" | "createdAt" | "updatedAt">) {
    const id = newId();
    this.store.employeeStateHistory.set(id, { id, ...data, endDate: null, createdAt: data.startDate, updatedAt: data.startDate });
  }
  private endActiveStateHistory(employeeId: string, endDate: string, a: AuditSnapshot) {
    for (const [hid, h] of this.store.employeeStateHistory) {
      if (h.employeeId === employeeId && !h.endDate) {
        this.store.employeeStateHistory.set(hid, { ...h, endDate, ...a, updatedAt: endDate });
        break;
      }
    }
  }
}
