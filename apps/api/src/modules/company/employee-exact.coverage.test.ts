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

function fixture() {
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
  const service = new ExactEmployeeService(repository, dependencies, { isBootstrapOwner: user => user === "owner" });
  return { db, repository, service };
}

beforeEach(() => { license.status = "trial"; license.maxUsers = 0; });

describe("exact employee batch validation", () => {
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

  it("keeps unauthorized privileged-role assignment distinct from ordinary row validation", () => {
    const f = fixture();
    try {
      expect(() => f.service.createEmployeesBatch({ employees: [
        { firstName: "Attempt", lastName: "Admin", phone: "0550000004", roleId: "admin-role" },
      ] }, { ...audit, actorUserId: "not-owner" })).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "UNAUTHORIZED" }) }));
      expect(f.service.listEmployees().items).toEqual([]);
    } finally { f.db.close(); }
  });

  it("rejects direct active worker-role conversion and duplicate phone updates without changing either profile", () => {
    const f = fixture();
    try {
      const manager = f.service.createEmployee({ firstName: "Project", lastName: "Manager", phone: "0550000005", roleId: "pm-role" }, audit).item;
      const other = f.service.createEmployee({ firstName: "Other", lastName: "Manager", phone: "0550000006", roleId: "pm-role" }, audit).item;
      expect(() => f.service.updateEmployee({ id: manager.id, roleId: "worker-role" }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "BUSINESS_RULE" }) }));
      expect(() => f.service.updateEmployee({ id: other.id, phone: manager.phone }, audit)).toThrow(expect.objectContaining({ appError: expect.objectContaining({ code: "CONFLICT" }) }));
      expect(f.service.getEmployee(manager.id).item.roleId).toBe("pm-role");
      expect(f.service.getEmployee(other.id).item.phone).toBe("0550000006");
    } finally { f.db.close(); }
  });
});
