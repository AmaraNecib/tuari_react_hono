import { prisma } from "./prisma";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "phoneNumber" TEXT NOT NULL UNIQUE,
    "phoneNumberVerified" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
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
    "created_at" DATETIME NOT NULL,
    "user_id" TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS "app_schema_state" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "executed_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "user_profile_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_profile_history_user_id_fkey"
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
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'LEFT')),
    "salary_amount_dzd" REAL,
    "salary_period" TEXT,
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
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'STOPPED', 'COMPLETED', 'ARCHIVED')),
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
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
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
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED')),
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
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
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED')),
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_project_assignment_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_project_assignment_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "employee_warehouse_assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED')),
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_warehouse_assignment_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_warehouse_assignment_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "employee_state_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "salary_amount_dzd" REAL,
    "salary_period" TEXT,
    "event_type" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_state_history_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_state_history_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "project_manager_ownership_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_manager_ownership_history_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_manager_ownership_history_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "warehouse_manager_ownership_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouse_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "warehouse_manager_ownership_history_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "warehouse_manager_ownership_history_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "employee_salary_payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "expected_amount_dzd" REAL NOT NULL,
    "actual_amount_dzd" REAL NOT NULL,
    "payment_date" DATETIME NOT NULL,
    "note" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employee_salary_payment_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId")',
  'CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId")',
  'CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key" ON "account" ("providerId", "accountId")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "user_phoneNumber_key" ON "user" ("phoneNumber")',
  'CREATE INDEX IF NOT EXISTS "employee_role_id_idx" ON "employee" ("role_id")',
  'CREATE INDEX IF NOT EXISTS "project_manager_id_idx" ON "project" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "warehouse_manager_id_idx" ON "warehouse" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "employee_manager_assignment_worker_id_idx" ON "employee_manager_assignment" ("worker_id")',
  'CREATE INDEX IF NOT EXISTS "employee_manager_assignment_manager_id_idx" ON "employee_manager_assignment" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "employee_project_assignment_employee_id_idx" ON "employee_project_assignment" ("employee_id")',
  'CREATE INDEX IF NOT EXISTS "employee_project_assignment_project_id_idx" ON "employee_project_assignment" ("project_id")',
  'CREATE INDEX IF NOT EXISTS "employee_warehouse_assignment_employee_id_idx" ON "employee_warehouse_assignment" ("employee_id")',
  'CREATE INDEX IF NOT EXISTS "employee_warehouse_assignment_warehouse_id_idx" ON "employee_warehouse_assignment" ("warehouse_id")',
  'CREATE INDEX IF NOT EXISTS "employee_state_history_employee_id_idx" ON "employee_state_history" ("employee_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "project_manager_ownership_history_project_id_idx" ON "project_manager_ownership_history" ("project_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "project_manager_ownership_history_manager_id_idx" ON "project_manager_ownership_history" ("manager_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_warehouse_id_idx" ON "warehouse_manager_ownership_history" ("warehouse_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_manager_id_idx" ON "warehouse_manager_ownership_history" ("manager_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "employee_salary_payment_employee_id_idx" ON "employee_salary_payment" ("employee_id", "payment_date")',
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_manager_assignment_active_worker_key" ON "employee_manager_assignment" ("worker_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_project_assignment_active_employee_key" ON "employee_project_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_warehouse_assignment_active_employee_key" ON "employee_warehouse_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_state_history_active_employee_key" ON "employee_state_history" ("employee_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "project_manager_ownership_history_active_project_key" ON "project_manager_ownership_history" ("project_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_active_warehouse_key" ON "warehouse_manager_ownership_history" ("warehouse_id") WHERE "end_date" IS NULL`,
];

const additiveStatements = [
  'ALTER TABLE "user" ADD COLUMN "phoneNumber" TEXT',
  'ALTER TABLE "user" ADD COLUMN "phoneNumberVerified" INTEGER DEFAULT 0',
  'ALTER TABLE "user" ADD COLUMN "created_at" DATETIME',
  'ALTER TABLE "user" ADD COLUMN "updated_at" DATETIME',
  'ALTER TABLE "session" ADD COLUMN "created_at" DATETIME',
  'ALTER TABLE "session" ADD COLUMN "updated_at" DATETIME',
  'ALTER TABLE "account" ADD COLUMN "createdAt" DATETIME',
  'ALTER TABLE "account" ADD COLUMN "updatedAt" DATETIME',
  'ALTER TABLE "verification" ADD COLUMN "createdAt" DATETIME',
  'ALTER TABLE "verification" ADD COLUMN "updatedAt" DATETIME',
  'ALTER TABLE "employee" ADD COLUMN "salary_amount_dzd" REAL',
  'ALTER TABLE "employee" ADD COLUMN "salary_period" TEXT',
  'ALTER TABLE "employee_manager_assignment" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "employee_manager_assignment" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "employee_manager_assignment" ADD COLUMN "transaction_id" TEXT',
  'ALTER TABLE "employee_project_assignment" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "employee_project_assignment" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "employee_project_assignment" ADD COLUMN "transaction_id" TEXT',
  'ALTER TABLE "employee_warehouse_assignment" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "employee_warehouse_assignment" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "employee_warehouse_assignment" ADD COLUMN "transaction_id" TEXT',
  'ALTER TABLE "employee_state_history" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "employee_state_history" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "employee_state_history" ADD COLUMN "transaction_id" TEXT',
  'ALTER TABLE "project_manager_ownership_history" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "project_manager_ownership_history" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "project_manager_ownership_history" ADD COLUMN "transaction_id" TEXT',
  'ALTER TABLE "warehouse_manager_ownership_history" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "warehouse_manager_ownership_history" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "warehouse_manager_ownership_history" ADD COLUMN "transaction_id" TEXT',
  'ALTER TABLE "employee_salary_payment" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "employee_salary_payment" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "employee_salary_payment" ADD COLUMN "transaction_id" TEXT',
  'ALTER TABLE "user_profile_history" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "app_bootstrap_state" ADD COLUMN "user_id" TEXT',
];

const obsoleteMigrationKey = "drop_todos_table_v1";
const statusConstraintMigrationKey = "enforce_company_status_checks_v1";
const actorLabelBackfillMigrationKey = "backfill_actor_labels_v1";

const companyIndexStatements = [
  'CREATE INDEX IF NOT EXISTS "employee_role_id_idx" ON "employee" ("role_id")',
  'CREATE INDEX IF NOT EXISTS "project_manager_id_idx" ON "project" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "warehouse_manager_id_idx" ON "warehouse" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "employee_manager_assignment_worker_id_idx" ON "employee_manager_assignment" ("worker_id")',
  'CREATE INDEX IF NOT EXISTS "employee_manager_assignment_manager_id_idx" ON "employee_manager_assignment" ("manager_id")',
  'CREATE INDEX IF NOT EXISTS "employee_project_assignment_employee_id_idx" ON "employee_project_assignment" ("employee_id")',
  'CREATE INDEX IF NOT EXISTS "employee_project_assignment_project_id_idx" ON "employee_project_assignment" ("project_id")',
  'CREATE INDEX IF NOT EXISTS "employee_warehouse_assignment_employee_id_idx" ON "employee_warehouse_assignment" ("employee_id")',
  'CREATE INDEX IF NOT EXISTS "employee_warehouse_assignment_warehouse_id_idx" ON "employee_warehouse_assignment" ("warehouse_id")',
  'CREATE INDEX IF NOT EXISTS "employee_state_history_employee_id_idx" ON "employee_state_history" ("employee_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "project_manager_ownership_history_project_id_idx" ON "project_manager_ownership_history" ("project_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "project_manager_ownership_history_manager_id_idx" ON "project_manager_ownership_history" ("manager_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_warehouse_id_idx" ON "warehouse_manager_ownership_history" ("warehouse_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_manager_id_idx" ON "warehouse_manager_ownership_history" ("manager_id", "start_date")',
  'CREATE INDEX IF NOT EXISTS "employee_salary_payment_employee_id_idx" ON "employee_salary_payment" ("employee_id", "payment_date")',
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_manager_assignment_active_worker_key" ON "employee_manager_assignment" ("worker_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_project_assignment_active_employee_key" ON "employee_project_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_warehouse_assignment_active_employee_key" ON "employee_warehouse_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_state_history_active_employee_key" ON "employee_state_history" ("employee_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "project_manager_ownership_history_active_project_key" ON "project_manager_ownership_history" ("project_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_active_warehouse_key" ON "warehouse_manager_ownership_history" ("warehouse_id") WHERE "end_date" IS NULL`,
];

const companyStatusConstraintChecks = [
  {
    table: "employee",
    fragment: `"status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'LEFT'))`,
  },
  {
    table: "project",
    fragment: `"status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'STOPPED', 'COMPLETED', 'ARCHIVED'))`,
  },
  {
    table: "warehouse",
    fragment: `"status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))`,
  },
  {
    table: "employee_manager_assignment",
    fragment: `"status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED'))`,
  },
  {
    table: "employee_project_assignment",
    fragment: `"status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED'))`,
  },
  {
    table: "employee_warehouse_assignment",
    fragment: `"status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED'))`,
  },
] as const;

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

async function getTableColumns(tableName: string) {
  return prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(\"${tableName}\")`);
}

async function hasColumn(tableName: string, columnName: string) {
  const columns = await getTableColumns(tableName);

  return columns.some((column) => column.name === columnName);
}

async function getTableSql(tableName: string) {
  const [row] = await prisma.$queryRawUnsafe<Array<{ sql: string | null }>>(
    'SELECT "sql" FROM "sqlite_master" WHERE "type" = ? AND "name" = ? LIMIT 1',
    "table",
    tableName,
  );

  return row?.sql ?? "";
}

async function hasStatusCheckConstraints() {
  const tableSql = await Promise.all(
    companyStatusConstraintChecks.map(async ({ table, fragment }) => ({
      table,
      hasFragment: (await getTableSql(table)).includes(fragment),
    })),
  );

  return tableSql.every((entry) => entry.hasFragment);
}

async function syncLegacyTimestampColumns() {
  if ((await hasColumn("user", "createdAt")) || (await hasColumn("user", "updatedAt"))) {
    await prisma.$executeRawUnsafe(
      'UPDATE "user" SET "created_at" = COALESCE("created_at", "createdAt"), "updated_at" = COALESCE("updated_at", "updatedAt") WHERE "createdAt" IS NOT NULL OR "updatedAt" IS NOT NULL',
    );
  }

  if ((await hasColumn("session", "createdAt")) || (await hasColumn("session", "updatedAt"))) {
    await prisma.$executeRawUnsafe(
      'UPDATE "session" SET "created_at" = COALESCE("created_at", "createdAt"), "updated_at" = COALESCE("updated_at", "updatedAt") WHERE "createdAt" IS NOT NULL OR "updatedAt" IS NOT NULL',
    );
  }

  if ((await hasColumn("account", "created_at")) || (await hasColumn("account", "updated_at"))) {
    await prisma.$executeRawUnsafe(
      'UPDATE "account" SET "createdAt" = COALESCE("createdAt", "created_at"), "updatedAt" = COALESCE("updatedAt", "updated_at") WHERE "created_at" IS NOT NULL OR "updated_at" IS NOT NULL',
    );
  }

  if (
    (await hasColumn("verification", "created_at")) ||
    (await hasColumn("verification", "updated_at"))
  ) {
    await prisma.$executeRawUnsafe(
      'UPDATE "verification" SET "createdAt" = COALESCE("createdAt", "created_at"), "updatedAt" = COALESCE("updatedAt", "updated_at") WHERE "created_at" IS NOT NULL OR "updated_at" IS NOT NULL',
    );
  }
}

async function repairLegacyAuthTables() {
  if ((await hasColumn("account", "created_at")) || (await hasColumn("account", "updated_at"))) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "account_repaired"');
      await tx.$executeRawUnsafe(
        `CREATE TABLE "account_repaired" (
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
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO "account_repaired" (
          "id",
          "accountId",
          "providerId",
          "userId",
          "accessToken",
          "refreshToken",
          "idToken",
          "accessTokenExpiresAt",
          "refreshTokenExpiresAt",
          "scope",
          "password",
          "createdAt",
          "updatedAt"
        )
        SELECT
          "id",
          "accountId",
          "providerId",
          "userId",
          "accessToken",
          "refreshToken",
          "idToken",
          "accessTokenExpiresAt",
          "refreshTokenExpiresAt",
          "scope",
          "password",
          COALESCE("createdAt", "created_at", CURRENT_TIMESTAMP),
          COALESCE("updatedAt", "updated_at", CURRENT_TIMESTAMP)
        FROM "account"`,
      );

      const [sourceRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "account"',
      );
      const [repairedRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "account_repaired"',
      );

      if (Number(sourceRow?.count ?? 0) !== Number(repairedRow?.count ?? 0)) {
        throw new Error("Account table repair row count mismatch.");
      }

      await tx.$executeRawUnsafe('DROP TABLE "account"');
      await tx.$executeRawUnsafe('ALTER TABLE "account_repaired" RENAME TO "account"');
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId")',
      );
      await tx.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "account_providerId_accountId_key" ON "account" ("providerId", "accountId")',
      );
    });
  }

  if (
    (await hasColumn("verification", "created_at")) ||
    (await hasColumn("verification", "updated_at"))
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "verification_repaired"');
      await tx.$executeRawUnsafe(
        `CREATE TABLE "verification_repaired" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "identifier" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "expiresAt" DATETIME NOT NULL,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        )`,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO "verification_repaired" (
          "id",
          "identifier",
          "value",
          "expiresAt",
          "createdAt",
          "updatedAt"
        )
        SELECT
          "id",
          "identifier",
          "value",
          "expiresAt",
          COALESCE("createdAt", "created_at", CURRENT_TIMESTAMP),
          COALESCE("updatedAt", "updated_at", CURRENT_TIMESTAMP)
        FROM "verification"`,
      );

      const [sourceRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "verification"',
      );
      const [repairedRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "verification_repaired"',
      );

      if (Number(sourceRow?.count ?? 0) !== Number(repairedRow?.count ?? 0)) {
        throw new Error("Verification table repair row count mismatch.");
      }

      await tx.$executeRawUnsafe('DROP TABLE "verification"');
      await tx.$executeRawUnsafe('ALTER TABLE "verification_repaired" RENAME TO "verification"');
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier")',
      );
    });
  }
}

async function runObsoleteMigrations() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    obsoleteMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "todos"');
    await tx.$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      obsoleteMigrationKey,
      new Date().toISOString(),
    );
  });
}

async function runStatusConstraintMigrations() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    statusConstraintMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  if (await hasStatusCheckConstraints()) {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      statusConstraintMigrationKey,
      new Date().toISOString(),
    );
    return;
  }

  const hasWarehouseAssignmentTable = Boolean(await getTableSql("employee_warehouse_assignment"));

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "employee_warehouse_assignment_checked"');
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "employee_project_assignment_checked"');
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "employee_manager_assignment_checked"');
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "warehouse_checked"');
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "project_checked"');
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "employee_checked"');

      await tx.$executeRawUnsafe(
        `CREATE TABLE "employee_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "first_name" TEXT NOT NULL,
          "last_name" TEXT NOT NULL,
          "phone" TEXT NOT NULL UNIQUE,
          "role_id" TEXT NOT NULL,
          "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'LEFT')),
          "salary_amount_dzd" REAL,
          "salary_period" TEXT,
          "notes" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "employee_role_id_fkey"
            FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TABLE "project_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "location" TEXT,
          "manager_id" TEXT,
          "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'STOPPED', 'COMPLETED', 'ARCHIVED')),
          "notes" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "project_manager_id_fkey"
            FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TABLE "warehouse_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "address" TEXT,
          "manager_id" TEXT,
          "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
          "notes" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "warehouse_manager_id_fkey"
            FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TABLE "employee_manager_assignment_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "worker_id" TEXT NOT NULL,
          "manager_id" TEXT NOT NULL,
          "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED')),
          "start_date" DATETIME NOT NULL,
          "end_date" DATETIME,
          "notes" TEXT,
          "actor_user_id" TEXT,
          "actor_label" TEXT,
          "transaction_id" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "employee_manager_assignment_worker_id_fkey"
            FOREIGN KEY ("worker_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "employee_manager_assignment_manager_id_fkey"
            FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TABLE "employee_project_assignment_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "employee_id" TEXT NOT NULL,
          "project_id" TEXT NOT NULL,
          "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED')),
          "start_date" DATETIME NOT NULL,
          "end_date" DATETIME,
          "notes" TEXT,
          "actor_user_id" TEXT,
          "actor_label" TEXT,
          "transaction_id" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "employee_project_assignment_employee_id_fkey"
            FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "employee_project_assignment_project_id_fkey"
            FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )`,
      );
      await tx.$executeRawUnsafe(
        `CREATE TABLE "employee_warehouse_assignment_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "employee_id" TEXT NOT NULL,
          "warehouse_id" TEXT NOT NULL,
          "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'ENDED', 'ARCHIVED')),
          "start_date" DATETIME NOT NULL,
          "end_date" DATETIME,
          "notes" TEXT,
          "actor_user_id" TEXT,
          "actor_label" TEXT,
          "transaction_id" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "employee_warehouse_assignment_employee_id_fkey"
            FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "employee_warehouse_assignment_warehouse_id_fkey"
            FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )`,
      );

      await tx.$executeRawUnsafe(
        'INSERT INTO "employee_checked" ("id", "first_name", "last_name", "phone", "role_id", "status", "salary_amount_dzd", "salary_period", "notes", "created_at", "updated_at") SELECT "id", "first_name", "last_name", "phone", "role_id", "status", "salary_amount_dzd", "salary_period", "notes", "created_at", "updated_at" FROM "employee"',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "project_checked" ("id", "name", "location", "manager_id", "status", "notes", "created_at", "updated_at") SELECT "id", "name", "location", "manager_id", "status", "notes", "created_at", "updated_at" FROM "project"',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "warehouse_checked" ("id", "name", "address", "manager_id", "status", "notes", "created_at", "updated_at") SELECT "id", "name", "address", "manager_id", "status", "notes", "created_at", "updated_at" FROM "warehouse"',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "employee_manager_assignment_checked" ("id", "worker_id", "manager_id", "status", "start_date", "end_date", "notes", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at") SELECT "id", "worker_id", "manager_id", "status", "start_date", "end_date", "notes", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at" FROM "employee_manager_assignment"',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "employee_project_assignment_checked" ("id", "employee_id", "project_id", "status", "start_date", "end_date", "notes", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at") SELECT "id", "employee_id", "project_id", "status", "start_date", "end_date", "notes", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at" FROM "employee_project_assignment"',
      );
      if (hasWarehouseAssignmentTable) {
        await tx.$executeRawUnsafe(
          'INSERT INTO "employee_warehouse_assignment_checked" ("id", "employee_id", "warehouse_id", "status", "start_date", "end_date", "notes", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at") SELECT "id", "employee_id", "warehouse_id", "status", "start_date", "end_date", "notes", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at" FROM "employee_warehouse_assignment"',
        );
      }

      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "employee_warehouse_assignment"');
      await tx.$executeRawUnsafe('DROP TABLE "employee_project_assignment"');
      await tx.$executeRawUnsafe('DROP TABLE "employee_manager_assignment"');
      await tx.$executeRawUnsafe('DROP TABLE "warehouse"');
      await tx.$executeRawUnsafe('DROP TABLE "project"');
      await tx.$executeRawUnsafe('DROP TABLE "employee"');

      await tx.$executeRawUnsafe('ALTER TABLE "employee_checked" RENAME TO "employee"');
      await tx.$executeRawUnsafe('ALTER TABLE "project_checked" RENAME TO "project"');
      await tx.$executeRawUnsafe('ALTER TABLE "warehouse_checked" RENAME TO "warehouse"');
      await tx.$executeRawUnsafe(
        'ALTER TABLE "employee_manager_assignment_checked" RENAME TO "employee_manager_assignment"',
      );
      await tx.$executeRawUnsafe(
        'ALTER TABLE "employee_project_assignment_checked" RENAME TO "employee_project_assignment"',
      );
      await tx.$executeRawUnsafe(
        'ALTER TABLE "employee_warehouse_assignment_checked" RENAME TO "employee_warehouse_assignment"',
      );

      for (const statement of companyIndexStatements) {
        await tx.$executeRawUnsafe(statement);
      }

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        statusConstraintMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

async function runActorLabelBackfillMigration() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    actorLabelBackfillMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  const timestamp = new Date().toISOString();

  await prisma.$transaction(async (tx) => {
    const statements = [
      'UPDATE "employee_manager_assignment" SET "actor_label" = (SELECT "name" FROM "user" WHERE "id" = "actor_user_id") WHERE "actor_label" IS NULL AND "actor_user_id" IS NOT NULL',
      'UPDATE "employee_project_assignment" SET "actor_label" = (SELECT "name" FROM "user" WHERE "id" = "actor_user_id") WHERE "actor_label" IS NULL AND "actor_user_id" IS NOT NULL',
      'UPDATE "employee_warehouse_assignment" SET "actor_label" = (SELECT "name" FROM "user" WHERE "id" = "actor_user_id") WHERE "actor_label" IS NULL AND "actor_user_id" IS NOT NULL',
      'UPDATE "employee_state_history" SET "actor_label" = (SELECT "name" FROM "user" WHERE "id" = "actor_user_id") WHERE "actor_label" IS NULL AND "actor_user_id" IS NOT NULL',
      'UPDATE "project_manager_ownership_history" SET "actor_label" = (SELECT "name" FROM "user" WHERE "id" = "actor_user_id") WHERE "actor_label" IS NULL AND "actor_user_id" IS NOT NULL',
      'UPDATE "warehouse_manager_ownership_history" SET "actor_label" = (SELECT "name" FROM "user" WHERE "id" = "actor_user_id") WHERE "actor_label" IS NULL AND "actor_user_id" IS NOT NULL',
      'UPDATE "employee_salary_payment" SET "actor_label" = (SELECT "name" FROM "user" WHERE "id" = "actor_user_id") WHERE "actor_label" IS NULL AND "actor_user_id" IS NOT NULL',
      'UPDATE "user_profile_history" SET "actor_label" = COALESCE("name", (SELECT "name" FROM "user" WHERE "id" = "actor_user_id"), (SELECT "name" FROM "user" WHERE "id" = "user_id")) WHERE "actor_label" IS NULL',
    ] as const;

    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }

    await tx.$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      actorLabelBackfillMigrationKey,
      timestamp,
    );
  });
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

  await runObsoleteMigrations();
  await runStatusConstraintMigrations();
  await runActorLabelBackfillMigration();

  await syncLegacyTimestampColumns();
  await repairLegacyAuthTables();

  await ensureSeedRoles();
}
