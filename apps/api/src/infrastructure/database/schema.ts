import { prisma } from "./prisma";

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
  `CREATE TABLE IF NOT EXISTS "workers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "salary_dzd" INTEGER NOT NULL,
    "manager_id" TEXT,
    "current_project_id" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "workers_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "workers" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "workers_current_project_id_fkey"
      FOREIGN KEY ("current_project_id") REFERENCES "projects" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "warehouses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "manager_id" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "warehouses_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "workers" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "projects_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "workers" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "projects_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "salary_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worker_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount_dzd" INTEGER NOT NULL,
    "note" TEXT,
    "before_salary_dzd" INTEGER,
    "after_salary_dzd" INTEGER,
    "effective_at" DATETIME NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "salary_transactions_worker_id_fkey"
      FOREIGN KEY ("worker_id") REFERENCES "workers" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "salary_transactions_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "user" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
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
  'CREATE INDEX IF NOT EXISTS "idx_workers_manager_id" ON "workers" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "idx_workers_current_project_id" ON "workers" ("current_project_id")',
  'CREATE INDEX IF NOT EXISTS "idx_workers_role" ON "workers" ("role")',
  'CREATE INDEX IF NOT EXISTS "idx_workers_status" ON "workers" ("status")',
  'CREATE INDEX IF NOT EXISTS "idx_workers_deleted_at" ON "workers" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_projects_manager_id" ON "projects" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "idx_projects_warehouse_id" ON "projects" ("warehouse_id")',
  'CREATE INDEX IF NOT EXISTS "idx_projects_deleted_at" ON "projects" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_warehouses_manager_id" ON "warehouses" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "idx_warehouses_deleted_at" ON "warehouses" ("deleted_at")',
  'CREATE INDEX IF NOT EXISTS "idx_salary_transactions_worker_id" ON "salary_transactions" ("worker_id")',
  'CREATE INDEX IF NOT EXISTS "idx_salary_transactions_actor_id" ON "salary_transactions" ("created_by_user_id")',
  'CREATE INDEX IF NOT EXISTS "idx_salary_transactions_effective_at" ON "salary_transactions" ("effective_at")',
  'CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")',
  'CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_id" ON "audit_logs" ("actor_user_id")',
  'CREATE INDEX IF NOT EXISTS "idx_audit_logs_occurred_at" ON "audit_logs" ("occurred_at")',
];

export async function ensureDatabaseSchema(): Promise<void> {
  for (const statement of schemaStatements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
