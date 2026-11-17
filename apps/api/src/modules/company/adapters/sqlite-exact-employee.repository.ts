import { employeeManagerAssignmentSchema, employeeProjectAssignmentSchema, roleSchema, exactEmployeeSchema, exactEmployeeStateHistorySchema, type ExactEmployee, type ExactEmployeeStateHistory, type EmployeeAssignWorkplaceInput, type EmployeeManagerAssignment } from "@tuari/contracts";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { ExactTransactionIdentity } from "../exact-finance.repository";
import type { MutationAuditContext, RoleRecord, EmployeeListFilters } from "../company.types";
import type { ExactEmployeeRepository } from "../employee-exact.repository";
import type { EmployeeTransitionLinks } from "../company.entity-resolvers";
import { decodeCursor, encodeCursor } from "../../shared/cursor";
import { bindExactSalaryReference, readExactEmployee, readExactEmployeeHistory } from "./exact-workforce-storage";

/** Trusted native profile storage. Public authorization and relationship rules belong to the employee service. */
export class SqliteExactEmployeeRepository implements ExactEmployeeRepository {
  get transactionIdentity(): ExactTransactionIdentity { return { connection: this.db, lock: this.lock }; }
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock, private readonly dependencies: { id(): string }) {
    this.withTransaction(() => {
      requireExactMoneySchema(db, "workforce");
      for (const table of ["employee", "employee_state_history"] as const) {
        const schema = db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table) as { type: string } | undefined;
        if (schema?.type !== "table") throw new Error(`Exact employee table required: ${table}`);
        const columns = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
        for (const [name, type] of Object.entries({ salary_reference_units: "INTEGER", salary_period: "TEXT", salary_currency: "TEXT" })) {
          if (columns.find(column => column.name === name)?.type.toUpperCase() !== type) throw new Error(`Invalid exact employee column ${table}.${name}`);
        }
      }
    });
  }

  withTransaction<T>(work: () => T): T {
    if (work.constructor.name === "AsyncFunction") throw new TypeError("Employee transaction must be synchronous");
    return this.lock.runSync(() => this.db.transaction(() => {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Employee transaction must be synchronous");
      return result;
    }).immediate());
  }

  getRoleById(id: string): RoleRecord | null {
    return this.withTransaction(() => {
      const row = this.db.prepare(`SELECT id,key,name,description,is_system AS isSystem,created_at AS createdAt,updated_at AS updatedAt FROM role WHERE id=?`).get(id) as (Omit<RoleRecord, "isSystem"> & { isSystem: number }) | undefined;
      return row ? roleSchema.parse({ ...row, isSystem: row.isSystem === 1 }) : null;
    });
  }

  getActiveManagerAssignmentByWorkerId(id: string): EmployeeManagerAssignment | null {
    return this.withTransaction(() => {
      const row = this.db.prepare(`SELECT id,worker_id AS workerId,manager_id AS managerId,status,start_date AS startDate,end_date AS endDate,notes,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId,created_at AS createdAt,updated_at AS updatedAt FROM employee_manager_assignment WHERE worker_id=? AND status='ACTIVE' ORDER BY created_at DESC,id DESC LIMIT 1`).get(id);
      return row ? employeeManagerAssignmentSchema.parse(row) : null;
    });
  }

  getEmployeeByPhone(phone: string): ExactEmployee | null {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT id FROM employee WHERE phone=?").get(phone) as { id: string } | undefined;
      return row ? this.getEmployeeById(row.id) : null;
    });
  }

  private employeeWhere(filters?: EmployeeListFilters) {
    const conditions: string[] = [];
    const values: string[] = [];
    if (filters?.roleId) { conditions.push("role_id=?"); values.push(filters.roleId); }
    if (filters?.status) { conditions.push("status=?"); values.push(filters.status); }
    const search = filters?.search?.trim();
    if (search) {
      conditions.push("(instr(lower(first_name),lower(?))>0 OR instr(lower(last_name),lower(?))>0 OR instr(phone,?)>0)");
      values.push(search, search, search);
    }
    return { sql: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "", values };
  }

  countEmployees(filters?: EmployeeListFilters): number {
    return this.withTransaction(() => {
      const where = this.employeeWhere(filters);
      const row = this.db.prepare(`SELECT count(*) AS count FROM employee${where.sql}`).get(...where.values) as { count: number };
      return row.count;
    });
  }

  listEmployees(filters?: EmployeeListFilters): ExactEmployee[] {
    return this.withTransaction(() => {
      const where = this.employeeWhere(filters);
      const rows = this.db.prepare(`SELECT id FROM employee${where.sql} ORDER BY first_name COLLATE NOCASE,last_name COLLATE NOCASE,created_at,id`).all(...where.values) as { id: string }[];
      return rows.map(row => this.getEmployeeById(row.id)!);
    });
  }

  listEmployeeCreatedRelationships(employeeId: string) {
    return this.withTransaction(() => {
      const metadata = "id,status,start_date AS startDate,end_date AS endDate,notes,actor_user_id AS actorUserId,transaction_id AS transactionId,created_at AS createdAt,updated_at AS updatedAt";
      const managers = this.db.prepare(`SELECT ${metadata},worker_id AS workerId,manager_id AS managerId FROM employee_manager_assignment WHERE worker_id=? ORDER BY created_at,id`).all(employeeId);
      const projects = this.db.prepare(`SELECT ${metadata},employee_id AS employeeId,project_id AS projectId FROM employee_project_assignment WHERE employee_id=? ORDER BY created_at,id`).all(employeeId);
      return { managerAssignments: employeeManagerAssignmentSchema.array().parse(managers), projectAssignments: employeeProjectAssignmentSchema.array().parse(projects) };
    });
  }

  getWorkplaceResource(kind: "PROJECT" | "WAREHOUSE", id: string) {
    return this.withTransaction(() => {
      const table = kind === "PROJECT" ? "project" : "warehouse";
      return this.db.prepare(`SELECT id,manager_id AS managerId,status FROM ${table} WHERE id=?`).get(id) as { id: string; managerId: string | null; status: string } | undefined ?? null;
    });
  }

  listManagedResources(kind: "PROJECT" | "WAREHOUSE", managerId: string) {
    return this.withTransaction(() => {
      const table = kind === "PROJECT" ? "project" : "warehouse";
      return this.db.prepare(`SELECT id,manager_id AS managerId,status FROM ${table} WHERE manager_id=? ORDER BY id`).all(managerId) as { id: string; managerId: string | null; status: string }[];
    });
  }

  managedResourceHasDependentAssignments(kind: "PROJECT" | "WAREHOUSE", id: string): boolean {
    return this.withTransaction(() => {
      const query = kind === "PROJECT"
        ? "SELECT 1 FROM employee_project_assignment a JOIN employee e ON e.id=a.employee_id JOIN role r ON r.id=e.role_id WHERE a.project_id=? AND a.status='ACTIVE' AND r.key='worker' LIMIT 1"
        : "SELECT 1 FROM employee_warehouse_assignment WHERE warehouse_id=? AND status='ACTIVE' LIMIT 1";
      return Boolean(this.db.prepare(query).get(id));
    });
  }

  syncManagedResources(kind: "PROJECT" | "WAREHOUSE", managerId: string, ids: readonly string[], audit: Required<MutationAuditContext>, timestamp: string): void {
    this.withTransaction(() => {
      const table = kind === "PROJECT" ? "project" : "warehouse";
      const history = `${table}_manager_ownership_history`;
      const foreign = `${table}_id`;
      const current = this.listManagedResources(kind, managerId);
      const previous = new Set(current.map(row => row.id));
      const next = new Set(ids);
      for (const row of current) if (!next.has(row.id)) {
        this.db.prepare(`UPDATE ${history} SET status='ENDED',end_date=?,actor_user_id=?,actor_label=?,transaction_id=?,updated_at=? WHERE ${foreign}=? AND end_date IS NULL`).run(timestamp, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, row.id);
        this.db.prepare(`UPDATE ${table} SET manager_id=NULL,updated_at=? WHERE id=?`).run(timestamp, row.id);
      }
      for (const id of next) {
        if (!previous.has(id)) this.db.prepare(`INSERT INTO ${history}(id,${foreign},manager_id,status,start_date,end_date,notes,actor_user_id,actor_label,transaction_id,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,NULL,NULL,?,?,?,?,?)`).run(this.dependencies.id(), id, managerId, timestamp, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, timestamp);
        this.db.prepare(`UPDATE ${table} SET manager_id=?,updated_at=? WHERE id=?`).run(managerId, timestamp, id);
      }
    });
  }

  assignEmployeeWorkplace(input: EmployeeAssignWorkplaceInput, audit: Required<MutationAuditContext>, timestamp: string): void {
    this.withTransaction(() => {
      const manager = this.db.prepare("SELECT id,manager_id AS target FROM employee_manager_assignment WHERE worker_id=? AND status='ACTIVE'").get(input.employeeId) as { id: string; target: string } | undefined;
      const project = this.db.prepare("SELECT id,project_id AS target FROM employee_project_assignment WHERE employee_id=? AND status='ACTIVE'").get(input.employeeId) as { id: string; target: string } | undefined;
      const warehouse = this.db.prepare("SELECT id,warehouse_id AS target FROM employee_warehouse_assignment WHERE employee_id=? AND status='ACTIVE'").get(input.employeeId) as { id: string; target: string } | undefined;
      if (input.nextType === "PROJECT" && project?.target === input.projectId && manager?.target === input.managerId && !warehouse) return;
      if (input.nextType === "WAREHOUSE" && warehouse?.target === input.warehouseId && !manager && !project) return;
      const nextManager = input.nextType === "PROJECT" ? input.managerId : null;
      const close = (table: string, id: string) => this.db.prepare(`UPDATE ${table} SET status='ENDED',end_date=?,notes=COALESCE(?,notes),actor_user_id=?,actor_label=?,transaction_id=?,updated_at=? WHERE id=?`).run(timestamp, input.notes ?? null, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, id);
      if (manager && manager.target !== nextManager) close("employee_manager_assignment", manager.id);
      if (project) close("employee_project_assignment", project.id);
      if (warehouse) close("employee_warehouse_assignment", warehouse.id);
      const insert = (table: string, employeeColumn: string, targetColumn: string, target: string) => this.db.prepare(`INSERT INTO ${table}(id,${employeeColumn},${targetColumn},status,start_date,end_date,notes,actor_user_id,actor_label,transaction_id,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,NULL,?,?,?,?,?,?)`).run(this.dependencies.id(), input.employeeId, target, timestamp, input.notes ?? null, audit.actorUserId, audit.actorLabel, audit.transactionId, timestamp, timestamp);
      if (input.nextType === "PROJECT") {
        if (!manager || manager.target !== nextManager) insert("employee_manager_assignment", "worker_id", "manager_id", input.managerId!);
        insert("employee_project_assignment", "employee_id", "project_id", input.projectId!);
      }
      if (input.nextType === "WAREHOUSE") insert("employee_warehouse_assignment", "employee_id", "warehouse_id", input.warehouseId!);
    });
  }

  getEmployeeTransitionLinks(id: string): EmployeeTransitionLinks {
    return this.withTransaction(() => {
      const row = this.db.prepare(`SELECT
        EXISTS(SELECT 1 FROM employee_manager_assignment WHERE worker_id=? AND status='ACTIVE') AS manager,
        EXISTS(SELECT 1 FROM employee_project_assignment WHERE employee_id=? AND status='ACTIVE') AS project,
        EXISTS(SELECT 1 FROM employee_warehouse_assignment WHERE employee_id=? AND status='ACTIVE') AS warehouse,
        EXISTS(SELECT 1 FROM project WHERE manager_id=? AND status='ACTIVE') AS managedProjects,
        EXISTS(SELECT 1 FROM employee_manager_assignment WHERE manager_id=? AND status='ACTIVE') AS workers,
        EXISTS(SELECT 1 FROM warehouse WHERE manager_id=? AND status='ACTIVE') AS managedWarehouses
      `).get(id, id, id, id, id, id) as Record<string, number>;
      return { hasActiveManagerAssignment: Boolean(row.manager), hasActiveProjectAssignment: Boolean(row.project),
        hasActiveWarehouseAssignment: Boolean(row.warehouse), hasActiveManagedProjects: Boolean(row.managedProjects),
        hasActiveWorkers: Boolean(row.workers), hasActiveManagedWarehouses: Boolean(row.managedWarehouses) };
    });
  }

  employeeHasPreservedEvidence(id: string): boolean {
    return this.withTransaction(() => {
      const references = [
        ["employee_manager_assignment", "worker_id=? OR manager_id=?", [id, id]],
        ["employee_project_assignment", "employee_id=?", [id]], ["employee_warehouse_assignment", "employee_id=?", [id]],
        ["project_manager_ownership_history", "manager_id=?", [id]], ["warehouse_manager_ownership_history", "manager_id=?", [id]],
        ["project", "manager_id=?", [id]], ["warehouse", "manager_id=?", [id]],
        ["employee_salary_payment", "employee_id=?", [id]], ["employee_salary_earning", "employee_id=?", [id]],
        ["debt_account", "worker_id=?", [id]],
      ] as const;
      for (const [table, predicate, values] of references) {
        const schema = this.db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table) as { type: string } | undefined;
        if (!schema) continue;
        if (schema.type !== "table") throw new TypeError(`Invalid employee evidence table: ${table}`);
        if (this.db.prepare(`SELECT 1 FROM ${table} WHERE ${predicate} LIMIT 1`).get(...values)) return true;
      }
      return false;
    });
  }

  deleteEmployee(id: string): boolean {
    return this.withTransaction(() => {
      if (this.employeeHasPreservedEvidence(id)) throw new Error("Employee evidence prevents deletion");
      this.db.prepare("DELETE FROM employee_state_history WHERE employee_id=?").run(id);
      return this.db.prepare("DELETE FROM employee WHERE id=?").run(id).changes > 0;
    });
  }

  listEmployeesPaged(query: { filters?: EmployeeListFilters; cursor?: string; limit: number }) {
    return this.withTransaction(() => {
      const where = this.employeeWhere(query.filters);
      const total = this.countEmployees(query.filters);
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        where.sql += `${where.sql ? " AND " : " WHERE "}(created_at<? OR (created_at=? AND id<?))`;
        where.values.push(cursor.sortKey, cursor.sortKey, cursor.id);
      }
      const rows = this.db.prepare(`SELECT id FROM employee${where.sql} ORDER BY created_at DESC,id DESC LIMIT ?`).all(...where.values, query.limit + 1) as { id: string }[];
      const items = rows.slice(0, query.limit).map(row => this.getEmployeeById(row.id)!);
      const last = items.at(-1);
      return { items, total, nextCursor: rows.length > query.limit && last ? encodeCursor({ sortKey: last.createdAt, id: last.id }) : null };
    });
  }

  getEmployeeById(id: string): ExactEmployee | null {
    return readExactEmployee(this.db, id, this.lock) ?? null;
  }

  listEmployeeStateHistory(employeeId?: string): ExactEmployeeStateHistory[] {
    return this.withTransaction(() => {
      const ids = employeeId === undefined
        ? this.db.prepare("SELECT DISTINCT employee_id AS id FROM employee_state_history").all() as { id: string }[]
        : [{ id: employeeId }];
      return ids.flatMap(row => readExactEmployeeHistory(this.db, row.id, this.lock)).sort((a, b) =>
        b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    });
  }

  private appendHistory(employee: ExactEmployee, event: "CREATED" | "UPDATED", audit: Required<MutationAuditContext>) {
    const timestamp = event === "CREATED" ? employee.createdAt : employee.updatedAt;
    const history = exactEmployeeStateHistorySchema.parse({
      id: this.dependencies.id(), employeeId: employee.id, roleId: employee.roleId, status: employee.status,
      salaryReference: employee.salaryReference, currency: employee.currency, eventType: event, startDate: timestamp,
      endDate: null, notes: employee.notes, actorUserId: audit.actorUserId, transactionId: audit.transactionId,
      createdAt: timestamp, updatedAt: timestamp,
    });
    const reference = bindExactSalaryReference(history.salaryReference);
    this.db.prepare(`INSERT INTO employee_state_history(
      id,employee_id,role_id,status,salary_reference_units,salary_period,salary_currency,event_type,
      start_date,end_date,notes,actor_user_id,actor_label,transaction_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?)`).run(
      history.id, history.employeeId, history.roleId, history.status, reference.units, reference.period, reference.currency,
      history.eventType, history.startDate, history.notes, history.actorUserId, audit.actorLabel, history.transactionId, history.createdAt, history.updatedAt,
    );
  }

  /** Trusted workspace restore only, never a public permission-free employee endpoint. */
  upsertEmployee(input: ExactEmployee): ExactEmployee {
    return this.withTransaction(() => {
      const employee = exactEmployeeSchema.parse(input);
      const audit = { actorUserId: null, actorLabel: null, transactionId: null };
      return this.getEmployeeById(employee.id) ? this.updateEmployee(employee, audit)! : this.createEmployee(employee, audit);
    });
  }

  createEmployee(input: ExactEmployee, audit: Required<MutationAuditContext>): ExactEmployee {
    return this.withTransaction(() => {
      const employee = exactEmployeeSchema.parse(input);
      const reference = bindExactSalaryReference(employee.salaryReference);
      this.db.prepare(`INSERT INTO employee(
        id,first_name,last_name,phone,role_id,status,salary_reference_units,salary_period,salary_currency,
        notes,occupation,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        employee.id, employee.firstName, employee.lastName, employee.phone, employee.roleId, employee.status,
        reference.units, reference.period, reference.currency, employee.notes, employee.occupation, employee.createdAt, employee.updatedAt,
      );
      this.appendHistory(employee, "CREATED", audit);
      return this.getEmployeeById(employee.id)!;
    });
  }

  updateEmployee(input: ExactEmployee, audit: Required<MutationAuditContext>): ExactEmployee | null {
    return this.withTransaction(() => {
      const employee = exactEmployeeSchema.parse(input);
      const previous = this.getEmployeeById(employee.id);
      if (!previous) return null;
      const reference = bindExactSalaryReference(employee.salaryReference);
      this.db.prepare(`UPDATE employee SET first_name=?,last_name=?,phone=?,role_id=?,status=?,salary_reference_units=?,
        salary_period=?,salary_currency=?,notes=?,occupation=?,updated_at=? WHERE id=?`).run(
        employee.firstName, employee.lastName, employee.phone, employee.roleId, employee.status, reference.units,
        reference.period, reference.currency, employee.notes, employee.occupation, employee.updatedAt, employee.id,
      );
      const stateChanged = previous.roleId !== employee.roleId || previous.status !== employee.status
        || previous.salaryReference?.period !== employee.salaryReference?.period
        || previous.salaryReference?.amount !== employee.salaryReference?.amount;
      if (stateChanged) {
        this.db.prepare(`UPDATE employee_state_history SET end_date=?,actor_user_id=?,actor_label=?,transaction_id=?,updated_at=?
          WHERE employee_id=? AND end_date IS NULL`).run(employee.updatedAt, audit.actorUserId, audit.actorLabel, audit.transactionId, employee.updatedAt, employee.id);
        this.appendHistory(employee, "UPDATED", audit);
      }
      return this.getEmployeeById(employee.id);
    });
  }
}
