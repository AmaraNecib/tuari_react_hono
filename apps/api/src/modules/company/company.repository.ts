import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { resolveDatabaseEnv } from "../../infrastructure/config/database-env";
import type {
  EmployeeBatchCreateData,
  EmployeeBatchCreateResultRecord,
  EmployeeCreateData,
  EmployeeListFilters,
  EmployeeManagerAssignmentRecord,
  EmployeeProjectAssignmentRecord,
  EmployeeSalaryPaymentCreateData,
  EmployeeSalaryPaymentListFilters,
  EmployeeSalaryPaymentRecord,
  EmployeeStateHistoryListFilters,
  EmployeeStateHistoryRecord,
  EmployeeWarehouseAssignmentRecord,
  EmployeeRecord,
  EmployeeUpdateData,
  EmployeeManagedProjectsSyncData,
  EmployeeManagedWarehousesSyncData,
  AuthUserDisplayRecord,
  MutationAuditContext,
  UserProfileHistoryRecord,
  EmployeeWorkplaceAssignmentData,
  ManagerAssignmentCreateData,
  ManagerAssignmentEndData,
  ManagerAssignmentListFilters,
  ProjectAssignmentCreateData,
  ProjectAssignmentEndData,
  ProjectAssignmentListFilters,
  ProjectCreateData,
  ProjectManagerOwnershipHistoryListFilters,
  ProjectManagerOwnershipHistoryRecord,
  ProjectListFilters,
  ProjectRecord,
  ProjectUpdateData,
  RoleCreateData,
  RoleRecord,
  RoleUpdateData,
  WarehouseCreateData,
  WarehouseAssignmentCreateData,
  WarehouseAssignmentEndData,
  WarehouseAssignmentListFilters,
  WarehouseManagerOwnershipHistoryListFilters,
  WarehouseManagerOwnershipHistoryRecord,
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

function normalizeAuditContext(auditContext?: MutationAuditContext): Required<MutationAuditContext> {
  return {
    actorUserId: auditContext?.actorUserId ?? null,
    actorLabel: auditContext?.actorLabel ?? null,
    transactionId: auditContext?.transactionId ?? crypto.randomUUID(),
  }
}

function createAlgeriaTimestamp(date = new Date()) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().replace("Z", "+01:00")
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
    salaryAmountDzd: row.salary_amount_dzd === null || row.salary_amount_dzd === undefined ? null : Number(row.salary_amount_dzd),
    salaryPeriod: row.salary_period ? String(row.salary_period) as EmployeeRecord["salaryPeriod"] : null,
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
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
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
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapWarehouseAssignment(row: SqliteRow): EmployeeWarehouseAssignmentRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    warehouseId: String(row.warehouse_id),
    status: String(row.status) as EmployeeWarehouseAssignmentRecord["status"],
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEmployeeStateHistory(row: SqliteRow): EmployeeStateHistoryRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    roleId: String(row.role_id),
    status: String(row.status),
    salaryAmountDzd: row.salary_amount_dzd === null || row.salary_amount_dzd === undefined ? null : Number(row.salary_amount_dzd),
    salaryPeriod: row.salary_period ? String(row.salary_period) as EmployeeStateHistoryRecord["salaryPeriod"] : null,
    eventType: String(row.event_type),
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapProjectManagerOwnershipHistory(row: SqliteRow): ProjectManagerOwnershipHistoryRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    managerId: String(row.manager_id),
    status: String(row.status),
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapWarehouseManagerOwnershipHistory(row: SqliteRow): WarehouseManagerOwnershipHistoryRecord {
  return {
    id: String(row.id),
    warehouseId: String(row.warehouse_id),
    managerId: String(row.manager_id),
    status: String(row.status),
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    notes: toNullableText(row.notes),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapEmployeeSalaryPayment(row: SqliteRow): EmployeeSalaryPaymentRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    periodType: String(row.period_type) as EmployeeSalaryPaymentRecord["periodType"],
    expectedAmountDzd: Number(row.expected_amount_dzd),
    actualAmountDzd: Number(row.actual_amount_dzd),
    paymentDate: String(row.payment_date),
    note: toNullableText(row.note),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapUserProfileHistory(row: SqliteRow): UserProfileHistoryRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: toNullableText(row.name),
    phone: toNullableText(row.phone),
    actorUserId: toNullableText(row.actor_user_id),
    actorLabel: toNullableText(row.actor_label),
    transactionId: toNullableText(row.transaction_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
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
  createEmployee(data: EmployeeCreateData, auditContext?: MutationAuditContext): EmployeeRecord;
  createEmployeesBatch(data: EmployeeBatchCreateData[], auditContext?: MutationAuditContext): EmployeeBatchCreateResultRecord;
  updateEmployee(data: EmployeeUpdateData, auditContext?: MutationAuditContext): EmployeeRecord | null;
  deleteEmployee(id: string): boolean;
  assignEmployeeWorkplace(data: EmployeeWorkplaceAssignmentData, auditContext?: MutationAuditContext): void;
  syncManagedProjects(data: EmployeeManagedProjectsSyncData, auditContext?: MutationAuditContext): void;
  syncManagedWarehouses(data: EmployeeManagedWarehousesSyncData, auditContext?: MutationAuditContext): void;

  listProjects(filters?: ProjectListFilters): ProjectRecord[];
  getProjectById(id: string): ProjectRecord | null;
  createProject(data: ProjectCreateData, auditContext?: MutationAuditContext): ProjectRecord;
  updateProject(data: ProjectUpdateData, auditContext?: MutationAuditContext): ProjectRecord | null;

  listWarehouses(filters?: WarehouseListFilters): WarehouseRecord[];
  getWarehouseById(id: string): WarehouseRecord | null;
  createWarehouse(data: WarehouseCreateData, auditContext?: MutationAuditContext): WarehouseRecord;
  updateWarehouse(data: WarehouseUpdateData, auditContext?: MutationAuditContext): WarehouseRecord | null;

  listManagerAssignments(filters?: ManagerAssignmentListFilters): EmployeeManagerAssignmentRecord[];
  getManagerAssignmentById(id: string): EmployeeManagerAssignmentRecord | null;
  getActiveManagerAssignmentByWorkerId(workerId: string): EmployeeManagerAssignmentRecord | null;
  createManagerAssignment(data: ManagerAssignmentCreateData, auditContext?: MutationAuditContext): EmployeeManagerAssignmentRecord;
  endManagerAssignment(data: ManagerAssignmentEndData, auditContext?: MutationAuditContext): EmployeeManagerAssignmentRecord | null;

  listProjectAssignments(filters?: ProjectAssignmentListFilters): EmployeeProjectAssignmentRecord[];
  getProjectAssignmentById(id: string): EmployeeProjectAssignmentRecord | null;
  getActiveProjectAssignmentByEmployeeId(employeeId: string): EmployeeProjectAssignmentRecord | null;
  createProjectAssignment(data: ProjectAssignmentCreateData, auditContext?: MutationAuditContext): EmployeeProjectAssignmentRecord;
  endProjectAssignment(data: ProjectAssignmentEndData, auditContext?: MutationAuditContext): EmployeeProjectAssignmentRecord | null;
  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters): EmployeeWarehouseAssignmentRecord[];
  getWarehouseAssignmentById(id: string): EmployeeWarehouseAssignmentRecord | null;
  getActiveWarehouseAssignmentByEmployeeId(employeeId: string): EmployeeWarehouseAssignmentRecord | null;
  createWarehouseAssignment(data: WarehouseAssignmentCreateData, auditContext?: MutationAuditContext): EmployeeWarehouseAssignmentRecord;
  endWarehouseAssignment(data: WarehouseAssignmentEndData, auditContext?: MutationAuditContext): EmployeeWarehouseAssignmentRecord | null;
  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters): EmployeeStateHistoryRecord[];
  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters): ProjectManagerOwnershipHistoryRecord[];
  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters): WarehouseManagerOwnershipHistoryRecord[];
  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters): EmployeeSalaryPaymentRecord[];
  createSalaryPayment(data: EmployeeSalaryPaymentCreateData, auditContext?: MutationAuditContext): EmployeeSalaryPaymentRecord;
  listUserProfileHistory(): UserProfileHistoryRecord[];
  getAuthUserById(id: string): AuthUserDisplayRecord | null;
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
    const timestamp = createAlgeriaTimestamp();
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
      updatedAt: createAlgeriaTimestamp(),
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

  getAuthUserById(id: string): AuthUserDisplayRecord | null {
    const row = this.database
      .prepare('SELECT id, name, phoneNumber as phone FROM "user" WHERE id = ?')
      .get(id) as SqliteRow | undefined

    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      name: toNullableText(row.name),
      phone: toNullableText(row.phone),
    }
  }

  createEmployee(data: EmployeeCreateData, auditContext?: MutationAuditContext): EmployeeRecord {
    const id = crypto.randomUUID();
    const timestamp = createAlgeriaTimestamp();
    const audit = normalizeAuditContext(auditContext)
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(
          "INSERT INTO employee (id, first_name, last_name, phone, role_id, status, salary_amount_dzd, salary_period, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          data.firstName,
          data.lastName,
          data.phone,
          data.roleId,
          data.status,
          data.salaryAmountDzd ?? null,
          data.salaryPeriod ?? null,
          data.notes ?? null,
          timestamp,
          timestamp,
        );

        this.insertEmployeeStateHistory({
          employeeId: id,
          roleId: data.roleId,
          status: data.status,
          salaryAmountDzd: data.salaryAmountDzd ?? null,
          salaryPeriod: data.salaryPeriod ?? null,
          eventType: "CREATED",
          startDate: timestamp,
          notes: data.notes ?? null,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        });
    });

    transaction();

    return this.getEmployeeById(id)!;
  }

  createEmployeesBatch(data: EmployeeBatchCreateData[], auditContext?: MutationAuditContext): EmployeeBatchCreateResultRecord {
    const audit = normalizeAuditContext(auditContext)
    const insertEmployees = this.database.prepare(
      "INSERT INTO employee (id, first_name, last_name, phone, role_id, status, salary_amount_dzd, salary_period, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertManagerAssignments = this.database.prepare(
      "INSERT INTO employee_manager_assignment (id, worker_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertProjectAssignments = this.database.prepare(
      "INSERT INTO employee_project_assignment (id, employee_id, project_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );

    const transaction = this.database.transaction((rows: EmployeeBatchCreateData[]) => {
      const employees: EmployeeRecord[] = [];
      const managerAssignments: EmployeeManagerAssignmentRecord[] = [];
      const projectAssignments: EmployeeProjectAssignmentRecord[] = [];

      for (const row of rows) {
        const employeeId = crypto.randomUUID();
        const employeeTimestamp = createAlgeriaTimestamp();

        insertEmployees.run(
          employeeId,
          row.firstName,
          row.lastName,
          row.phone,
          row.roleId,
          row.status,
          row.salaryAmountDzd ?? null,
          row.salaryPeriod ?? null,
          row.notes ?? null,
          employeeTimestamp,
          employeeTimestamp,
        );

        employees.push({
          id: employeeId,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          roleId: row.roleId,
          status: row.status,
          salaryAmountDzd: row.salaryAmountDzd ?? null,
          salaryPeriod: row.salaryPeriod ?? null,
          notes: row.notes ?? null,
          createdAt: employeeTimestamp,
          updatedAt: employeeTimestamp,
        });

        this.insertEmployeeStateHistory({
          employeeId,
          roleId: row.roleId,
          status: row.status,
          salaryAmountDzd: row.salaryAmountDzd ?? null,
          salaryPeriod: row.salaryPeriod ?? null,
          eventType: "CREATED",
          startDate: employeeTimestamp,
          notes: row.notes ?? null,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        });

        if (!row.managerId) {
          continue;
        }

        const assignmentId = crypto.randomUUID();
        const assignmentTimestamp = createAlgeriaTimestamp();

        insertManagerAssignments.run(
          assignmentId,
          employeeId,
          row.managerId,
          "ACTIVE",
          assignmentTimestamp,
          null,
          null,
          audit.actorUserId,
          audit.actorLabel,
          audit.transactionId,
          assignmentTimestamp,
          assignmentTimestamp,
        );

        managerAssignments.push({
          id: assignmentId,
          workerId: employeeId,
          managerId: row.managerId,
          status: "ACTIVE",
          startDate: assignmentTimestamp,
          endDate: null,
          notes: null,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
          createdAt: assignmentTimestamp,
          updatedAt: assignmentTimestamp,
        });

        if (!row.projectId) {
          continue;
        }

        const projectAssignmentId = crypto.randomUUID();
        const projectAssignmentTimestamp = createAlgeriaTimestamp();

        insertProjectAssignments.run(
          projectAssignmentId,
          employeeId,
          row.projectId,
          "ACTIVE",
          projectAssignmentTimestamp,
          null,
          null,
          audit.actorUserId,
          audit.actorLabel,
          audit.transactionId,
          projectAssignmentTimestamp,
          projectAssignmentTimestamp,
        );

        projectAssignments.push({
          id: projectAssignmentId,
          employeeId,
          projectId: row.projectId,
          status: "ACTIVE",
          startDate: projectAssignmentTimestamp,
          endDate: null,
          notes: null,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
          createdAt: projectAssignmentTimestamp,
          updatedAt: projectAssignmentTimestamp,
        });
      }

      return {
        employees,
        managerAssignments,
        projectAssignments,
      };
    });

    return transaction(data);
  }

  updateEmployee(data: EmployeeUpdateData, auditContext?: MutationAuditContext): EmployeeRecord | null {
    const current = this.getEmployeeById(data.id);
    if (!current) {
      return null;
    }

    const audit = normalizeAuditContext(auditContext)

      const next = {
      firstName: data.firstName ?? current.firstName,
      lastName: data.lastName ?? current.lastName,
        phone: data.phone ?? current.phone,
        roleId: data.roleId ?? current.roleId,
        status: data.status ?? current.status,
        salaryAmountDzd: data.salaryAmountDzd !== undefined ? data.salaryAmountDzd : current.salaryAmountDzd,
        salaryPeriod: data.salaryPeriod !== undefined ? data.salaryPeriod : current.salaryPeriod,
        notes: data.notes !== undefined ? data.notes : current.notes,
        updatedAt: createAlgeriaTimestamp(),
      };

    this.database.transaction(() => {
      this.database
        .prepare(
          "UPDATE employee SET first_name = ?, last_name = ?, phone = ?, role_id = ?, status = ?, salary_amount_dzd = ?, salary_period = ?, notes = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          next.firstName,
          next.lastName,
          next.phone,
          next.roleId,
          next.status,
          next.salaryAmountDzd ?? null,
          next.salaryPeriod ?? null,
          next.notes ?? null,
          next.updatedAt,
          data.id,
        );

      const changedState =
        current.roleId !== next.roleId ||
        current.status !== next.status ||
        current.salaryAmountDzd !== next.salaryAmountDzd ||
        current.salaryPeriod !== next.salaryPeriod

      if (changedState) {
        this.endActiveEmployeeStateHistory(data.id, next.updatedAt, audit)
        this.insertEmployeeStateHistory({
          employeeId: data.id,
          roleId: next.roleId,
          status: next.status,
          salaryAmountDzd: next.salaryAmountDzd ?? null,
          salaryPeriod: next.salaryPeriod ?? null,
          eventType: "UPDATED",
          startDate: next.updatedAt,
          notes: next.notes ?? null,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        })
      }
    })()

    return this.getEmployeeById(data.id);
  }

  deleteEmployee(id: string): boolean {
    const transaction = this.database.transaction((employeeId: string) => {
      this.database.prepare('DELETE FROM "employee_state_history" WHERE employee_id = ?').run(employeeId)
      return this.database.prepare('DELETE FROM "employee" WHERE id = ?').run(employeeId).changes > 0
    })

    return transaction(id)
  }

  assignEmployeeWorkplace(data: EmployeeWorkplaceAssignmentData, auditContext?: MutationAuditContext): void {
    const audit = normalizeAuditContext(auditContext)
    const transaction = this.database.transaction((input: EmployeeWorkplaceAssignmentData) => {
      const activeManager = this.getActiveManagerAssignmentByWorkerId(input.employeeId);
      const activeProject = this.getActiveProjectAssignmentByEmployeeId(input.employeeId);
      const activeWarehouse = this.getActiveWarehouseAssignmentByEmployeeId(input.employeeId);
      const timestamp = createAlgeriaTimestamp();

      const keepsSameProjectAssignment =
        input.nextType === "PROJECT" &&
        Boolean(activeProject) &&
        activeProject?.projectId === input.projectId &&
        activeManager?.managerId === (input.managerId ?? null) &&
        !activeWarehouse

      const keepsSameWarehouseAssignment =
        input.nextType === "WAREHOUSE" &&
        Boolean(activeWarehouse) &&
        activeWarehouse?.warehouseId === input.warehouseId &&
        !activeManager &&
        !activeProject

      if (keepsSameProjectAssignment || keepsSameWarehouseAssignment) {
        return
      }

      if (activeManager && activeManager.managerId !== (input.managerId ?? null)) {
        this.database
          .prepare(
            "UPDATE employee_manager_assignment SET status = 'ENDED', end_date = ?, notes = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(timestamp, input.notes ?? activeManager.notes, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, activeManager.id);
      }

      if (activeProject) {
        this.database
          .prepare(
            "UPDATE employee_project_assignment SET status = 'ENDED', end_date = ?, notes = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(timestamp, input.notes ?? activeProject.notes, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, activeProject.id);
      }

      if (activeWarehouse) {
        this.database
          .prepare(
            "UPDATE employee_warehouse_assignment SET status = 'ENDED', end_date = ?, notes = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(timestamp, input.notes ?? activeWarehouse.notes, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, activeWarehouse.id);
      }

      if (input.nextType === "PROJECT" && input.projectId) {
        if (!activeManager || activeManager.managerId !== input.managerId) {
          this.createManagerAssignment({
            workerId: input.employeeId,
            managerId: input.managerId!,
            status: "ACTIVE",
            startDate: timestamp,
            endDate: null,
            notes: input.notes ?? null,
          }, audit);
        }

        this.createProjectAssignment({
          employeeId: input.employeeId,
          projectId: input.projectId,
          status: "ACTIVE",
          startDate: timestamp,
          endDate: null,
          notes: input.notes ?? null,
        }, audit);
      }

      if (input.nextType === "WAREHOUSE" && input.warehouseId) {
        this.createWarehouseAssignment({
          employeeId: input.employeeId,
          warehouseId: input.warehouseId,
          status: "ACTIVE",
          startDate: timestamp,
          endDate: null,
          notes: input.notes ?? null,
        }, audit);
      }

      if (input.nextType === "NONE" && activeManager && input.managerId === null) {
        // manager link already ended above when applicable
      }
    });

    transaction(data);
  }

  syncManagedProjects(data: EmployeeManagedProjectsSyncData, auditContext?: MutationAuditContext): void {
    const audit = normalizeAuditContext(auditContext)
    const transaction = this.database.transaction((input: EmployeeManagedProjectsSyncData) => {
      const currentProjects = this.listProjects({ managerId: input.employeeId })
      const currentProjectIds = new Set(currentProjects.map((project) => project.id))
      const nextProjectIds = new Set(input.projectIds)
      const timestamp = createAlgeriaTimestamp()

      for (const project of currentProjects) {
        if (!nextProjectIds.has(project.id)) {
          this.endActiveProjectManagerOwnershipHistory(project.id, timestamp, audit)
        }
      }

      this.database
        .prepare('UPDATE "project" SET manager_id = NULL, updated_at = ? WHERE manager_id = ? AND id NOT IN (' + (input.projectIds.length > 0 ? input.projectIds.map(() => '?').join(',') : "''") + ')')
        .run(timestamp, input.employeeId, ...input.projectIds)

      for (const projectId of input.projectIds) {
        if (!currentProjectIds.has(projectId)) {
          this.insertProjectManagerOwnershipHistory({
            projectId,
            managerId: input.employeeId,
            status: "ACTIVE",
            startDate: timestamp,
            notes: null,
            actorUserId: audit.actorUserId,
            actorLabel: audit.actorLabel,
            transactionId: audit.transactionId,
          })
        }
        this.database
          .prepare('UPDATE "project" SET manager_id = ?, updated_at = ? WHERE id = ?')
          .run(input.employeeId, timestamp, projectId)
      }
    })

    transaction(data)
  }

  syncManagedWarehouses(data: EmployeeManagedWarehousesSyncData, auditContext?: MutationAuditContext): void {
    const audit = normalizeAuditContext(auditContext)
    const transaction = this.database.transaction((input: EmployeeManagedWarehousesSyncData) => {
      const currentWarehouses = this.listWarehouses({ managerId: input.employeeId })
      const currentWarehouseIds = new Set(currentWarehouses.map((warehouse) => warehouse.id))
      const nextWarehouseIds = new Set(input.warehouseIds)
      const timestamp = createAlgeriaTimestamp()

      for (const warehouse of currentWarehouses) {
        if (!nextWarehouseIds.has(warehouse.id)) {
          this.endActiveWarehouseManagerOwnershipHistory(warehouse.id, timestamp, audit)
        }
      }

      this.database
        .prepare('UPDATE "warehouse" SET manager_id = NULL, updated_at = ? WHERE manager_id = ? AND id NOT IN (' + (input.warehouseIds.length > 0 ? input.warehouseIds.map(() => '?').join(',') : "''") + ')')
        .run(timestamp, input.employeeId, ...input.warehouseIds)

      for (const warehouseId of input.warehouseIds) {
        if (!currentWarehouseIds.has(warehouseId)) {
          this.insertWarehouseManagerOwnershipHistory({
            warehouseId,
            managerId: input.employeeId,
            status: "ACTIVE",
            startDate: timestamp,
            notes: null,
            actorUserId: audit.actorUserId,
            actorLabel: audit.actorLabel,
            transactionId: audit.transactionId,
          })
        }
        this.database
          .prepare('UPDATE "warehouse" SET manager_id = ?, updated_at = ? WHERE id = ?')
          .run(input.employeeId, timestamp, warehouseId)
      }
    })

    transaction(data)
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

  createProject(data: ProjectCreateData, auditContext?: MutationAuditContext): ProjectRecord {
    const id = crypto.randomUUID();
    const timestamp = createAlgeriaTimestamp();
    const audit = normalizeAuditContext(auditContext)
    const transaction = this.database.transaction(() => {
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
        )

      if (data.managerId && data.status === "ACTIVE") {
        this.insertProjectManagerOwnershipHistory({
          projectId: id,
          managerId: data.managerId,
          status: "ACTIVE",
          startDate: timestamp,
          notes: data.notes ?? null,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        })
      }
    })

    transaction();

    return this.getProjectById(id)!;
  }

  updateProject(data: ProjectUpdateData, auditContext?: MutationAuditContext): ProjectRecord | null {
    const current = this.getProjectById(data.id);
    if (!current) {
      return null;
    }

    const audit = normalizeAuditContext(auditContext)

    const next = {
      name: data.name ?? current.name,
      location: data.location !== undefined ? data.location : current.location,
      managerId: data.managerId !== undefined ? data.managerId : current.managerId,
      status: data.status ?? current.status,
      notes: data.notes !== undefined ? data.notes : current.notes,
      updatedAt: createAlgeriaTimestamp(),
    };

    this.database.transaction(() => {
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

      if (current.managerId !== next.managerId || current.status !== next.status) {
        if (current.managerId && current.status === "ACTIVE") {
          this.endActiveProjectManagerOwnershipHistory(data.id, next.updatedAt, audit)
        }

        if (next.managerId && next.status === "ACTIVE") {
          this.insertProjectManagerOwnershipHistory({
            projectId: data.id,
            managerId: next.managerId,
            status: "ACTIVE",
            startDate: next.updatedAt,
            notes: next.notes ?? null,
            actorUserId: audit.actorUserId,
            actorLabel: audit.actorLabel,
            transactionId: audit.transactionId,
          })
        }
      }

      if (next.managerId && next.status === "ACTIVE" && data.reassignWorkerIds && data.reassignWorkerIds.length > 0) {
        this.reassignWorkersToManagerWithinTransaction({
          workerIds: data.reassignWorkerIds,
          managerId: next.managerId,
          timestamp: next.updatedAt,
        }, audit)
      }
    })()

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

  createWarehouse(data: WarehouseCreateData, auditContext?: MutationAuditContext): WarehouseRecord {
    const id = crypto.randomUUID();
    const timestamp = createAlgeriaTimestamp();
    const audit = normalizeAuditContext(auditContext)
    const transaction = this.database.transaction(() => {
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
        )

      if (data.managerId && data.status === "ACTIVE") {
        this.insertWarehouseManagerOwnershipHistory({
          warehouseId: id,
          managerId: data.managerId,
          status: "ACTIVE",
          startDate: timestamp,
          notes: data.notes ?? null,
          actorUserId: audit.actorUserId,
          actorLabel: audit.actorLabel,
          transactionId: audit.transactionId,
        })
      }
    })

    transaction();

    return this.getWarehouseById(id)!;
  }

  updateWarehouse(data: WarehouseUpdateData, auditContext?: MutationAuditContext): WarehouseRecord | null {
    const current = this.getWarehouseById(data.id);
    if (!current) {
      return null;
    }

    const audit = normalizeAuditContext(auditContext)

    const next = {
      name: data.name ?? current.name,
      address: data.address !== undefined ? data.address : current.address,
      managerId: data.managerId !== undefined ? data.managerId : current.managerId,
      status: data.status ?? current.status,
      notes: data.notes !== undefined ? data.notes : current.notes,
      updatedAt: createAlgeriaTimestamp(),
    };

    this.database.transaction(() => {
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

      if (current.managerId !== next.managerId || current.status !== next.status) {
        if (current.managerId && current.status === "ACTIVE") {
          this.endActiveWarehouseManagerOwnershipHistory(data.id, next.updatedAt, audit)
        }

        if (next.managerId && next.status === "ACTIVE") {
          this.insertWarehouseManagerOwnershipHistory({
            warehouseId: data.id,
            managerId: next.managerId,
            status: "ACTIVE",
            startDate: next.updatedAt,
            notes: next.notes ?? null,
            actorUserId: audit.actorUserId,
            actorLabel: audit.actorLabel,
            transactionId: audit.transactionId,
          })
        }
      }
    })()

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

  createManagerAssignment(data: ManagerAssignmentCreateData, auditContext?: MutationAuditContext): EmployeeManagerAssignmentRecord {
    const id = crypto.randomUUID();
    const timestamp = createAlgeriaTimestamp();
    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare(
        "INSERT INTO employee_manager_assignment (id, worker_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.workerId,
        data.managerId,
        data.status,
        data.startDate,
        data.endDate ?? null,
        data.notes ?? null,
        audit.actorUserId,
        audit.actorLabel,
        audit.transactionId,
        timestamp,
        timestamp,
      );

    return this.getManagerAssignmentById(id)!;
  }

  endManagerAssignment(data: ManagerAssignmentEndData, auditContext?: MutationAuditContext): EmployeeManagerAssignmentRecord | null {
    const current = this.getManagerAssignmentById(data.id);
    if (!current) {
      return null;
    }

    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare(
        "UPDATE employee_manager_assignment SET status = 'ENDED', end_date = ?, notes = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE id = ?",
      )
      .run(data.endDate, data.notes ?? current.notes, audit.actorUserId, audit.actorLabel, audit.transactionId, createAlgeriaTimestamp(), data.id);

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

  createProjectAssignment(data: ProjectAssignmentCreateData, auditContext?: MutationAuditContext): EmployeeProjectAssignmentRecord {
    const id = crypto.randomUUID();
    const timestamp = createAlgeriaTimestamp();
    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare(
        "INSERT INTO employee_project_assignment (id, employee_id, project_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.employeeId,
        data.projectId,
        data.status,
        data.startDate,
        data.endDate ?? null,
        data.notes ?? null,
        audit.actorUserId,
        audit.actorLabel,
        audit.transactionId,
        timestamp,
        timestamp,
      );

    return this.getProjectAssignmentById(id)!;
  }

  endProjectAssignment(data: ProjectAssignmentEndData, auditContext?: MutationAuditContext): EmployeeProjectAssignmentRecord | null {
    const current = this.getProjectAssignmentById(data.id);
    if (!current) {
      return null;
    }

    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare(
        "UPDATE employee_project_assignment SET status = 'ENDED', end_date = ?, notes = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE id = ?",
      )
      .run(data.endDate, data.notes ?? current.notes, audit.actorUserId, audit.actorLabel, audit.transactionId, createAlgeriaTimestamp(), data.id);

    return this.getProjectAssignmentById(data.id);
  }

  listWarehouseAssignments(filters?: WarehouseAssignmentListFilters): EmployeeWarehouseAssignmentRecord[] {
    const conditions: string[] = [];
    const params: Array<string> = [];

    if (filters?.employeeId) {
      conditions.push("employee_id = ?");
      params.push(filters.employeeId);
    }

    if (filters?.warehouseId) {
      conditions.push("warehouse_id = ?");
      params.push(filters.warehouseId);
    }

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT * FROM employee_warehouse_assignment ${whereClause} ORDER BY start_date DESC, created_at DESC`,
      )
      .all(...params) as SqliteRow[];

    return rows.map(mapWarehouseAssignment);
  }

  getWarehouseAssignmentById(id: string): EmployeeWarehouseAssignmentRecord | null {
    const row = this.database
      .prepare("SELECT * FROM employee_warehouse_assignment WHERE id = ?")
      .get(id) as SqliteRow | undefined;
    return row ? mapWarehouseAssignment(row) : null;
  }

  getActiveWarehouseAssignmentByEmployeeId(employeeId: string): EmployeeWarehouseAssignmentRecord | null {
    const row = this.database
      .prepare(
        "SELECT * FROM employee_warehouse_assignment WHERE employee_id = ? AND status = 'ACTIVE' ORDER BY start_date DESC, created_at DESC LIMIT 1",
      )
      .get(employeeId) as SqliteRow | undefined;
    return row ? mapWarehouseAssignment(row) : null;
  }

  createWarehouseAssignment(data: WarehouseAssignmentCreateData, auditContext?: MutationAuditContext): EmployeeWarehouseAssignmentRecord {
    const id = crypto.randomUUID();
    const timestamp = createAlgeriaTimestamp();
    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare(
        "INSERT INTO employee_warehouse_assignment (id, employee_id, warehouse_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        data.employeeId,
        data.warehouseId,
        data.status,
        data.startDate,
        data.endDate ?? null,
        data.notes ?? null,
        audit.actorUserId,
        audit.actorLabel,
        audit.transactionId,
        timestamp,
        timestamp,
      );

    return this.getWarehouseAssignmentById(id)!;
  }

  endWarehouseAssignment(data: WarehouseAssignmentEndData, auditContext?: MutationAuditContext): EmployeeWarehouseAssignmentRecord | null {
    const current = this.getWarehouseAssignmentById(data.id);
    if (!current) {
      return null;
    }

    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare(
        "UPDATE employee_warehouse_assignment SET status = 'ENDED', end_date = ?, notes = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE id = ?",
      )
      .run(data.endDate, data.notes ?? current.notes, audit.actorUserId, audit.actorLabel, audit.transactionId, createAlgeriaTimestamp(), data.id);

    return this.getWarehouseAssignmentById(data.id);
  }

  listEmployeeStateHistory(filters?: EmployeeStateHistoryListFilters): EmployeeStateHistoryRecord[] {
    const conditions: string[] = []
    const params: Array<string> = []

    if (filters?.employeeId) {
      conditions.push("employee_id = ?")
      params.push(filters.employeeId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const rows = this.database
      .prepare(`SELECT * FROM employee_state_history ${whereClause} ORDER BY start_date DESC, created_at DESC`)
      .all(...params) as SqliteRow[]

    return rows.map(mapEmployeeStateHistory)
  }

  listProjectManagerOwnershipHistory(filters?: ProjectManagerOwnershipHistoryListFilters): ProjectManagerOwnershipHistoryRecord[] {
    const conditions: string[] = []
    const params: Array<string> = []

    if (filters?.managerId) {
      conditions.push("manager_id = ?")
      params.push(filters.managerId)
    }

    if (filters?.projectId) {
      conditions.push("project_id = ?")
      params.push(filters.projectId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const rows = this.database
      .prepare(`SELECT * FROM project_manager_ownership_history ${whereClause} ORDER BY start_date DESC, created_at DESC`)
      .all(...params) as SqliteRow[]

    return rows.map(mapProjectManagerOwnershipHistory)
  }

  listWarehouseManagerOwnershipHistory(filters?: WarehouseManagerOwnershipHistoryListFilters): WarehouseManagerOwnershipHistoryRecord[] {
    const conditions: string[] = []
    const params: Array<string> = []

    if (filters?.managerId) {
      conditions.push("manager_id = ?")
      params.push(filters.managerId)
    }

    if (filters?.warehouseId) {
      conditions.push("warehouse_id = ?")
      params.push(filters.warehouseId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const rows = this.database
      .prepare(`SELECT * FROM warehouse_manager_ownership_history ${whereClause} ORDER BY start_date DESC, created_at DESC`)
      .all(...params) as SqliteRow[]

    return rows.map(mapWarehouseManagerOwnershipHistory)
  }

  listSalaryPayments(filters?: EmployeeSalaryPaymentListFilters): EmployeeSalaryPaymentRecord[] {
    const conditions: string[] = []
    const params: Array<string> = []

    if (filters?.employeeId) {
      conditions.push("employee_id = ?")
      params.push(filters.employeeId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const rows = this.database
      .prepare(`SELECT * FROM employee_salary_payment ${whereClause} ORDER BY payment_date DESC, created_at DESC`)
      .all(...params) as SqliteRow[]

    return rows.map(mapEmployeeSalaryPayment)
  }

  listUserProfileHistory(): UserProfileHistoryRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM "user_profile_history" ORDER BY updated_at DESC, created_at DESC')
      .all() as SqliteRow[]

    return rows.map(mapUserProfileHistory)
  }

  createSalaryPayment(data: EmployeeSalaryPaymentCreateData, auditContext?: MutationAuditContext): EmployeeSalaryPaymentRecord {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare(
        'INSERT INTO "employee_salary_payment" (id, employee_id, period_type, expected_amount_dzd, actual_amount_dzd, payment_date, note, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        data.employeeId,
        data.periodType,
        data.expectedAmountDzd,
        data.actualAmountDzd,
        data.paymentDate,
        data.note ?? null,
        audit.actorUserId,
        audit.actorLabel,
        audit.transactionId,
        timestamp,
        timestamp,
      )

    const [payment] = this.listSalaryPayments({ employeeId: data.employeeId }).filter((entry) => entry.id === id)
    return payment!
  }

  private insertEmployeeStateHistory(data: {
    employeeId: string
    roleId: string
    status: string
    salaryAmountDzd: number | null
    salaryPeriod: string | null
    eventType: string
    startDate: string
    notes: string | null
    actorUserId: string | null
    actorLabel: string | null
    transactionId: string | null
  }) {
    const id = crypto.randomUUID()
    this.database
      .prepare(
        'INSERT INTO "employee_state_history" (id, employee_id, role_id, status, salary_amount_dzd, salary_period, event_type, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        data.employeeId,
        data.roleId,
        data.status,
        data.salaryAmountDzd,
        data.salaryPeriod,
        data.eventType,
        data.startDate,
        null,
        data.notes,
        data.actorUserId,
        data.actorLabel,
        data.transactionId,
        data.startDate,
        data.startDate,
      )
  }

  private reassignWorkersToManagerWithinTransaction(
    data: {
      workerIds: string[]
      managerId: string
      timestamp: string
    },
    auditContext?: MutationAuditContext,
  ) {
    const audit = normalizeAuditContext(auditContext)

    for (const workerId of data.workerIds) {
      const activeManagerAssignment = this.getActiveManagerAssignmentByWorkerId(workerId)

      if (activeManagerAssignment?.managerId === data.managerId) {
        continue
      }

      if (activeManagerAssignment) {
        this.database
          .prepare(
            "UPDATE employee_manager_assignment SET status = 'ENDED', end_date = ?, notes = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            data.timestamp,
            activeManagerAssignment.notes,
            audit.actorUserId,
            audit.actorLabel,
            audit.transactionId,
            data.timestamp,
            activeManagerAssignment.id,
          )
      }

      const assignmentId = crypto.randomUUID()
      this.database
        .prepare(
          "INSERT INTO employee_manager_assignment (id, worker_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          assignmentId,
          workerId,
          data.managerId,
          "ACTIVE",
          data.timestamp,
          null,
          null,
          audit.actorUserId,
          audit.actorLabel,
          audit.transactionId,
          data.timestamp,
          data.timestamp,
        )
    }
  }

  private endActiveEmployeeStateHistory(
    employeeId: string,
    endDate: string,
    auditContext?: MutationAuditContext,
  ) {
    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare('UPDATE "employee_state_history" SET end_date = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ? WHERE employee_id = ? AND end_date IS NULL')
      .run(endDate, audit.actorUserId, audit.actorLabel, audit.transactionId, endDate, employeeId)
  }

  private insertProjectManagerOwnershipHistory(data: {
    projectId: string
    managerId: string
    status: string
    startDate: string
    notes: string | null
    actorUserId: string | null
    actorLabel: string | null
    transactionId: string | null
  }) {
    const id = crypto.randomUUID()
    this.database
      .prepare(
        'INSERT INTO "project_manager_ownership_history" (id, project_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, data.projectId, data.managerId, data.status, data.startDate, null, data.notes, data.actorUserId, data.actorLabel, data.transactionId, data.startDate, data.startDate)
  }

  private endActiveProjectManagerOwnershipHistory(
    projectId: string,
    endDate: string,
    auditContext?: MutationAuditContext,
  ) {
    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare('UPDATE "project_manager_ownership_history" SET end_date = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ?, status = ? WHERE project_id = ? AND end_date IS NULL')
      .run(endDate, audit.actorUserId, audit.actorLabel, audit.transactionId, endDate, "ENDED", projectId)
  }

  private insertWarehouseManagerOwnershipHistory(data: {
    warehouseId: string
    managerId: string
    status: string
    startDate: string
    notes: string | null
    actorUserId: string | null
    actorLabel: string | null
    transactionId: string | null
  }) {
    const id = crypto.randomUUID()
    this.database
      .prepare(
        'INSERT INTO "warehouse_manager_ownership_history" (id, warehouse_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, data.warehouseId, data.managerId, data.status, data.startDate, null, data.notes, data.actorUserId, data.actorLabel, data.transactionId, data.startDate, data.startDate)
  }

  private endActiveWarehouseManagerOwnershipHistory(
    warehouseId: string,
    endDate: string,
    auditContext?: MutationAuditContext,
  ) {
    const audit = normalizeAuditContext(auditContext)
    this.database
      .prepare('UPDATE "warehouse_manager_ownership_history" SET end_date = ?, actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ?, status = ? WHERE warehouse_id = ? AND end_date IS NULL')
      .run(endDate, audit.actorUserId, audit.actorLabel, audit.transactionId, endDate, "ENDED", warehouseId)
  }
}

export function createCompanyRepository(databasePath?: string) {
  const path = databasePath ?? resolveDatabaseEnv().databasePath;

  mkdirSync(dirname(path), { recursive: true });

  return new SqliteCompanyRepository(new Database(path));
}
