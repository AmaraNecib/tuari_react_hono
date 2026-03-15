import { prisma } from "./prisma";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "phoneNumber" TEXT NOT NULL UNIQUE,
    "phoneNumberVerified" INTEGER NOT NULL DEFAULT 0,
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
  `CREATE TABLE IF NOT EXISTS "app_bootstrap_state" (
    "singleton" INTEGER NOT NULL PRIMARY KEY CHECK ("singleton" = 1),
    "created_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "todos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "todos_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL UNIQUE,
    "role_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "warehouse_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "employee_manager_assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worker_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_manager_assignment_worker_id_fkey"
      FOREIGN KEY ("worker_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_manager_assignment_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "employee_project_assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_project_assignment_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_project_assignment_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId")',
  'CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId")',
  'CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key" ON "account" ("providerId", "accountId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "user_phoneNumber_key" ON "user" ("phoneNumber")',
  'CREATE INDEX IF NOT EXISTS "idx_todos_user_id" ON "todos" ("user_id")',
  'CREATE INDEX IF NOT EXISTS "employee_role_id_idx" ON "employee" ("role_id")',
  'CREATE INDEX IF NOT EXISTS "project_manager_id_idx" ON "project" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "warehouse_manager_id_idx" ON "warehouse" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "employee_manager_assignment_worker_id_idx" ON "employee_manager_assignment" ("worker_id")',
  'CREATE INDEX IF NOT EXISTS "employee_manager_assignment_manager_id_idx" ON "employee_manager_assignment" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "employee_project_assignment_employee_id_idx" ON "employee_project_assignment" ("employee_id")',
  'CREATE INDEX IF NOT EXISTS "employee_project_assignment_project_id_idx" ON "employee_project_assignment" ("project_id")',
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_manager_assignment_active_worker_key" ON "employee_manager_assignment" ("worker_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_project_assignment_active_employee_key" ON "employee_project_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
];

const additiveStatements = [
  'ALTER TABLE "user" ADD COLUMN "phoneNumber" TEXT',
  'ALTER TABLE "user" ADD COLUMN "phoneNumberVerified" INTEGER DEFAULT 0',
];

const roleSeeds = [
  { key: "worker", name: "عامل", description: "الدور التنفيذي الأساسي للعمال الميدانيين" },
  {
    key: "project_manager",
    name: "مدير مشروع",
    description: "مسؤول عن متابعة العمال والمشاريع الميدانية",
  },
  {
    key: "warehouse_manager",
    name: "مدير مخزن",
    description: "مسؤول عن تشغيل وإدارة المستودعات",
  },
] as const;

function isDuplicateColumnError(error: unknown) {
  return error instanceof Error && error.message.includes("duplicate column name");
}

async function ensureSeedRoles() {
  for (const role of roleSeeds) {
    const existing = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "role" WHERE key = ? LIMIT 1',
      role.key,
    ))[0];

    const timestamp = new Date().toISOString();

    if (!existing) {
      await prisma.$executeRawUnsafe(
        'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        role.key,
        role.name,
        role.description,
        1,
        timestamp,
        timestamp,
      );
      continue;
    }

    await prisma.$executeRawUnsafe(
      'UPDATE "role" SET name = ?, description = ?, is_system = 1, updated_at = ? WHERE key = ?',
      role.name,
      role.description,
      timestamp,
      role.key,
    );
  }
}

export async function ensureDatabaseSchema(): Promise<void> {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  for (const statement of schemaStatements) {
    await prisma.$executeRawUnsafe(statement);
  }

  for (const statement of additiveStatements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      if (!isDuplicateColumnError(error)) {
        throw error;
      }
    }
  }

  await ensureSeedRoles();
}
