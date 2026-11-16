import type { BetterSqliteDatabase } from "../../types/sqlite";
import { companyIndexStatements, rolePermissionSeeds, roleSeeds, schemaStatements } from "./schema-definitions";
import { exactDebtSchemaStatements } from "../../modules/company/adapters/exact-finance-schema";
import { exactEmployeeProfileSchemaStatements } from "../../modules/company/adapters/exact-workforce-schema";
import { exactWorkforceEarningSchemaStatements } from "../../modules/company/adapters/exact-workforce-earning-schema";

const referenceTables = [
  "user", "session", "account", "verification", "app_bootstrap_state", "app_schema_state",
  "user_profile_history", "role", "role_permission", "project", "warehouse", "recovery_key",
  "employee_manager_assignment", "employee_project_assignment", "employee_warehouse_assignment",
  "project_manager_ownership_history", "warehouse_manager_ownership_history",
] as const;

const referenceIndexes = new Set([
  "employee_role_id_idx", "project_manager_id_idx", "warehouse_manager_id_idx",
  "employee_manager_assignment_worker_id_idx", "employee_manager_assignment_manager_id_idx",
  "employee_project_assignment_employee_id_idx", "employee_project_assignment_project_id_idx",
  "employee_warehouse_assignment_employee_id_idx", "employee_warehouse_assignment_warehouse_id_idx",
  "project_manager_ownership_history_project_id_idx", "project_manager_ownership_history_manager_id_idx",
  "warehouse_manager_ownership_history_warehouse_id_idx", "warehouse_manager_ownership_history_manager_id_idx",
  "employee_manager_assignment_active_worker_key", "employee_project_assignment_active_employee_key",
  "employee_warehouse_assignment_active_employee_key", "project_manager_ownership_history_active_project_key",
  "warehouse_manager_ownership_history_active_warehouse_key",
  "recovery_key_status_idx", "recovery_key_key_hash_idx",
]);

function tableStatement(name: string): string {
  const statement = schemaStatements.find(sql => sql.startsWith(`CREATE TABLE IF NOT EXISTS "${name}"`));
  if (!statement) throw new Error(`Exact workspace reference DDL is missing for ${name}`);
  return statement;
}

function validateExactMarker(db: BetterSqliteDatabase): void {
  const marker = db.prepare("SELECT type FROM sqlite_master WHERE lower(name)='exact_money_schema'").get() as { type: string } | undefined;
  if (marker?.type !== "table") throw new Error("Exact workspace schema marker is required");
  const columns = db.pragma("table_info(exact_money_schema)") as { name: string; type: string; pk: number; notnull: number }[];
  if (columns.length !== 2 || columns[0]?.name !== "slice" || columns[0]?.type.toUpperCase() !== "TEXT" || columns[0]?.pk !== 1
    || columns[1]?.name !== "version" || columns[1]?.type.toUpperCase() !== "INTEGER" || columns[1]?.notnull !== 1) {
    throw new Error("Malformed exact workspace schema marker");
  }
  const rows = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all() as { slice: string; version: number }[];
  if (rows.length !== 2 || rows[0]?.slice !== "debt" || rows[0]?.version !== 1 || rows[1]?.slice !== "workforce" || rows[1]?.version !== 1) {
    throw new Error("Exact debt and workforce schema version 1 are required");
  }
}

function requireColumns(db: BetterSqliteDatabase, table: string, expected: Record<string, string>): void {
  const type = db.prepare("SELECT type FROM sqlite_master WHERE name=?").get(table) as { type: string } | undefined;
  if (type?.type !== "table") throw new Error(`Invalid exact workspace table ${table}`);
  const columns = db.pragma(`table_info("${table}")`) as { name: string; type: string }[];
  for (const [name, expectedType] of Object.entries(expected)) {
    const actual = columns.find(column => column.name === name)?.type.toUpperCase();
    if (actual !== expectedType) throw new Error(`Invalid exact workspace column ${table}.${name}`);
  }
}

function validateWorkspaceIdentity(db: BetterSqliteDatabase): string {
  const identityTable = db.prepare("SELECT type FROM sqlite_master WHERE name='exact_workspace_identity'").get() as { type: string } | undefined;
  if (identityTable?.type !== "table") throw new Error("Exact workspace identity table is required");
  requireColumns(db, "exact_workspace_identity", { singleton: "INTEGER", workspace_id: "TEXT" });
  const definition = db.prepare("SELECT sql FROM sqlite_master WHERE name='exact_workspace_identity'").get() as { sql: string } | undefined;
  const columns = db.pragma('table_info("exact_workspace_identity")') as { name: string; pk: number; notnull: number }[];
  if (!definition?.sql || !/CHECK\s*\(\s*singleton\s*=\s*1\s*\)/i.test(definition.sql) || !/workspace_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(definition.sql)
    || columns.length !== 2 || columns[0]?.name !== "singleton" || columns[0]?.pk !== 1 || columns[1]?.name !== "workspace_id" || columns[1]?.notnull !== 1) {
    throw new Error("Malformed exact workspace identity table");
  }
  const rows = db.prepare("SELECT singleton,workspace_id FROM exact_workspace_identity").all() as { singleton: number; workspace_id: string }[];
  if (rows.length !== 1 || rows[0]?.singleton !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rows[0].workspace_id)) {
    throw new Error("A valid singleton exact workspace identity is required");
  }
  return rows[0].workspace_id;
}

export function getExactWorkspaceId(db: BetterSqliteDatabase): string {
  return validateWorkspaceIdentity(db);
}

function validateExactWorkspace(db: BetterSqliteDatabase): void {
  validateExactMarker(db);
  validateWorkspaceIdentity(db);
  requireColumns(db, "user", { id: "TEXT", name: "TEXT", email: "TEXT", phoneNumber: "TEXT", phoneNumberVerified: "INTEGER" });
  requireColumns(db, "session", { id: "TEXT", token: "TEXT", userId: "TEXT", expiresAt: "DATETIME" });
  requireColumns(db, "account", { id: "TEXT", providerId: "TEXT", userId: "TEXT", password: "TEXT" });
  requireColumns(db, "verification", { id: "TEXT", identifier: "TEXT", value: "TEXT" });
  requireColumns(db, "app_bootstrap_state", { singleton: "INTEGER", user_id: "TEXT" });
  requireColumns(db, "role", { id: "TEXT", key: "TEXT", name: "TEXT", is_system: "INTEGER" });
  requireColumns(db, "role_permission", { id: "TEXT", role_id: "TEXT", permission: "TEXT" });
  requireColumns(db, "project", { id: "TEXT", name: "TEXT", manager_id: "TEXT", status: "TEXT" });
  requireColumns(db, "warehouse", { id: "TEXT", name: "TEXT", manager_id: "TEXT", status: "TEXT" });
  requireColumns(db, "employee_manager_assignment", { id: "TEXT", worker_id: "TEXT", manager_id: "TEXT", actor_user_id: "TEXT", transaction_id: "TEXT" });
  requireColumns(db, "employee_project_assignment", { id: "TEXT", employee_id: "TEXT", project_id: "TEXT", actor_user_id: "TEXT", transaction_id: "TEXT" });
  requireColumns(db, "employee_warehouse_assignment", { id: "TEXT", employee_id: "TEXT", warehouse_id: "TEXT", actor_user_id: "TEXT", transaction_id: "TEXT" });
  requireColumns(db, "project_manager_ownership_history", { id: "TEXT", project_id: "TEXT", manager_id: "TEXT", actor_user_id: "TEXT", transaction_id: "TEXT" });
  requireColumns(db, "warehouse_manager_ownership_history", { id: "TEXT", warehouse_id: "TEXT", manager_id: "TEXT", actor_user_id: "TEXT", transaction_id: "TEXT" });
  requireColumns(db, "recovery_key", { id: "TEXT", prefix: "TEXT", key_hash: "TEXT", status: "TEXT", created_at: "TEXT" });
  requireColumns(db, "user_profile_history", { id: "TEXT", user_id: "TEXT", actor_user_id: "TEXT", transaction_id: "TEXT" });
  requireColumns(db, "employee", { id: "TEXT", role_id: "TEXT", salary_reference_units: "INTEGER", salary_period: "TEXT", salary_currency: "TEXT" });
  requireColumns(db, "employee_state_history", { id: "TEXT", employee_id: "TEXT", salary_reference_units: "INTEGER", salary_period: "TEXT", salary_currency: "TEXT" });
  requireColumns(db, "employee_salary_earning", { id: "TEXT", employee_id: "TEXT", approved_amount_minor: "INTEGER", unallocated_amount_minor: "INTEGER" });
  requireColumns(db, "employee_salary_earning_segment", { earning_id: "TEXT", id: "TEXT", ordinal: "INTEGER", project_id: "TEXT", amount_minor: "INTEGER", days: "INTEGER" });
  requireColumns(db, "debt_account", { current_balance_minor: "INTEGER", currency: "TEXT" });
  requireColumns(db, "debt_entry", { signed_amount_minor: "INTEGER", balance_after_minor: "INTEGER", posting_sequence: "INTEGER" });
  const forbidden = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('employee_salary_cash','employee_salary_payment','employee_salary_payment_split','employee_salary_advance','employee_salary_opening_review','employee_salary_settlement','employee_salary_correction') ORDER BY name").all();
  if (forbidden.length) throw new Error("Later payroll lifecycle schema is not part of the exact workspace");
  const legacy = db.pragma("table_info(employee)") as { name: string }[];
  if (legacy.some(column => column.name === "salary_amount_dzd")) throw new Error("Legacy employee money cannot coexist with exact workspace storage");
}

function seedRoles(db: BetterSqliteDatabase): void {
  const insertRole = db.prepare("INSERT INTO role(id,key,name,description,is_system,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
  const insertPermission = db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)");
  const timestamp = new Date().toISOString();
  const idByKey = new Map<string, string>();
  for (const role of roleSeeds) {
    const id = crypto.randomUUID();
    idByKey.set(role.key, id);
    insertRole.run(id, role.key, role.name, role.description, role.isSystem ? 1 : 0, timestamp, timestamp);
  }
  for (const { roleId, permission } of rolePermissionSeeds()) {
    const id = idByKey.get(roleId);
    if (id) insertPermission.run(crypto.randomUUID(), id, permission, timestamp, timestamp);
  }
}

/** Create and validate a fresh slice-543 workspace. Existing databases are never migrated here. */
export function ensureExactNormalWorkspaceSchema(db: BetterSqliteDatabase): void {
  const hasMarker = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE lower(name)='exact_money_schema'").get());
  if (hasMarker) {
    validateExactWorkspace(db);
    return;
  }

  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
  if (existing) throw new Error("A fresh exact workspace is required; existing databases are not converted or reset");

  const create = db.transaction(() => {
    db.exec("CREATE TABLE exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)");
    db.exec("CREATE TABLE exact_workspace_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1), workspace_id TEXT NOT NULL UNIQUE)");
    db.prepare("INSERT INTO exact_workspace_identity(singleton,workspace_id) VALUES (1,?)").run(crypto.randomUUID());
    for (const name of referenceTables) db.exec(tableStatement(name));
    for (const sql of exactEmployeeProfileSchemaStatements) db.exec(sql);
    db.exec("CREATE TABLE external_counterparty(id TEXT NOT NULL PRIMARY KEY)");
    db.exec("CREATE TABLE invoice(id TEXT NOT NULL PRIMARY KEY)");
    for (const sql of exactDebtSchemaStatements) {
      if (sql.startsWith("CREATE TABLE IF NOT EXISTS exact_money_schema") || sql.startsWith("INSERT INTO exact_money_schema")) continue;
      db.exec(sql);
    }
    for (const sql of exactWorkforceEarningSchemaStatements) db.exec(sql);
    for (const sql of companyIndexStatements) {
      const match = sql.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "([^"]+)"/);
      if (match && referenceIndexes.has(match[1]!)) db.exec(sql);
    }
    db.exec("CREATE INDEX exact_employee_history_employee_idx ON employee_state_history(employee_id,start_date,id)");
    db.prepare("INSERT INTO exact_money_schema(slice,version) VALUES ('debt',1),('workforce',1)").run();
    seedRoles(db);
  });
  create.immediate();
  validateExactWorkspace(db);
}
