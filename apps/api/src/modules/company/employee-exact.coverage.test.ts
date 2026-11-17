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

const now = "2026-11-01T00:00:00.000Z";
const audit = { actorUserId: "owner", actorLabel: "Owner", transactionId: "00000000-0000-4000-8000-000000000001" };

function fixture(isBootstrapOwner: (user: string) => boolean = user => user === "owner") {
  const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-employee-coverage-")), "fixture.sqlite"), "");
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
  const dependencies = { id: () => `coverage-${++id}`, now: () => now };
  const repository = new SqliteExactEmployeeRepository(db, createFifoLock(), dependencies);
  const service = new ExactEmployeeService(repository, dependencies, { isBootstrapOwner });
  return { db, repository, service };
}

beforeEach(() => { license.status = "trial"; license.maxUsers = 0; });

describe("exact employee batch validation", () => {
  it("defaults paged filters and saves a profile without clearing an active warehouse placement", () => {
    const f = fixture();
    try {
      expect(f.service.listEmployeesPaged()).toMatchObject({ items: [], total: 0, hasMore: false, nextCursor: null });
      const worker = f.service.createEmployee({ firstName: "Warehouse", lastName: "Worker", phone: "0550000010", roleId: "worker-role" }, audit).item;
      const manager = f.service.createEmployee({ firstName: "Warehouse", lastName: "Manager", phone: "0550000011", roleId: "wm-role" }, audit).item;
      expect(() => f.service.saveEmployee({ id: worker.id, firstName: "Rejected" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(f.service.getEmployee(worker.id).item.firstName).toBe("Warehouse");
      f.db.prepare("INSERT INTO warehouse(id,manager_id,status) VALUES ('active-warehouse',NULL,'ACTIVE')").run();
      f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: "active-warehouse" }, audit);
      expect(f.service.saveEmployee({ id: worker.id, firstName: "Saved" }, audit).item.firstName).toBe("Saved");
      expect(f.service.saveEmployee({ id: manager.id, notes: "profile-only" }, audit).item.notes).toBe("profile-only");
      expect(f.db.prepare("SELECT warehouse_id AS warehouseId,status FROM employee_warehouse_assignment WHERE employee_id=?").all(worker.id)).toEqual([{ warehouseId: "active-warehouse", status: "ACTIVE" }]);
    } finally { f.db.close(); }
  });

  it("rejects manager scope changes for the wrong manager, missing resources, or resources owned elsewhere", () => {
    const f = fixture();
    try {
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000012", roleId: "pm-role" }, audit).item;
      const otherManager = f.service.createEmployee({ firstName: "Other", lastName: "Manager", phone: "0550000013", roleId: "pm-role" }, audit).item;
      const warehouseManager = f.service.createEmployee({ firstName: "Warehouse", lastName: "Manager", phone: "0550000014", roleId: "wm-role" }, audit).item;
      const worker = f.service.createEmployee({ firstName: "Plain", lastName: "Worker", phone: "0550000015", roleId: "worker-role" }, audit).item;
      const inactiveManager = f.service.createEmployee({ firstName: "Inactive", lastName: "Manager", phone: "0550000016", roleId: "pm-role", status: "INACTIVE" }, audit).item;
      f.db.prepare("INSERT INTO project(id,manager_id,status) VALUES ('inactive-owned',?,'INACTIVE'),('other-owned',?,'ACTIVE')").run(manager.id, otherManager.id);

      expect(() => f.service.syncManagedProjects({ employeeId: worker.id, projectIds: [] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.syncManagedProjects({ employeeId: inactiveManager.id, projectIds: [] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.syncManagedProjects({ employeeId: manager.id, projectIds: ["missing"] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "NOT_FOUND" }) }));
      expect(() => f.service.syncManagedProjects({ employeeId: manager.id, projectIds: ["other-owned"] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(f.service.syncManagedProjects({ employeeId: manager.id, projectIds: ["inactive-owned"] }, audit).success).toBe(true);
      expect(() => f.service.syncManagedWarehouses({ employeeId: warehouseManager.id, warehouseIds: ["missing"] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "NOT_FOUND" }) }));
    } finally { f.db.close(); }
  });

  it("accepts an inactive profile without creating an active placement", () => {
    const f = fixture();
    try {
      const result = f.service.createEmployeesBatch({ employees: [{ firstName: "Inactive", lastName: "Worker", phone: "0550000017", roleId: "worker-role", status: "INACTIVE" }] }, audit);
      expect(result.item.employees).toMatchObject([{ status: "INACTIVE", roleId: "worker-role" }]);
      expect(result.item.managerAssignments).toEqual([]);
      expect(result.item.projectAssignments).toEqual([]);
    } finally { f.db.close(); }
  });

  it("rejects each incomplete or invalid project and warehouse placement before writing a relationship", () => {
    const f = fixture();
    try {
      const worker = f.service.createEmployee({ firstName: "Active", lastName: "Worker", phone: "0550000020", roleId: "worker-role" }, audit).item;
      const inactiveWorker = f.service.createEmployee({ firstName: "Inactive", lastName: "Worker", phone: "0550000021", roleId: "worker-role", status: "INACTIVE" }, audit).item;
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000022", roleId: "pm-role" }, audit).item;
      const otherManager = f.service.createEmployee({ firstName: "Other", lastName: "Manager", phone: "0550000023", roleId: "pm-role" }, audit).item;
      const inactiveManager = f.service.createEmployee({ firstName: "Inactive", lastName: "Manager", phone: "0550000024", roleId: "pm-role", status: "INACTIVE" }, audit).item;
      f.service.createEmployee({ firstName: "Warehouse", lastName: "Manager", phone: "0550000025", roleId: "wm-role" }, audit);
      f.db.prepare("INSERT INTO project(id,manager_id,status) VALUES ('active-project',?,'ACTIVE'),('inactive-project',?,'INACTIVE'),('other-project',?,'ACTIVE')").run(manager.id, manager.id, otherManager.id);
      f.db.prepare("INSERT INTO warehouse(id,manager_id,status) VALUES ('inactive-warehouse',NULL,'INACTIVE')").run();

      expect(() => f.service.assignEmployeeWorkplace({ employeeId: inactiveWorker.id, nextType: "NONE" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: manager.id, nextType: "NONE" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "VALIDATION" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT", managerId: inactiveManager.id, projectId: "active-project" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT", managerId: manager.id }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "VALIDATION" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: "missing-project" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "NOT_FOUND" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: "inactive-project" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "PROJECT", managerId: manager.id, projectId: "other-project" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "WAREHOUSE" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "VALIDATION" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: "missing-warehouse" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "NOT_FOUND" }) }));
      expect(() => f.service.assignEmployeeWorkplace({ employeeId: worker.id, nextType: "WAREHOUSE", warehouseId: "inactive-warehouse" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_project_assignment").get()).toEqual({ count: 0 });
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_warehouse_assignment").get()).toEqual({ count: 0 });
    } finally { f.db.close(); }
  });

  it("reports row-specific batch role, placement, manager, and project failures together", () => {
    const f = fixture();
    try {
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000030", roleId: "pm-role" }, audit).item;
      const inactiveManager = f.service.createEmployee({ firstName: "Inactive", lastName: "Manager", phone: "0550000031", roleId: "pm-role", status: "INACTIVE" }, audit).item;
      const wrongRoleManager = f.service.createEmployee({ firstName: "Not", lastName: "Manager", phone: "0550000032", roleId: "worker-role" }, audit).item;
      f.db.prepare("INSERT INTO project(id,manager_id,status) VALUES ('active-project',?,'ACTIVE'),('inactive-project',?,'INACTIVE'),('other-project',?,'ACTIVE')").run(manager.id, manager.id, wrongRoleManager.id);
      expect(() => f.service.createEmployeesBatch({ employees: [
        { firstName: "Bad", lastName: "Role", phone: "0550000033", roleId: "wm-role", managerId: manager.id, projectId: "active-project" },
        { firstName: "Inactive", lastName: "Worker", phone: "0550000034", roleId: "worker-role", status: "INACTIVE", managerId: manager.id },
        { firstName: "No", lastName: "Placement", phone: "0550000035", roleId: "worker-role" },
        { firstName: "Wrong", lastName: "Manager", phone: "0550000036", roleId: "worker-role", managerId: wrongRoleManager.id, projectId: "active-project" },
        { firstName: "Inactive", lastName: "Manager", phone: "0550000037", roleId: "worker-role", managerId: inactiveManager.id, projectId: "active-project" },
        { firstName: "Missing", lastName: "Project", phone: "0550000038", roleId: "worker-role", managerId: manager.id, projectId: "missing-project" },
        { firstName: "Inactive", lastName: "Project", phone: "0550000039", roleId: "worker-role", managerId: manager.id, projectId: "inactive-project" },
        { firstName: "Other", lastName: "Project", phone: "0550000040", roleId: "worker-role", managerId: manager.id, projectId: "other-project" },
        { firstName: "No", lastName: "Project", phone: "0550000043", roleId: "worker-role", managerId: manager.id },
        { firstName: "Duplicate", lastName: "Phone", phone: manager.phone, roleId: "pm-role" },
      ] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "VALIDATION", fieldErrors: expect.arrayContaining([
        expect.objectContaining({ field: "employees.0.managerId" }), expect.objectContaining({ field: "employees.0.projectId" }),
        expect.objectContaining({ field: "employees.1.managerId" }), expect.objectContaining({ field: "employees.2.managerId" }),
        expect.objectContaining({ field: "employees.2.projectId" }), expect.objectContaining({ field: "employees.3.managerId" }),
        expect.objectContaining({ field: "employees.4.managerId" }), expect.objectContaining({ field: "employees.5.projectId" }),
        expect.objectContaining({ field: "employees.6.projectId" }), expect.objectContaining({ field: "employees.7.projectId" }),
        expect.objectContaining({ field: "employees.8.projectId" }), expect.objectContaining({ field: "employees.9.phone" }),
      ]) }) }));
      expect(f.service.listEmployees().items).toHaveLength(3);
      for (const phone of ["0550000033", "0550000034", "0550000035", "0550000036", "0550000037", "0550000038", "0550000039", "0550000040", "0550000043"]) expect(f.repository.getEmployeeByPhone(phone)).toBeNull();
    } finally { f.db.close(); }
  });

  it("propagates repository faults from batch role lookup and rejects duplicate create phones", () => {
    const f = fixture();
    try {
      const failure = new Error("role lookup unavailable");
      vi.spyOn(f.repository, "getRoleById").mockImplementationOnce(() => { throw failure; });
      expect(() => f.service.createEmployeesBatch({ employees: [{ firstName: "First", lastName: "Worker", phone: "0550000041", roleId: "worker-role" }] }, audit)).toThrow(failure);
      const existing = f.service.createEmployee({ firstName: "First", lastName: "Manager", phone: "0550000042", roleId: "pm-role" }, audit).item;
      expect(() => f.service.createEmployee({ firstName: "Duplicate", lastName: "Phone", phone: existing.phone, roleId: "pm-role" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "CONFLICT" }) }));
      expect(f.service.listEmployees().items).toEqual([existing]);
    } finally { f.db.close(); }
  });
  it("returns precise row errors for unknown roles, inactive placements, and missing managers without creating profiles", () => {
    const f = fixture();
    try {
      expect(() => f.service.createEmployeesBatch({ employees: [
        { firstName: "Bad", lastName: "Role", phone: "0550000001", roleId: "missing-role" },
        { firstName: "Inactive", lastName: "Worker", phone: "0550000002", roleId: "worker-role", status: "INACTIVE", managerId: "manager", projectId: "project" },
        { firstName: "Active", lastName: "Worker", phone: "0550000003", roleId: "worker-role", managerId: "missing-manager", projectId: "project" },
      ] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({
        code: "VALIDATION",
        fieldErrors: expect.arrayContaining([
          expect.objectContaining({ field: "employees.0.roleId" }),
          expect.objectContaining({ field: "employees.1.projectId" }),
          expect.objectContaining({ field: "employees.2.managerId" }),
        ]),
      }) }));
      expect(f.service.listEmployees().items).toEqual([]);
      expect(f.repository.getEmployeeByPhone("0550000001")).toBeNull();
      expect(f.repository.getEmployeeByPhone("0550000002")).toBeNull();
      expect(f.repository.getEmployeeByPhone("0550000003")).toBeNull();
    } finally { f.db.close(); }
  });

  it("rejects admin assignment if the bootstrap-owner grant is revoked during batch validation", () => {
    let checks = 0;
    const f = fixture(user => user === "owner" && ++checks === 1);
    try {
      expect(() => f.service.createEmployeesBatch({ employees: [
        { firstName: "Attempt", lastName: "Admin", phone: "0550000004", roleId: "admin-role" },
      ] }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "UNAUTHORIZED" }) }));
      expect(checks).toBe(2);
      expect(f.service.listEmployees().items).toEqual([]);
    } finally { f.db.close(); }
  });

  it("rejects direct active worker-role conversion after link checks and preserves profile and history", () => {
    const f = fixture();
    const refusal = {
      appError: {
        code: "BUSINESS_RULE",
        message: "يجب أولًا حفظ المشروع والمدير المباشر للعامل قبل تحويل دوره إلى عامل نشط.",
        fieldErrors: [{ field: "roleId", message: "يجب أولًا حفظ المشروع والمدير المباشر للعامل قبل تحويل دوره إلى عامل نشط." }],
      },
    };
    try {
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000005", roleId: "pm-role" }, audit).item;
      const historyBefore = f.db.prepare("SELECT count(*) AS count FROM employee_state_history WHERE employee_id=?").get(manager.id);
      expect(() => f.service.updateEmployee({ id: manager.id, roleId: "worker-role" }, audit)).toThrow(expect.objectContaining(refusal));
      expect(f.service.getEmployee(manager.id).item.roleId).toBe("pm-role");
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_state_history WHERE employee_id=?").get(manager.id)).toEqual(historyBefore);

      f.db.prepare("INSERT INTO project(id,manager_id,status) VALUES ('managed-active-project',?,'ACTIVE')").run(manager.id);
      expect(() => f.service.updateEmployee({ id: manager.id, roleId: "worker-role" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({
        code: "BUSINESS_RULE",
        message: "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين أو يرتبط بموقع عمل نشط.",
        fieldErrors: [{ field: "status", message: "لا يمكن تغيير حالة مدير المشروع أو دوره ما دام يدير مشاريع أو عمالًا نشطين أو يرتبط بموقع عمل نشط." }],
      }) }));
      expect(f.service.getEmployee(manager.id).item.roleId).toBe("pm-role");

      f.db.prepare("UPDATE project SET status='INACTIVE' WHERE id='managed-active-project'").run();
      const inactive = f.service.updateEmployee({ id: manager.id, roleId: "worker-role", status: "INACTIVE" }, audit).item;
      expect(inactive).toMatchObject({ roleId: "worker-role", status: "INACTIVE" });
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_manager_assignment WHERE worker_id=?").get(manager.id)).toEqual({ count: 0 });
      expect(f.db.prepare("SELECT count(*) AS count FROM employee_project_assignment WHERE employee_id=?").get(manager.id)).toEqual({ count: 0 });

      const other = f.service.createEmployee({ firstName: "Other", lastName: "Manager", phone: "0550000006", roleId: "worker-role" }, audit).item;
      expect(f.service.updateEmployee({ id: other.id, firstName: "Profile only" }, audit).item.firstName).toBe("Profile only");
      expect(f.service.updateEmployee({ id: manager.id, phone: manager.phone, occupation: null }, audit).item.phone).toBe(manager.phone);
      expect(() => f.service.updateEmployee({ id: other.id, phone: manager.phone }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "CONFLICT" }) }));
      expect(f.service.updateEmployee({ id: other.id, phone: "0550000007" }, audit).item.phone).toBe("0550000007");
      expect(() => f.service.createEmployee({ firstName: "Duplicate", lastName: "Phone", phone: manager.phone, roleId: "pm-role" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "CONFLICT" }) }));
      expect(f.service.getEmployee(other.id).item.phone).toBe("0550000007");
    } finally { f.db.close(); }
  });
});
