import { prisma } from "./prisma";
import {
  actorLabelBackfillMigrationKey,
  additiveStatements,
  companyIndexStatements,
  companyStatusConstraintChecks,
  debtEntryClosureMigrationKey,
  debtMultiCaseMigrationKey,
  obsoleteMigrationKey,
  roleSeeds,
  schemaStatements,
  statusConstraintMigrationKey,
} from "./schema-definitions";

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

async function hasDebtEntryClosureConstraint() {
  const tableSql = await getTableSql("debt_entry");

  return tableSql.includes(
    `"entry_type" TEXT NOT NULL CHECK ("entry_type" IN ('OPENING', 'PAYMENT', 'ADJUSTMENT', 'SETTLEMENT', 'CLOSURE'))`,
  );
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

async function runDebtMultiCaseMigration() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    debtMultiCaseMigrationKey,
  )

  if (migrationRow) {
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DROP INDEX IF EXISTS "debt_account_worker_unique"')
    await tx.$executeRawUnsafe('DROP INDEX IF EXISTS "debt_account_external_counterparty_unique"')
    await tx.$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      debtMultiCaseMigrationKey,
      new Date().toISOString(),
    )
  })
}

async function runDebtEntryClosureMigration() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    debtEntryClosureMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  if (await hasDebtEntryClosureConstraint()) {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      debtEntryClosureMigrationKey,
      new Date().toISOString(),
    );
    return;
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "debt_entry_checked"');
      await tx.$executeRawUnsafe(
        `CREATE TABLE "debt_entry_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "debt_account_id" TEXT NOT NULL,
          "entry_type" TEXT NOT NULL CHECK ("entry_type" IN ('OPENING', 'PAYMENT', 'ADJUSTMENT', 'SETTLEMENT', 'CLOSURE')),
          "signed_amount_dzd" REAL NOT NULL,
          "entry_date" DATETIME NOT NULL,
          "note" TEXT,
          "balance_after_dzd" REAL NOT NULL,
          "actor_user_id" TEXT,
          "actor_label" TEXT,
          "transaction_id" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "debt_entry_debt_account_id_fkey"
            FOREIGN KEY ("debt_account_id") REFERENCES "debt_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )`,
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "debt_entry_checked" ("id", "debt_account_id", "entry_type", "signed_amount_dzd", "entry_date", "note", "balance_after_dzd", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at") SELECT "id", "debt_account_id", "entry_type", "signed_amount_dzd", "entry_date", "note", "balance_after_dzd", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at" FROM "debt_entry"',
      );

      const [sourceRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "debt_entry"',
      );
      const [checkedRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "debt_entry_checked"',
      );

      if (Number(sourceRow?.count ?? 0) !== Number(checkedRow?.count ?? 0)) {
        throw new Error("Debt entry closure migration row count mismatch.");
      }

      await tx.$executeRawUnsafe('DROP TABLE "debt_entry"');
      await tx.$executeRawUnsafe('ALTER TABLE "debt_entry_checked" RENAME TO "debt_entry"');
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "debt_entry_debt_account_id_idx" ON "debt_entry" ("debt_account_id", "entry_date")',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        debtEntryClosureMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
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
  await runDebtMultiCaseMigration();
  await runDebtEntryClosureMigration();

  await syncLegacyTimestampColumns();
  await repairLegacyAuthTables();

  await ensureSeedRoles();
}
