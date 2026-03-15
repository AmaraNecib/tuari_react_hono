import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { resolveDatabaseEnv } from "../../infrastructure/config/database-env";
import type {
  EmployeeCreateData,
  EmployeeListFilters,
  EmployeeManagerAssignmentRecord,
  EmployeeProjectAssignmentRecord,
  EmployeeRecord,
  EmployeeUpdateData,
  ManagerAssignmentCreateData,
  ManagerAssignmentEndData,
  ManagerAssignmentListFilters,
  ProjectAssignmentCreateData,
  ProjectAssignmentEndData,
  ProjectAssignmentListFilters,
  ProjectCreateData,
  ProjectListFilters,
  ProjectRecord,
  ProjectUpdateData,
  RoleCreateData,
  RoleRecord,
  RoleUpdateData,
  WarehouseCreateData,
  WarehouseListFilters,
  WarehouseRecord,
  WarehouseUpdateData,
} from "./company.types";

type SqliteRow = Record<string, null | number | string>;

function toNullableText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function mapRole(row: SqliteRow): RoleRecord {
  return {
    id: String(row.id),
    key: String(row.key),
    name: String(row.name),
    description: toNullableText(row.description),
    isSystem: Number(row.is_system) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEmployee(row: SqliteRow): EmployeeRecord {
  return {
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    phone: String(row.phone),
    roleId: String(row.role_id),
    status: String(row.status) as EmployeeRecord["status"],
    notes: toNullableText(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapProject(row: SqliteRow): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    location: toNullableText(row.location),
    managerId: row.manager_id ? String(row.manager_id) : null,
    status: String(row.status) as ProjectRecord["status"],
    notes: toNullableText(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapWarehouse(row: SqliteRow): WarehouseRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    address: toNullableText(row.address),
    managerId: row.manager_id ? String(row.manager_id) : null,
    status: String(row.status) as WarehouseRecord["status"],
    notes: toNullableText(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapManagerAssignment(row: SqliteRow): EmployeeManagerAssignmentRecord {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    managerId: String(row.manager_id),
    status: String(row.status) as EmployeeManagerAssignmentRecord["status"],
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapProjectAssignment(row: SqliteRow): EmployeeProjectAssignmentRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    projectId: String(row.project_id),
    status: String(row.status) as EmployeeProjectAssignmentRecord["status"],
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface CompanyRepository {
  listRoles(): RoleRecord[];
  getRoleById(id: string): RoleRecord | null;
  getRoleByKey(key: string): RoleRecord | null;
  createRole(data: RoleCreateData): RoleRecord;
  updateRole(data: RoleUpdateData): RoleRecord | null;
  deleteRole(id: string): boolean;
  countEmployeesByRoleId(roleId: string): number;

  listEmployees(filters?: EmployeeListFilters): EmployeeRecord[];
  getEmployeeById(id: string): EmployeeRecord | null;
  getEmployeeByPhone(phone: string): EmployeeRecord | null;
  createEmployee(data: EmployeeCreateData): EmployeeRecord;
  updateEmployee(data: EmployeeUpdateData): EmployeeRecord | null;

  listProjects(filters?: ProjectListFilters): ProjectRecord[];
  getProjectById(id: string): ProjectRecord | null;
  createProject(data: ProjectCreateData): ProjectRecord;
  updateProject(data: ProjectUpdateData): ProjectRecord | null;

  listWarehouses(filters?: WarehouseListFilters): WarehouseRecord[];
  getWarehouseById(id: string): WarehouseRecord | null;
  createWarehouse(data: WarehouseCreateData): WarehouseRecord;
  updateWarehouse(data: WarehouseUpdateData): WarehouseRecord | null;

  listManagerAssignments(filters?: ManagerAssignmentListFilters): EmployeeManagerAssignmentRecord[];
  getManagerAssignmentById(id: string): EmployeeManagerAssignmentRecord | null;
  getActiveManagerAssignmentByWorkerId(workerId: string): EmployeeManagerAssignmentRecord | null;
  createManagerAssignment(data: ManagerAssignmentCreateData): EmployeeManagerAssignmentRecord;
  endManagerAssignment(data: ManagerAssignmentEndData): EmployeeManagerAssignmentRecord | null;

  listProjectAssignments(filters?: ProjectAssignmentListFilters): EmployeeProjectAssignmentRecord[];
  getProjectAssignmentById(id: string): EmployeeProjectAssignmentRecord | null;
  getActiveProjectAssignmentByEmployeeId(employeeId: string): EmployeeProjectAssignmentRecord | null;
  createProjectAssignment(data: ProjectAssignmentCreateData): EmployeeProjectAssignmentRecord;
  endProjectAssignment(data: ProjectAssignmentEndData): EmployeeProjectAssignmentRecord | null;
}

export class SqliteCompanyRepository implements CompanyRepository {
  constructor(private readonly database: Database.Database) {
    this.database.pragma("foreign_keys = ON");
  }

  listRoles(): RoleRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM "role" ORDER BY name COLLATE NOCASE ASC, created_at ASC')
      .all() as SqliteRow[];

    return rows.map(mapRole);
  }

  getRoleById(id: string): RoleRecord | null {
    const row = this.database.prepare('SELECT * FROM "role" WHERE id = ?').get(id) as SqliteRow | undefined;
    return row ? mapRole(row) : null;
  }

  getRoleByKey(key: string): RoleRecord | null {
    const row = this.database.prepare('SELECT * FROM "role" WHERE key = ?').get(key) as SqliteRow | undefined;
    return row ? mapRole(row) : null;
  }

  createRole(data: RoleCreateData): RoleRecord {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, data.key, data.name, data.description ?? null, 0, timestamp, timestamp);

    return this.getRoleById(id)!;
  }

  updateRole(data: RoleUpdateData): RoleRecord | null {
    const current = this.getRoleById(data.id);
    if (!current) {
      return null;
    }

    const next = {
      key: data.key ?? current.key,
      name: data.name ?? current.name,
      description: data.description !== undefined ? data.description : current.description,
      updatedAt: new Date().toISOString(),
    };

    this.database
      .prepare('UPDATE "role" SET key = ?, name = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(next.key, next.name, next.description ?? null, next.updatedAt, data.id);

    return this.getRoleById(data.id);
  }

  deleteRole(id: string): boolean {
    const result = this.database.prepare('DELETE FROM "role" WHERE id = ?').run(id);
    return result.changes > 0;
  }

  countEmployeesByRoleId(roleId: string): number {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM employee WHERE role_id = ?')
      .get(roleId) as { count: number };
    return Number(row.count);
  }

  listEmployees(filters?: EmployeeListFilters): EmployeeRecord[] {
    const conditions: string[] = [];
    const params: Array<string> = [];

    if (filters?.roleId) {
      conditions.push("role_id = ?");
      params.push(filters.roleId);
    }

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT * FROM employee ${whereClause} ORDER BY first_name COLLATE NOCASE ASC, last_name COLLATE NOCASE ASC, created_at ASC`,
      )
      .all(...params) as SqliteRow[];

    return rows.map(mapEmployee);
  }

  getEmployeeById(id: string): EmployeeRecord | null {
    const row = this.database.prepare("SELECT * FROM employee WHERE id = ?").get(id) as SqliteRow | undefined;
    return row ? mapEmployee(row) : null;
  }

  getEmployeeByPhone(phone: string): EmployeeRecord | null {
    const row = this.database.prepare("SELECT * FROM employee WHERE phone = ?").get(phone) as SqliteRow | undefined;
    return row ? mapEmployee(row) : null;
  }

  createEmployee(data: EmployeeCreateData): EmployeeRecord {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO employee (id, first_name, last_name, phone, role_id, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.firstName,
        data.lastName,
        data.phone,
        data.roleId,
        data.status,
        data.notes ?? null,
        timestamp,
        timestamp,
      );

    return this.getEmployeeById(id)!;
  }

  updateEmployee(data: EmployeeUpdateData): EmployeeRecord | null {
    const current = this.getEmployeeById(data.id);
    if (!current) {
      return null;
    }

    const next = {
      firstName: data.firstName ?? current.firstName,
      lastName: data.lastName ?? current.lastName,
      phone: data.phone ?? current.phone,
      roleId: data.roleId ?? current.roleId,
      status: data.status ?? current.status,
      notes: data.notes !== undefined ? data.notes : current.notes,
      updatedAt: new Date().toISOString(),
    };

    this.database
      .prepare(
        "UPDATE employee SET first_name = ?, last_name = ?, phone = ?, role_id = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        next.firstName,
        next.lastName,
        next.phone,
        next.roleId,
        next.status,
        next.notes ?? null,
        next.updatedAt,
        data.id,
      );

    return this.getEmployeeById(data.id);
  }

  listProjects(filters?: ProjectListFilters): ProjectRecord[] {
    const conditions: string[] = [];
    const params: Array<string> = [];

    if (filters?.managerId) {
      conditions.push("manager_id = ?");
      params.push(filters.managerId);
    }

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT * FROM project ${whereClause} ORDER BY name COLLATE NOCASE ASC, created_at ASC`,
      )
      .all(...params) as SqliteRow[];

    return rows.map(mapProject);
  }

  getProjectById(id: string): ProjectRecord | null {
    const row = this.database.prepare("SELECT * FROM project WHERE id = ?").get(id) as SqliteRow | undefined;
    return row ? mapProject(row) : null;
  }

  createProject(data: ProjectCreateData): ProjectRecord {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO project (id, name, location, manager_id, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.name,
        data.location ?? null,
        data.managerId ?? null,
        data.status,
        data.notes ?? null,
        timestamp,
        timestamp,
      );

    return this.getProjectById(id)!;
  }

  updateProject(data: ProjectUpdateData): ProjectRecord | null {
    const current = this.getProjectById(data.id);
    if (!current) {
      return null;
    }

    const next = {
      name: data.name ?? current.name,
      location: data.location !== undefined ? data.location : current.location,
      managerId: data.managerId !== undefined ? data.managerId : current.managerId,
      status: data.status ?? current.status,
      notes: data.notes !== undefined ? data.notes : current.notes,
      updatedAt: new Date().toISOString(),
    };

    this.database
      .prepare(
        "UPDATE project SET name = ?, location = ?, manager_id = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        next.name,
        next.location ?? null,
        next.managerId ?? null,
        next.status,
        next.notes ?? null,
        next.updatedAt,
        data.id,
      );

    return this.getProjectById(data.id);
  }

  listWarehouses(filters?: WarehouseListFilters): WarehouseRecord[] {
    const conditions: string[] = [];
    const params: Array<string> = [];

    if (filters?.managerId) {
      conditions.push("manager_id = ?");
      params.push(filters.managerId);
    }

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT * FROM warehouse ${whereClause} ORDER BY name COLLATE NOCASE ASC, created_at ASC`,
      )
      .all(...params) as SqliteRow[];

    return rows.map(mapWarehouse);
  }

  getWarehouseById(id: string): WarehouseRecord | null {
    const row = this.database.prepare("SELECT * FROM warehouse WHERE id = ?").get(id) as SqliteRow | undefined;
    return row ? mapWarehouse(row) : null;
  }

  createWarehouse(data: WarehouseCreateData): WarehouseRecord {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO warehouse (id, name, address, manager_id, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.name,
        data.address ?? null,
        data.managerId ?? null,
        data.status,
        data.notes ?? null,
        timestamp,
        timestamp,
      );

    return this.getWarehouseById(id)!;
  }

  updateWarehouse(data: WarehouseUpdateData): WarehouseRecord | null {
    const current = this.getWarehouseById(data.id);
    if (!current) {
      return null;
    }

    const next = {
      name: data.name ?? current.name,
      address: data.address !== undefined ? data.address : current.address,
      managerId: data.managerId !== undefined ? data.managerId : current.managerId,
      status: data.status ?? current.status,
      notes: data.notes !== undefined ? data.notes : current.notes,
      updatedAt: new Date().toISOString(),
    };

    this.database
      .prepare(
        "UPDATE warehouse SET name = ?, address = ?, manager_id = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        next.name,
        next.address ?? null,
        next.managerId ?? null,
        next.status,
        next.notes ?? null,
        next.updatedAt,
        data.id,
      );

    return this.getWarehouseById(data.id);
  }

  listManagerAssignments(filters?: ManagerAssignmentListFilters): EmployeeManagerAssignmentRecord[] {
    const conditions: string[] = [];
    const params: Array<string> = [];

    if (filters?.workerId) {
      conditions.push("worker_id = ?");
      params.push(filters.workerId);
    }

    if (filters?.managerId) {
      conditions.push("manager_id = ?");
      params.push(filters.managerId);
    }

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT * FROM employee_manager_assignment ${whereClause} ORDER BY start_date DESC, created_at DESC`,
      )
      .all(...params) as SqliteRow[];

    return rows.map(mapManagerAssignment);
  }

  getManagerAssignmentById(id: string): EmployeeManagerAssignmentRecord | null {
    const row = this.database
      .prepare("SELECT * FROM employee_manager_assignment WHERE id = ?")
      .get(id) as SqliteRow | undefined;
    return row ? mapManagerAssignment(row) : null;
  }

  getActiveManagerAssignmentByWorkerId(workerId: string): EmployeeManagerAssignmentRecord | null {
    const row = this.database
      .prepare(
        "SELECT * FROM employee_manager_assignment WHERE worker_id = ? AND status = 'ACTIVE' ORDER BY start_date DESC, created_at DESC LIMIT 1",
      )
      .get(workerId) as SqliteRow | undefined;
    return row ? mapManagerAssignment(row) : null;
  }

  createManagerAssignment(data: ManagerAssignmentCreateData): EmployeeManagerAssignmentRecord {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO employee_manager_assignment (id, worker_id, manager_id, status, start_date, end_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.workerId,
        data.managerId,
        data.status,
        data.startDate,
        data.endDate ?? null,
        data.notes ?? null,
        timestamp,
        timestamp,
      );

    return this.getManagerAssignmentById(id)!;
  }

  endManagerAssignment(data: ManagerAssignmentEndData): EmployeeManagerAssignmentRecord | null {
    const current = this.getManagerAssignmentById(data.id);
    if (!current) {
      return null;
    }

    this.database
      .prepare(
        "UPDATE employee_manager_assignment SET status = 'ENDED', end_date = ?, notes = ?, updated_at = ? WHERE id = ?",
      )
      .run(data.endDate, data.notes ?? current.notes, new Date().toISOString(), data.id);

    return this.getManagerAssignmentById(data.id);
  }

  listProjectAssignments(filters?: ProjectAssignmentListFilters): EmployeeProjectAssignmentRecord[] {
    const conditions: string[] = [];
    const params: Array<string> = [];

    if (filters?.employeeId) {
      conditions.push("employee_id = ?");
      params.push(filters.employeeId);
    }

    if (filters?.projectId) {
      conditions.push("project_id = ?");
      params.push(filters.projectId);
    }

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT * FROM employee_project_assignment ${whereClause} ORDER BY start_date DESC, created_at DESC`,
      )
      .all(...params) as SqliteRow[];

    return rows.map(mapProjectAssignment);
  }

  getProjectAssignmentById(id: string): EmployeeProjectAssignmentRecord | null {
    const row = this.database
      .prepare("SELECT * FROM employee_project_assignment WHERE id = ?")
      .get(id) as SqliteRow | undefined;
    return row ? mapProjectAssignment(row) : null;
  }

  getActiveProjectAssignmentByEmployeeId(employeeId: string): EmployeeProjectAssignmentRecord | null {
    const row = this.database
      .prepare(
        "SELECT * FROM employee_project_assignment WHERE employee_id = ? AND status = 'ACTIVE' ORDER BY start_date DESC, created_at DESC LIMIT 1",
      )
      .get(employeeId) as SqliteRow | undefined;
    return row ? mapProjectAssignment(row) : null;
  }

  createProjectAssignment(data: ProjectAssignmentCreateData): EmployeeProjectAssignmentRecord {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO employee_project_assignment (id, employee_id, project_id, status, start_date, end_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.employeeId,
        data.projectId,
        data.status,
        data.startDate,
        data.endDate ?? null,
        data.notes ?? null,
        timestamp,
        timestamp,
      );

    return this.getProjectAssignmentById(id)!;
  }

  endProjectAssignment(data: ProjectAssignmentEndData): EmployeeProjectAssignmentRecord | null {
    const current = this.getProjectAssignmentById(data.id);
    if (!current) {
      return null;
    }

    this.database
      .prepare(
        "UPDATE employee_project_assignment SET status = 'ENDED', end_date = ?, notes = ?, updated_at = ? WHERE id = ?",
      )
      .run(data.endDate, data.notes ?? current.notes, new Date().toISOString(), data.id);

    return this.getProjectAssignmentById(data.id);
  }
}

export function createCompanyRepository(databasePath?: string) {
  const path = databasePath ?? resolveDatabaseEnv().databasePath;

  mkdirSync(dirname(path), { recursive: true });

  return new SqliteCompanyRepository(new Database(path));
}
