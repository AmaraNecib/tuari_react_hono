import { prisma } from "./prisma";
import { systemRoles } from "../../modules/roles/system-roles";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "emailVerified" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT,
    "role_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employees_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "roles" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "projects_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employees" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "warehouses_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employees" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "employee_manager_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worker_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_manager_assignments_worker_id_fkey"
      FOREIGN KEY ("worker_id") REFERENCES "employees" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_manager_assignments_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employees" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "employee_project_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_project_assignments_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_project_assignments_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "projects" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "summary_key" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "occurred_at" DATETIME NOT NULL,
    "before_json" JSON,
    "after_json" JSON,
    "metadata_json" JSON,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "audit_logs_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "user" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId")',
  'CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId")',
  'CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key" ON "account" ("providerId", "accountId")',
  'CREATE INDEX IF NOT EXISTS "idx_roles_deleted_at" ON "roles" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_employees_role_id" ON "employees" ("role_id")',
  'CREATE INDEX IF NOT EXISTS "idx_employees_status" ON "employees" ("status")',
  'CREATE INDEX IF NOT EXISTS "idx_employees_deleted_at" ON "employees" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_projects_manager_id" ON "projects" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "idx_projects_status" ON "projects" ("status")',
  'CREATE INDEX IF NOT EXISTS "idx_projects_deleted_at" ON "projects" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_warehouses_manager_id" ON "warehouses" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "idx_warehouses_status" ON "warehouses" ("status")',
  'CREATE INDEX IF NOT EXISTS "idx_warehouses_deleted_at" ON "warehouses" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_manager_assignments_worker_status" ON "employee_manager_assignments" ("worker_id", "status")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_manager_assignments_manager_status" ON "employee_manager_assignments" ("manager_id", "status")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_manager_assignments_deleted_at" ON "employee_manager_assignments" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_manager_assignments_start_date" ON "employee_manager_assignments" ("start_date")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_project_assignments_employee_status" ON "employee_project_assignments" ("employee_id", "status")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_project_assignments_project_status" ON "employee_project_assignments" ("project_id", "status")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_project_assignments_deleted_at" ON "employee_project_assignments" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_employee_project_assignments_start_date" ON "employee_project_assignments" ("start_date")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "uq_employee_manager_assignments_active_worker" ON "employee_manager_assignments" ("worker_id") WHERE "deleted_at" IS NULL AND "status" = \'ACTIVE\'',
  'CREATE UNIQUE INDEX IF NOT EXISTS "uq_employee_project_assignments_active_pair" ON "employee_project_assignments" ("employee_id", "project_id") WHERE "deleted_at" IS NULL AND "status" = \'ACTIVE\'',
  'CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")',
  'CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_id" ON "audit_logs" ("actor_user_id")',
  'CREATE INDEX IF NOT EXISTS "idx_audit_logs_occurred_at" ON "audit_logs" ("occurred_at")',
];

export async function ensureDatabaseSchema(): Promise<void> {
  for (const statement of schemaStatements) {
    await prisma.$executeRawUnsafe(statement);
  }

  for (const role of systemRoles) {
    await prisma.role.upsert({
      where: {
        key: role.key,
      },
      update: {
        name: role.name,
        description: role.description,
        isSystem: true,
        deletedAt: null,
      },
      create: {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
        deletedAt: null,
      },
    });
  }
}
