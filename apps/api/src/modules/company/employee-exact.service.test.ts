import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { exactWorkforceSchemaStatements } from "./adapters/exact-workforce-schema";
import { SqliteExactEmployeeRepository } from "./adapters/sqlite-exact-employee.repository";
import { ExactEmployeeService } from "./employee-exact.service";

const license = vi.hoisted(() => ({ status: "trial", maxUsers: 0 }));
vi.mock("../../infrastructure/license", () => ({ getLicenseInfo: () => license }));
beforeEach(() => { license.status = "trial"; license.maxUsers = 0; });
const now = "2026-11-01T00:00:00.000Z";
const audit = { actorUserId: "owner", actorLabel: "Owner", transactionId: "00000000-0000-4000-8000-000000000001" };
function fixture(key: string) {
  const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-exact-employee-service-")), "fixture.sqlite"), key);
  db.pragma("foreign_keys=ON");
  db.exec(`CREATE TABLE role(id TEXT PRIMARY KEY,key TEXT,name TEXT,description TEXT,is_system INTEGER,created_at TEXT,updated_at TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE project(id TEXT PRIMARY KEY,manager_id TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE warehouse(id TEXT PRIMARY KEY,manager_id TEXT,status TEXT,updated_at TEXT);
    CREATE TABLE project_manager_ownership_history(id TEXT PRIMARY KEY,project_id TEXT,manager_id TEXT,status TEXT,start_date TEXT,end_date TEXT,notes TEXT,actor_user_id TEXT,actor_label TEXT,transaction_id TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE warehouse_manager_ownership_history(id TEXT PRIMARY KEY,warehouse_id TEXT,manager_id TEXT,status TEXT,start_date TEXT,end_date TEXT,notes TEXT,actor_user_id TEXT,actor_label TEXT,transaction_id TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE employee_manager_assignment(id TEXT PRIMARY KEY,worker_id TEXT,manager_id TEXT,status TEXT,start_date TEXT,end_date TEXT,notes TEXT,actor_user_id TEXT,actor_label TEXT,transaction_id TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE employee_project_assignment(id TEXT PRIMARY KEY,employee_id TEXT,project_id TEXT,status TEXT,start_date TEXT,end_date TEXT,notes TEXT,actor_user_id TEXT,actor_label TEXT,transaction_id TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE employee_warehouse_assignment(id TEXT PRIMARY KEY,employee_id TEXT,warehouse_id TEXT,status TEXT,start_date TEXT,end_date TEXT,notes TEXT,actor_user_id TEXT,actor_label TEXT,transaction_id TEXT,created_at TEXT,updated_at TEXT);
    INSERT INTO role VALUES ('worker-role','worker','Worker',NULL,1,'${now}','${now}'),('admin-role','admin','Administrator',NULL,1,'${now}','${now}'),('pm-role','project_manager','Project manager',NULL,1,'${now}','${now}'),('wm-role','warehouse_manager','Warehouse manager',NULL,1,'${now}','${now}')`);
  for (const sql of exactWorkforceSchemaStatements) db.exec(sql);
  let id = 0;
  const dependencies = { id: () => `id-${++id}`, now: () => now };
  const repository = new SqliteExactEmployeeRepository(db, createFifoLock(), dependencies);
  const service = new ExactEmployeeService(repository, dependencies, { isBootstrapOwner: user => user === "owner" });
  return { db, repository, service };
}

describe.each([["plain", ""], ["keyed", "527-employee-service-public-fixture-key"]])("exact employee service %s", (_kind, key) => {
  it("enforces purchased active-seat limits on create, batch and reactivation without charging inactive profiles", () => {
    const f = fixture(key);
    try {
      license.status = "active"; license.maxUsers = 1;
      const active = f.service.createEmployee({ firstName: "First", lastName: "Manager", phone: "0550000000", roleId: "pm-role" }, audit).item;
      const inactive = f.service.createEmployee({ firstName: "Other", lastName: "Manager", phone: "0550000001", roleId: "pm-role", status: "INACTIVE" }, audit).item;
      expect(() => f.service.createEmployee({ firstName: "Third", lastName: "Manager", phone: "0550000002", roleId: "pm-role" }, audit)).toThrow();
      expect(() => f.service.createEmployeesBatch({ employees: [{ firstName: "Third", lastName: "Manager", phone: "0550000002", roleId: "pm-role" }] }, audit)).toThrow();
      expect(() => f.service.updateEmployee({ id: inactive.id, status: "ACTIVE" }, audit)).toThrow();
      expect(f.service.listEmployees().items).toHaveLength(2);
      f.service.updateEmployee({ id: active.id, status: "INACTIVE" }, audit);
      expect(f.service.updateEmployee({ id: inactive.id, status: "ACTIVE" }, audit).item.status).toBe("ACTIVE");
    } finally { f.db.close(); }
  });

  it("moves an actual worker between project and warehouse, keeps ended history and synchronizes warehouse ownership", () => {
    const f = fixture(key);
    try {
      const worker = f.service.createEmployee({ firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role" }, audit).item;
      const manager = f.service.createEmployee({ firstName: "Warehouse", lastName: "Manager", phone: "0550000001", roleId: "wm-role" }, audit).item;
      f.db.prepare("INSERT INTO warehouse(id,manager_id,status) VALUES ('warehouse',NULL,'ACTIVE')").run();
      f.service.syncManagedWarehouses({ employeeId: manager.id, warehouseIds: ["warehouse"] }, audit);
      f.service.saveEmployee({ id: worker.id, placement: { nextType: "WAREHOUSE", warehouseId: "warehouse" } }, audit);
      f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: "warehouse" }, audit);
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_warehouse_assignment").get()).toEqual({ count: 1 });
      expect(() => f.service.syncManagedWarehouses({ employeeId: manager.id, warehouseIds: [] }, audit)).toThrow();
      f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "NONE" }, audit);
      f.service.saveEmployee({ id: manager.id, managedWarehouseIds: [] }, audit);
      expect(f.db.prepare("SELECT manager_id AS managerId FROM warehouse").get()).toEqual({ managerId: null });
      expect(f.db.prepare("SELECT status,end_date AS endDate FROM warehouse_manager_ownership_history").all()).toEqual([{ status: "ENDED", endDate: now }]);
    } finally { f.db.close(); }
  });

  it("deletes only an unreferenced profile and refuses erasing any actual work history", () => {
    const f = fixture(key);
    try {
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000001", roleId: "pm-role" }, audit).item;
      const worker = f.service.createEmployee({ firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role" }, audit).item;
      expect(f.service.deleteEmployee(worker.id, audit)).toMatchObject({ success: true });
      expect(f.repository.getEmployeeById(worker.id)).toBeNull();
      expect(f.repository.listEmployeeStateHistory(worker.id)).toEqual([]);
      const replacement = f.service.createEmployee({ firstName: "Other", lastName: "Worker", phone: "0550000000", roleId: "worker-role" }, audit).item;
      f.db.prepare("INSERT INTO employee_manager_assignment(id,worker_id,manager_id,status) VALUES ('old-link',?,?,'ENDED')").run(replacement.id, manager.id);
      expect(() => f.service.deleteEmployee(replacement.id, audit)).toThrow();
      expect(() => f.service.deleteEmployee(manager.id, audit)).toThrow();
      expect(f.repository.getEmployeeById(replacement.id)).toEqual(replacement);
      expect(() => f.service.deleteEmployee("missing", audit)).toThrow();
    } finally { f.db.close(); }
  });

  it("pages actual exact profiles by stable native cursor with filters before counts and no rounded reference values", () => {
    const f = fixture(key);
    try {
      for (const [index, name] of ["Alpha", "Beta", "Gamma"].entries()) f.service.createEmployee({ firstName: name, lastName: "Worker", phone: `055000000${index}`, roleId: "worker-role", salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" } }, audit);
      const first = f.service.listEmployeesPaged({ limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.total).toBe(3);
      expect(first.hasMore).toBe(true);
      const second = f.service.listEmployeesPaged({ limit: 2, cursor: first.nextCursor! });
      expect(second.items).toHaveLength(1);
      expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(3);
      expect(second.nextCursor).toBeNull();
      expect(f.service.listEmployeesPaged({ search: "beta", limit: 1 })).toMatchObject({ items: [{ firstName: "Beta", salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" } }], total: 1, hasMore: false, nextCursor: null });
      expect(() => f.service.listEmployeesPaged({ cursor: "invalid" })).toThrow();
    } finally { f.db.close(); }
  });

  it("creates exact batch profiles and placements atomically, reports row errors and rolls back later history failures", () => {
    const f = fixture(key);
    try {
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000001", roleId: "pm-role" }, audit).item;
      f.db.prepare("INSERT INTO project(id,manager_id,status) VALUES ('project',?,'ACTIVE')").run(manager.id);
      const profile = { firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role", salaryReference: { period: "DAILY" as const, amount: "0.0001" }, managerId: manager.id, projectId: "project" };
      const result = f.service.createEmployeesBatch({ employees: [profile] }, audit);
      expect(result.item.employees).toMatchObject([{ salaryReference: { period: "DAILY", amount: "0.0001" } }]);
      expect(result.item.managerAssignments).toMatchObject([{ workerId: result.item.employees[0]!.id, managerId: manager.id, status: "ACTIVE" }]);
      expect(result.item.projectAssignments).toMatchObject([{ employeeId: result.item.employees[0]!.id, projectId: "project", status: "ACTIVE" }]);
      expect(() => f.service.createEmployeesBatch({ employees: [{ ...profile, phone: "0550000002", projectId: "missing" }] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "VALIDATION", fieldErrors: expect.arrayContaining([expect.objectContaining({ field: "employees.0.projectId" })]) }) }));
      expect(f.repository.getEmployeeByPhone("0550000002")).toBeNull();
      f.db.exec("CREATE TRIGGER fail_second_employee BEFORE INSERT ON employee_state_history WHEN (SELECT phone FROM employee WHERE id=NEW.employee_id)='0550000003' BEGIN SELECT RAISE(ABORT,'batch history failure'); END");
      expect(() => f.service.createEmployeesBatch({ employees: [{ ...profile, phone: "0550000002" }, { ...profile, phone: "0550000003" }] }, audit)).toThrow("batch history failure");
      expect(f.repository.getEmployeeByPhone("0550000002")).toBeNull();
      expect(f.repository.getEmployeeByPhone("0550000003")).toBeNull();
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_project_assignment").get()).toEqual({ count: 1 });
    } finally { f.db.close(); }
  });

  it("saves manager scope with audited ownership and refuses scope removal while active workers depend on it", () => {
    const f = fixture(key);
    try {
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000001", roleId: "pm-role" }, audit).item;
      f.db.prepare("INSERT INTO project(id,manager_id,status) VALUES ('project',NULL,'ACTIVE')").run();
      f.service.saveEmployee({ id: manager.id, managedProjectIds: ["project"] }, audit);
      expect(f.db.prepare("SELECT manager_id AS managerId FROM project").get()).toEqual({ managerId: manager.id });
      expect(f.db.prepare("SELECT manager_id AS managerId,status,actor_user_id AS actorUserId FROM project_manager_ownership_history").all()).toEqual([{ managerId: manager.id, status: "ACTIVE", actorUserId: "owner" }]);
      const worker = f.service.createEmployee({ firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role" }, audit).item;
      f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: "project" }, audit);
      expect(() => f.service.saveEmployee({ id: manager.id, firstName: "Must roll back", managedProjectIds: [] }, audit)).toThrow();
      expect(f.service.getEmployee(manager.id).item.firstName).toBe("Project");
      f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "NONE" }, audit);
      f.service.syncManagedProjects({ employeeId: manager.id, projectIds: [] }, audit);
      expect(f.db.prepare("SELECT manager_id AS managerId FROM project").get()).toEqual({ managerId: null });
      expect(f.db.prepare("SELECT status,end_date AS endDate FROM project_manager_ownership_history").all()).toEqual([{ status: "ENDED", endDate: now }]);
    } finally { f.db.close(); }
  });

  it("saves profile and actual workplace together, preserves omitted placement and rolls back invalid placement", () => {
    const f = fixture(key);
    try {
      const worker = f.service.createEmployee({ firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role" }, audit).item;
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000001", roleId: "pm-role" }, audit).item;
      f.db.prepare("INSERT INTO project(id,manager_id,status) VALUES ('project',?,'ACTIVE')").run(manager.id);
      expect(() => f.service.saveEmployee({ id: worker.id, firstName: "Must roll back", placement: { nextType: "PROJECT", managerId: manager.id, projectId: "missing" } }, audit)).toThrow();
      expect(f.service.getEmployee(worker.id).item.firstName).toBe("First");
      expect(f.service.saveEmployee({ id: worker.id, firstName: "Saved", placement: { nextType: "PROJECT", managerId: manager.id, projectId: "project" } }, audit).item.firstName).toBe("Saved");
      expect(f.db.prepare("SELECT employee_id AS employeeId,project_id AS projectId,status,actor_user_id AS actorUserId,transaction_id AS transactionId FROM employee_project_assignment").all()).toEqual([{ employeeId: worker.id, projectId: "project", status: "ACTIVE", actorUserId: "owner", transactionId: audit.transactionId }]);
      f.service.saveEmployee({ id: worker.id, salaryReference: { period: "DAILY", amount: "0.0001" } }, audit);
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_project_assignment WHERE status='ACTIVE'").get()).toEqual({ count: 1 });
      expect(f.service.getEmployee(worker.id).item.salaryReference).toEqual({ period: "DAILY", amount: "0.0001" });
      f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "NONE" }, audit);
      expect(f.db.prepare("SELECT status,end_date AS endDate FROM employee_project_assignment").all()).toEqual([{ status: "ENDED", endDate: now }]);
    } finally { f.db.close(); }
  });

  it("updates exact references without erasing omitted fields and refuses linked-worker deactivation atomically", () => {
    const f = fixture(key);
    try {
      const worker = f.service.createEmployee({ firstName: "First", lastName: "Worker", phone: "0550000000", roleId: "worker-role", salaryReference: { period: "DAILY", amount: "0.0001" } }, audit).item;
      const edited = f.service.updateEmployee({ id: worker.id, notes: "profile-only" }, audit).item;
      expect(edited.salaryReference).toEqual({ period: "DAILY", amount: "0.0001" });
      expect(f.service.listEmployeeStateHistory({ employeeId: worker.id }).items).toHaveLength(1);
      const cleared = f.service.updateEmployee({ id: worker.id, salaryReference: null }, audit).item;
      expect(cleared.salaryReference).toBeNull();
      expect(cleared.notes).toBe("profile-only");
      const zero = f.service.updateEmployee({ id: worker.id, salaryReference: { period: "MONTHLY", amount: "0" } }, audit).item;
      expect(zero.salaryReference).toEqual({ period: "MONTHLY", amount: "0.00" });
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000001", roleId: "pm-role" }, audit).item;
      f.db.prepare("INSERT INTO employee_manager_assignment(id,worker_id,manager_id,status) VALUES ('link',?,?,'ACTIVE')").run(worker.id, manager.id);
      expect(() => f.service.updateEmployee({ id: worker.id, status: "INACTIVE", notes: "must roll back" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(f.service.getEmployee(worker.id).item).toEqual(zero);
      expect(f.service.listEmployeeStateHistory({ employeeId: worker.id }).items).toHaveLength(3);
    } finally { f.db.close(); }
  });

  it("reads exact profiles and history with existing filters, name ordering and missing-employee errors", () => {
    const f = fixture(key);
    try {
      const beta = f.service.createEmployee({ firstName: "Beta", lastName: "Worker", phone: "0550000000", roleId: "worker-role", salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" } }, audit).item;
      const alpha = f.service.createEmployee({ firstName: "Alpha", lastName: "Worker", phone: "0550000001", roleId: "worker-role", status: "INACTIVE" }, audit).item;
      expect(f.service.listEmployees().items).toEqual([alpha, beta]);
      expect(f.service.listEmployees({ status: "INACTIVE" }).items).toEqual([alpha]);
      expect(f.service.getEmployee(beta.id).item).toEqual(beta);
      expect(f.service.listEmployeeStateHistory({ employeeId: beta.id }).items).toMatchObject([{ salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" } }]);
      expect(f.service.listEmployeeStateHistory().items).toHaveLength(2);
      expect(() => f.service.getEmployee("missing")).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "NOT_FOUND" }) }));
    } finally { f.db.close(); }
  });

  it("creates a real exact profile and audited state history under the existing role and owner rules", () => {
    const f = fixture(key);
    try {
      const result = f.service.createEmployee({ firstName: " First ", lastName: " Worker ", phone: "0550000000", roleId: "worker-role", salaryReference: { period: "DAILY", amount: "0.0001" } }, audit);
      expect(result).toMatchObject({ success: true, item: { firstName: "First", lastName: "Worker", roleId: "worker-role", status: "ACTIVE", salaryReference: { period: "DAILY", amount: "0.0001" }, currency: "DZD", notes: null, occupation: null, createdAt: now, updatedAt: now } });
      expect(f.repository.listEmployeeStateHistory(result.item.id)).toMatchObject([{ eventType: "CREATED", salaryReference: { period: "DAILY", amount: "0.0001" }, actorUserId: "owner", transactionId: audit.transactionId }]);
      expect(() => f.service.createEmployee({ firstName: "Other", lastName: "Worker", phone: "0550000001", roleId: "admin-role" }, { ...audit, actorUserId: "non-owner" })).toThrow();
      expect(f.repository.getEmployeeByPhone("0550000001")).toBeNull();
    } finally { f.db.close(); }
  });
});
