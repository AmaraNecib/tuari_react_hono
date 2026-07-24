import {
  actorLabelBackfillMigrationKey,
  additiveStatements,
  addAdvanceDebtEntryMigrationKey,
  addOutboundTransferMigrationKey,
  companyIndexStatements,
  companyStatusConstraintChecks,
  debtAccountBalanceRenameMigrationKey,
  debtAccountDirectionMigrationKey,
  debtEntryReasonCategoryMigrationKey,
  debtSingleAccountMigrationKey,
  invoiceDebtLinkageMigrationKey,
  invoiceDirectionMigrationKey,
  obsoleteMigrationKey,
  rbacThreeRoleMigrationKey,
  rolePermissionSeeds,
  roleSeeds,
  schemaStatements,
  statusConstraintMigrationKey,
} from "./schema-definitions";

// Module-level executor set during initialization
let _executor: DbExecutor | null = null;

/** Get the initialized database executor (throws if not set). */
function getExecutor(): DbExecutor {
  if (!_executor) {
    throw new Error("Database executor not initialized. Call ensureDatabaseSchema(db) first.");
  }
  return _executor;
}

/** Check if an error is a duplicate column warning (safe to ignore). */
function isDuplicateColumnError(error: unknown) {
  return error instanceof Error && error.message.includes("duplicate column name");
}

/** Check if an error is a missing column warning (safe to ignore). */
function isMissingColumnError(error: unknown) {
  return error instanceof Error && error.message.includes("no such column")
}

/** Get column metadata for a table via PRAGMA table_info. */
async function getTableColumns(tableName: string) {
  return getExecutor().$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(\"${tableName}\")`);
}

/** Check if a table has a specific column. */
async function hasColumn(tableName: string, columnName: string) {
  const columns = await getTableColumns(tableName);

  return columns.some((column) => column.name === columnName);
}

/** Get the CREATE TABLE statement for a table from sqlite_master. */
async function getTableSql(tableName: string) {
  const [row] = await getExecutor().$queryRawUnsafe<Array<{ sql: string | null }>>(
    'SELECT "sql" FROM "sqlite_master" WHERE "type" = ? AND "name" = ? LIMIT 1',
    "table",
    tableName,
  );

  return row?.sql ?? "";
}

/** Check if all status CHECK constraints are already applied. */
async function hasStatusCheckConstraints() {
  const tableSql = await Promise.all(
    companyStatusConstraintChecks.map(async ({ table, fragment }) => ({
      table,
      hasFragment: (await getTableSql(table)).includes(fragment),
    })),
  );

  return tableSql.every((entry) => entry.hasFragment);
}

/** Migrate legacy camelCase timestamp columns to snake_case. */
async function syncLegacyTimestampColumns() {
  if ((await hasColumn("user", "createdAt")) || (await hasColumn("user", "updatedAt"))) {
    await getExecutor().$executeRawUnsafe(
      'UPDATE "user" SET "created_at" = COALESCE("created_at", "createdAt"), "updated_at" = COALESCE("updated_at", "updatedAt") WHERE "createdAt" IS NOT NULL OR "updatedAt" IS NOT NULL',
    );
  }

  if ((await hasColumn("session", "createdAt")) || (await hasColumn("session", "updatedAt"))) {
    await getExecutor().$executeRawUnsafe(
      'UPDATE "session" SET "created_at" = COALESCE("created_at", "createdAt"), "updated_at" = COALESCE("updated_at", "updatedAt") WHERE "createdAt" IS NOT NULL OR "updatedAt" IS NOT NULL',
    );
  }

  if ((await hasColumn("account", "created_at")) || (await hasColumn("account", "updated_at"))) {
    await getExecutor().$executeRawUnsafe(
      'UPDATE "account" SET "createdAt" = COALESCE("createdAt", "created_at"), "updatedAt" = COALESCE("updatedAt", "updated_at") WHERE "created_at" IS NOT NULL OR "updated_at" IS NOT NULL',
    );
  }

  if (
    (await hasColumn("verification", "created_at")) ||
    (await hasColumn("verification", "updated_at"))
  ) {
    await getExecutor().$executeRawUnsafe(
      'UPDATE "verification" SET "createdAt" = COALESCE("createdAt", "created_at"), "updatedAt" = COALESCE("updatedAt", "updated_at") WHERE "created_at" IS NOT NULL OR "updated_at" IS NOT NULL',
    );
  }
}

/** Create missing inventory project/warehouse indexes. */
async function ensureInventoryProjectIndexes() {
  if (await hasColumn("inventory_invoice_group", "project_id")) {
    await getExecutor().$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_invoice_group_project_id_idx" ON "inventory_invoice_group" ("project_id", "created_at")',
    )
  }

  if (await hasColumn("inventory_entry", "project_id")) {
    await getExecutor().$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_entry_project_id_idx" ON "inventory_entry" ("project_id")',
    )
  }

  if (await hasColumn("inventory_invoice_group", "external_counterparty_id")) {
    await getExecutor().$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_invoice_group_external_counterparty_id_idx" ON "inventory_invoice_group" ("external_counterparty_id")',
    )
  }

  if (await hasColumn("inventory_asset_unit", "current_warehouse_id")) {
    await getExecutor().$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_current_warehouse_id_idx" ON "inventory_asset_unit" ("current_warehouse_id")',
    )
  }

  if (await hasColumn("inventory_asset_unit", "current_project_id")) {
    await getExecutor().$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_current_project_id_idx" ON "inventory_asset_unit" ("current_project_id")',
    )
  }

  await getExecutor().$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_inventory_entry_id_idx" ON "inventory_consumable_balance" ("inventory_entry_id")',
  )
  await getExecutor().$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_item_definition_id_idx" ON "inventory_consumable_balance" ("item_definition_id")',
  )
  await getExecutor().$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_warehouse_id_idx" ON "inventory_consumable_balance" ("warehouse_id")',
  )
  await getExecutor().$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_project_id_idx" ON "inventory_consumable_balance" ("project_id")',
  )
  await getExecutor().$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_movement_inventory_entry_id_idx" ON "inventory_movement" ("inventory_entry_id", "occurred_at")',
  )
  await getExecutor().$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_movement_asset_unit_id_idx" ON "inventory_movement" ("asset_unit_id", "occurred_at")',
  )
}

/** Repair legacy auth tables with wrong column naming. */
async function repairLegacyAuthTables() {
  if ((await hasColumn("account", "created_at")) || (await hasColumn("account", "updated_at"))) {
    await getExecutor().$transaction(async (tx) => {
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
    await getExecutor().$transaction(async (tx) => {
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

/** Drop obsolete tables and mark migration complete. */
async function runObsoleteMigrations() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    obsoleteMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  await getExecutor().$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "todos"');
    await tx.$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      obsoleteMigrationKey,
      new Date().toISOString(),
    );
  });
}

/** Add CHECK constraints on status columns via table recreation. */
async function runStatusConstraintMigrations() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    statusConstraintMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  if (await hasStatusCheckConstraints()) {
    await getExecutor().$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      statusConstraintMigrationKey,
      new Date().toISOString(),
    );
    return;
  }

  const hasWarehouseAssignmentTable = Boolean(await getTableSql("employee_warehouse_assignment"));

  await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await getExecutor().$transaction(async (tx) => {
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
    await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

 /** Backfill actor_label from user names for audit records. */
async function runActorLabelBackfillMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    actorLabelBackfillMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  const timestamp = new Date().toISOString();

  await getExecutor().$transaction(async (tx) => {
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

 /** Consolidate duplicate debt accounts per party into single accounts. */
async function runDebtSingleAccountMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    debtSingleAccountMigrationKey,
  )

  if (migrationRow) {
    return
  }

  // On databases created after #21 the historical `current_balance_dzd`
  // column never existed; the migration has nothing to consolidate.
  // Detect this via column existence and mark the migration done so
  // subsequent startups are no-ops.
  if (!(await hasColumn("debt_account", "current_balance_dzd"))) {
    await getExecutor().$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      debtSingleAccountMigrationKey,
      new Date().toISOString(),
    )
    return
  }

  type DebtAccountRow = {
    id: string
    party_type: "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY"
    worker_id: string | null
    external_counterparty_id: string | null
    status: "OPEN" | "SETTLED"
    // Note: reads the historical column name. The downstream
    // `runDebtAccountBalanceRenameMigration` (#21) renames this
    // column on the consolidated `debt_account` table once this
    // legacy migration has finished.
    current_balance_dzd: number
    note: string | null
    settled_at: string | null
    actor_user_id: string | null
    actor_label: string | null
    transaction_id: string | null
    created_at: string
    updated_at: string
  }

  type DebtEntryRow = {
    id: string
    debt_account_id: string
    entry_type: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "SETTLEMENT" | "CLOSURE"
    signed_amount_dzd: number
    entry_date: string
    note: string | null
    balance_after_dzd: number
    actor_user_id: string | null
    actor_label: string | null
    transaction_id: string | null
    created_at: string
    updated_at: string
  }

  type InvoiceDebtLinkRow = {
    id: string
    debt_account_id: string | null
  }

  const compareAsc = (left: string, right: string) => Date.parse(left) - Date.parse(right)
  const compareDesc = (left: string, right: string) => Date.parse(right) - Date.parse(left)
  const maxTimestamp = (values: Array<string | null | undefined>) =>
    values.filter((value): value is string => Boolean(value)).sort(compareDesc)[0] ?? new Date().toISOString()

  const getPartyKey = (account: Pick<DebtAccountRow, "party_type" | "worker_id" | "external_counterparty_id">) =>
    account.party_type === "INTERNAL_WORKER"
      ? `INTERNAL_WORKER:${account.worker_id}`
      : `EXTERNAL_COUNTERPARTY:${account.external_counterparty_id}`

  const normalizeEntryType = (entryType: DebtEntryRow["entry_type"], isFirstEntry: boolean) => {
    if (entryType === "CLOSURE") {
      return null
    }

    if (entryType === "OPENING") {
      return isFirstEntry ? "OPENING" : "ADJUSTMENT"
    }

    if (entryType === "SETTLEMENT") {
      return "ADJUSTMENT"
    }

    return entryType
  }

  await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = OFF")

  try {
    await getExecutor().$transaction(async (tx) => {
      const accounts = await tx.$queryRawUnsafe<DebtAccountRow[]>(
        'SELECT * FROM "debt_account" ORDER BY "created_at" ASC, "updated_at" ASC, "id" ASC',
      )
      const entries = await tx.$queryRawUnsafe<DebtEntryRow[]>(
        'SELECT * FROM "debt_entry" ORDER BY "entry_date" ASC, "created_at" ASC, "id" ASC',
      )
      const invoiceLinks = await tx.$queryRawUnsafe<InvoiceDebtLinkRow[]>(
        'SELECT "id", "debt_account_id" FROM "inventory_invoice_group"',
      )

      const entriesByAccountId = new Map<string, DebtEntryRow[]>()
      for (const entry of entries) {
        entriesByAccountId.set(entry.debt_account_id, [...(entriesByAccountId.get(entry.debt_account_id) ?? []), entry])
      }

      const accountsByParty = new Map<string, DebtAccountRow[]>()
      for (const account of accounts) {
        const partyKey = getPartyKey(account)
        accountsByParty.set(partyKey, [...(accountsByParty.get(partyKey) ?? []), account])
      }

      const rebuiltAccounts: DebtAccountRow[] = []
      const rebuiltEntries: Array<Omit<DebtEntryRow, "entry_type"> & { entry_type: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "SETTLEMENT" }> = []
      const accountIdMap = new Map<string, string>()

      for (const groupedAccounts of accountsByParty.values()) {
        const sortedAccounts = [...groupedAccounts].sort((left, right) => {
          const byCreatedAt = compareAsc(left.created_at, right.created_at)
          return byCreatedAt !== 0 ? byCreatedAt : compareAsc(left.updated_at, right.updated_at)
        })

        const canonicalAccount = sortedAccounts[0]!
        const latestAccount = [...sortedAccounts].sort((left, right) => compareDesc(left.updated_at, right.updated_at))[0]!
        const mergedEntries = sortedAccounts
          .flatMap((account) => entriesByAccountId.get(account.id) ?? [])
          .sort((left, right) => {
            const byEntryDate = compareAsc(left.entry_date, right.entry_date)
            return byEntryDate !== 0 ? byEntryDate : compareAsc(left.created_at, right.created_at)
          })

        let runningBalance = 0
        let keptEntryCount = 0

        for (const entry of mergedEntries) {
          const normalizedEntryType = normalizeEntryType(entry.entry_type, keptEntryCount === 0)
          if (!normalizedEntryType) {
            continue
          }

          runningBalance += Number(entry.signed_amount_dzd)
          keptEntryCount += 1
          rebuiltEntries.push({
            ...entry,
            debt_account_id: canonicalAccount.id,
            entry_type: normalizedEntryType,
            balance_after_dzd: runningBalance,
          })
        }

        if (keptEntryCount === 0 && sortedAccounts.some((account) => Number(account.current_balance_dzd) !== 0)) {
          const syntheticEntryDate = canonicalAccount.created_at
          runningBalance = sortedAccounts.reduce((sum, account) => sum + Number(account.current_balance_dzd), 0)
          rebuiltEntries.push({
            id: crypto.randomUUID(),
            debt_account_id: canonicalAccount.id,
            entry_type: "OPENING",
            signed_amount_dzd: runningBalance,
            entry_date: syntheticEntryDate,
            note: "ترحيل رصيد قديم بعد توحيد الحسابات",
            balance_after_dzd: runningBalance,
            actor_user_id: latestAccount.actor_user_id,
            actor_label: latestAccount.actor_label,
            transaction_id: latestAccount.transaction_id,
            created_at: syntheticEntryDate,
            updated_at: syntheticEntryDate,
          })
          keptEntryCount = 1
        }

        const totalBalance = keptEntryCount > 0
          ? rebuiltEntries.filter((entry) => entry.debt_account_id === canonicalAccount.id).at(-1)?.balance_after_dzd ?? 0
          : 0
        const latestRelevantTimestamp = maxTimestamp([
          latestAccount.updated_at,
          ...rebuiltEntries.filter((entry) => entry.debt_account_id === canonicalAccount.id).flatMap((entry) => [entry.updated_at, entry.entry_date]),
        ])

        rebuiltAccounts.push({
          ...canonicalAccount,
          current_balance_dzd: totalBalance,
          status: totalBalance === 0 ? "SETTLED" : "OPEN",
          note:
            sortedAccounts
              .map((account) => account.note?.trim() ?? "")
              .find((value) => value.length > 0) ?? null,
          settled_at: totalBalance === 0 ? latestRelevantTimestamp : null,
          actor_user_id: latestAccount.actor_user_id,
          actor_label: latestAccount.actor_label,
          transaction_id: latestAccount.transaction_id,
          created_at: canonicalAccount.created_at,
          updated_at: latestRelevantTimestamp,
        })

        for (const account of sortedAccounts) {
          accountIdMap.set(account.id, canonicalAccount.id)
        }
      }

      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "debt_account_single"')
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "debt_entry_single"')
      await tx.$executeRawUnsafe(
        `CREATE TABLE "debt_account_single" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "party_type" TEXT NOT NULL CHECK ("party_type" IN ('INTERNAL_WORKER', 'EXTERNAL_COUNTERPARTY')),
          "worker_id" TEXT,
          "external_counterparty_id" TEXT,
          "status" TEXT NOT NULL CHECK ("status" IN ('OPEN', 'SETTLED')),
          "current_balance_dzd" REAL NOT NULL DEFAULT 0,
          "note" TEXT,
          "settled_at" DATETIME,
          "actor_user_id" TEXT,
          "actor_label" TEXT,
          "transaction_id" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "debt_account_worker_id_fkey"
            FOREIGN KEY ("worker_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "debt_account_external_counterparty_id_fkey"
            FOREIGN KEY ("external_counterparty_id") REFERENCES "external_counterparty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "debt_account_party_check"
            CHECK ((("worker_id" IS NOT NULL) AND ("external_counterparty_id" IS NULL)) OR (("worker_id" IS NULL) AND ("external_counterparty_id" IS NOT NULL)))
        )`,
      )
      await tx.$executeRawUnsafe(
        `CREATE TABLE "debt_entry_single" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "debt_account_id" TEXT NOT NULL,
          "entry_type" TEXT NOT NULL CHECK ("entry_type" IN ('OPENING', 'PAYMENT', 'ADJUSTMENT', 'SETTLEMENT')),
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
            FOREIGN KEY ("debt_account_id") REFERENCES "debt_account_single" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )`,
      )

      for (const account of rebuiltAccounts) {
        await tx.$executeRawUnsafe(
          'INSERT INTO "debt_account_single" ("id", "party_type", "worker_id", "external_counterparty_id", "status", "current_balance_dzd", "note", "settled_at", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          account.id,
          account.party_type,
          account.worker_id,
          account.external_counterparty_id,
          account.status,
          account.current_balance_dzd,
          account.note,
          account.settled_at,
          account.actor_user_id,
          account.actor_label,
          account.transaction_id,
          account.created_at,
          account.updated_at,
        )
      }

      for (const entry of rebuiltEntries) {
        await tx.$executeRawUnsafe(
          'INSERT INTO "debt_entry_single" ("id", "debt_account_id", "entry_type", "signed_amount_dzd", "entry_date", "note", "balance_after_dzd", "actor_user_id", "actor_label", "transaction_id", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          entry.id,
          entry.debt_account_id,
          entry.entry_type,
          entry.signed_amount_dzd,
          entry.entry_date,
          entry.note,
          entry.balance_after_dzd,
          entry.actor_user_id,
          entry.actor_label,
          entry.transaction_id,
          entry.created_at,
          entry.updated_at,
        )
      }

      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "debt_closure_link"')
      await tx.$executeRawUnsafe('DROP TABLE "debt_entry"')
      await tx.$executeRawUnsafe('DROP TABLE "debt_account"')
      await tx.$executeRawUnsafe('ALTER TABLE "debt_account_single" RENAME TO "debt_account"')
      await tx.$executeRawUnsafe('ALTER TABLE "debt_entry_single" RENAME TO "debt_entry"')
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "debt_account_worker_id_idx" ON "debt_account" ("worker_id")')
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "debt_account_external_counterparty_id_idx" ON "debt_account" ("external_counterparty_id")')
      await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "debt_account_worker_unique" ON "debt_account" ("worker_id") WHERE "worker_id" IS NOT NULL')
      await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "debt_account_external_counterparty_unique" ON "debt_account" ("external_counterparty_id") WHERE "external_counterparty_id" IS NOT NULL')
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "debt_entry_debt_account_id_idx" ON "debt_entry" ("debt_account_id", "entry_date")')

      for (const invoiceLink of invoiceLinks) {
        const nextDebtAccountId = invoiceLink.debt_account_id ? accountIdMap.get(invoiceLink.debt_account_id) ?? null : null
        if (invoiceLink.debt_account_id !== nextDebtAccountId) {
          await tx.$executeRawUnsafe(
            'UPDATE "inventory_invoice_group" SET "debt_account_id" = ? WHERE "id" = ?',
            nextDebtAccountId,
            invoiceLink.id,
          )
        }
      }

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        debtSingleAccountMigrationKey,
        new Date().toISOString(),
      )
    })
  } finally {
    await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = ON")
  }
}

 /** Add OUTBOUND_SALE to inventory movement type CHECK constraint. */
async function runAddOutboundTransferMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    addOutboundTransferMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await getExecutor().$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "inventory_movement_updated"');
      await tx.$executeRawUnsafe(
        `CREATE TABLE "inventory_movement_updated" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "movement_type" TEXT NOT NULL CHECK ("movement_type" IN ('PURCHASE', 'TRANSFER', 'OUTBOUND_SALE')),
          "item_type" TEXT NOT NULL CHECK ("item_type" IN ('CONSUMABLE', 'ASSET')),
          "inventory_entry_id" TEXT,
          "asset_unit_id" TEXT,
          "quantity" REAL NOT NULL,
          "from_warehouse_id" TEXT,
          "from_project_id" TEXT,
          "to_warehouse_id" TEXT,
          "to_project_id" TEXT,
          "note" TEXT,
          "occurred_at" DATETIME NOT NULL,
          "created_at" DATETIME NOT NULL,
          CONSTRAINT "inventory_movement_inventory_entry_id_fkey"
            FOREIGN KEY ("inventory_entry_id") REFERENCES "inventory_entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "inventory_movement_asset_unit_id_fkey"
            FOREIGN KEY ("asset_unit_id") REFERENCES "inventory_asset_unit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "inventory_movement_quantity_check"
            CHECK ("quantity" > 0),
          CONSTRAINT "inventory_movement_from_destination_check"
            CHECK (NOT ("from_warehouse_id" IS NOT NULL AND "from_project_id" IS NOT NULL)),
          CONSTRAINT "inventory_movement_to_destination_check"
            CHECK (NOT ("to_warehouse_id" IS NOT NULL AND "to_project_id" IS NOT NULL))
        )`,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO "inventory_movement_updated" (
          "id", "movement_type", "item_type", "inventory_entry_id", "asset_unit_id",
          "quantity", "from_warehouse_id", "from_project_id", "to_warehouse_id",
          "to_project_id", "note", "occurred_at", "created_at"
        )
        SELECT
          "id", "movement_type", "item_type", "inventory_entry_id", "asset_unit_id",
          "quantity", "from_warehouse_id", "from_project_id", "to_warehouse_id",
          "to_project_id", "note", "occurred_at", "created_at"
        FROM "inventory_movement"`,
      );

      const [sourceRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "inventory_movement"',
      );
      const [updatedRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "inventory_movement_updated"',
      );

      if (Number(sourceRow?.count ?? 0) !== Number(updatedRow?.count ?? 0)) {
        throw new Error("inventory_movement migration row count mismatch.");
      }

      await tx.$executeRawUnsafe('DROP TABLE "inventory_movement"');
      await tx.$executeRawUnsafe('ALTER TABLE "inventory_movement_updated" RENAME TO "inventory_movement"');
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "inventory_movement_inventory_entry_id_idx" ON "inventory_movement" ("inventory_entry_id", "occurred_at")',
      );
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "inventory_movement_asset_unit_id_idx" ON "inventory_movement" ("asset_unit_id", "occurred_at")',
      );

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        addOutboundTransferMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

 /** Add ADVANCE to debt entry type CHECK constraint. */
async function runAddAdvanceDebtEntryMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    addAdvanceDebtEntryMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  // If the old column names don't exist, the schema is already new — skip.
  const hasOldColumn = await columnExists(getExecutor(), "debt_entry", "signed_amount_dzd");
  if (!hasOldColumn) {
    // Mark as done so we don't retry on every startup.
    await getExecutor().$executeRawUnsafe(
      'INSERT OR IGNORE INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      addAdvanceDebtEntryMigrationKey,
      new Date().toISOString(),
    );
    return;
  }

  await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await getExecutor().$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "debt_entry_updated"');
      await tx.$executeRawUnsafe(
        `CREATE TABLE "debt_entry_updated" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "debt_account_id" TEXT NOT NULL,
          "entry_type" TEXT NOT NULL CHECK ("entry_type" IN ('OPENING', 'PAYMENT', 'ADJUSTMENT', 'SETTLEMENT', 'ADVANCE')),
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
        `INSERT INTO "debt_entry_updated" (
          "id", "debt_account_id", "entry_type", "signed_amount_dzd", "entry_date",
          "note", "balance_after_dzd", "actor_user_id", "actor_label", "transaction_id",
          "created_at", "updated_at"
        )
        SELECT
          "id", "debt_account_id", "entry_type", "signed_amount_dzd", "entry_date",
          "note", "balance_after_dzd", "actor_user_id", "actor_label", "transaction_id",
          "created_at", "updated_at"
        FROM "debt_entry"`,
      );

      const [sourceRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "debt_entry"',
      );
      const [updatedRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "debt_entry_updated"',
      );

      if (Number(sourceRow?.count ?? 0) !== Number(updatedRow?.count ?? 0)) {
        throw new Error("debt_entry migration row count mismatch.");
      }

      await tx.$executeRawUnsafe('DROP TABLE "debt_entry"');
      await tx.$executeRawUnsafe('ALTER TABLE "debt_entry_updated" RENAME TO "debt_entry"');
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "debt_entry_debt_account_id_idx" ON "debt_entry" ("debt_account_id", "entry_date")',
      );

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        addAdvanceDebtEntryMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

 /** Add reason_category, currency, status, and void columns to debt_entry. */
async function runDebtEntryConstraintsMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    debtEntryReasonCategoryMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await getExecutor().$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "debt_entry_checked"');
      await tx.$executeRawUnsafe(
        `CREATE TABLE "debt_entry_checked" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "debt_account_id" TEXT NOT NULL,
          "invoice_id" TEXT,
          "entry_type" TEXT NOT NULL CHECK ("entry_type" IN ('OPENING', 'PAYMENT', 'ADJUSTMENT', 'SETTLEMENT', 'ADVANCE')),
          "currency" TEXT NOT NULL DEFAULT 'DZD',
          "signed_amount" REAL NOT NULL,
          "entry_date" DATETIME NOT NULL,
          "note" TEXT,
          "balance_after" REAL NOT NULL,
          "reason_category" TEXT NOT NULL DEFAULT 'INVOICE_DRIVEN' CHECK ("reason_category" IN ('INVOICE_DRIVEN', 'SALARY_ADVANCE', 'REIMBURSEMENT', 'CASH_TAKE', 'EQUIPMENT_DAMAGE', 'PERSONAL_LOAN', 'DIRECT_LOAN_GIVEN', 'DIRECT_LOAN_TAKEN', 'OTHER')),
          "reason_detail" TEXT,
          "payment_method" TEXT CHECK ("payment_method" IN ('CASH', 'BANK_TRANSFER', 'CHECK')),
          "status" TEXT NOT NULL DEFAULT 'LIVE' CHECK ("status" IN ('LIVE', 'VOIDED')),
          "voided_at" DATETIME,
          "voided_by" TEXT,
          "void_reason" TEXT,
          "actor_user_id" TEXT,
          "actor_label" TEXT,
          "transaction_id" TEXT,
          "created_at" DATETIME NOT NULL,
          "updated_at" DATETIME NOT NULL,
          CONSTRAINT "debt_entry_debt_account_id_fkey"
            FOREIGN KEY ("debt_account_id") REFERENCES "debt_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "debt_entry_invoice_id_fkey"
            FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )`,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO "debt_entry_checked" (
          "id", "debt_account_id", "invoice_id", "entry_type", "currency",
          "signed_amount", "entry_date", "note", "balance_after",
          "reason_category", "reason_detail", "payment_method", "status",
          "voided_at", "voided_by", "void_reason",
          "actor_user_id", "actor_label", "transaction_id",
          "created_at", "updated_at"
        )
        SELECT
          "id", "debt_account_id", "invoice_id", "entry_type", "currency",
          "signed_amount", "entry_date", "note", "balance_after",
          COALESCE("reason_category", 'INVOICE_DRIVEN'), "reason_detail", "payment_method",
          COALESCE("status", 'LIVE'),
          "voided_at", "voided_by", "void_reason",
          "actor_user_id", "actor_label", "transaction_id",
          "created_at", "updated_at"
        FROM "debt_entry"`,
      );

      const [sourceRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "debt_entry"',
      );
      const [checkedRow] = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        'SELECT COUNT(*) AS count FROM "debt_entry_checked"',
      );

      if (Number(sourceRow?.count ?? 0) !== Number(checkedRow?.count ?? 0)) {
        throw new Error("debt_entry migration row count mismatch.");
      }

      await tx.$executeRawUnsafe('DROP TABLE "debt_entry"');
      await tx.$executeRawUnsafe('ALTER TABLE "debt_entry_checked" RENAME TO "debt_entry"');
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "debt_entry_debt_account_id_idx" ON "debt_entry" ("debt_account_id", "entry_date")',
      );
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "debt_entry_invoice_id_idx" ON "debt_entry" ("invoice_id")',
      );

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        debtEntryReasonCategoryMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

 /** Rename *_dzd columns, add invoice-debt linkage columns. */
async function runInvoiceDebtLinkageMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    invoiceDebtLinkageMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  // Rename *_dzd -> *_amount in invoice + invoice_line_item + debt_entry.
  // Idempotent: skip rename if the new column already exists or the old one
  // is gone. Also links invoice to debt_account and debt_entry to invoice.
  const renamePairs: ReadonlyArray<{ table: string; from: string; to: string }> = [
    { table: "invoice", from: "total_amount_dzd", to: "total_amount" },
    { table: "invoice", from: "paid_amount_dzd", to: "paid_amount" },
    { table: "invoice", from: "remaining_amount_dzd", to: "remaining_amount" },
    { table: "invoice_line_item", from: "unit_price_dzd", to: "unit_price" },
    { table: "invoice_line_item", from: "total_dzd", to: "total" },
    { table: "debt_entry", from: "signed_amount_dzd", to: "signed_amount" },
    { table: "debt_entry", from: "balance_after_dzd", to: "balance_after" },
  ];

  // Columns to add idempotently to debt_entry. Both legacy migrations
  // (runDebtSingleAccountMigration, runAddAdvanceDebtEntryMigration)
  // recreate the table from a staging table that doesn't include
  // `invoice_id` or `currency`, so fresh databases lose these columns.
  const debtEntryAdditions = [
    { column: "invoice_id", ddl: 'TEXT' },
    { column: "currency", ddl: "TEXT NOT NULL DEFAULT 'DZD'" },
  ] as const;

  // Columns to add idempotently to invoice. The legacy CREATE TABLE
  // for invoice in schemaStatements already includes these, but the
  // additive migrations handle the case where the invoice table was
  // created by an older schemaStatements that didn't include them.
  const invoiceAdditions = [
    { column: "debt_account_id", ddl: 'TEXT' },
    { column: "currency", ddl: "TEXT NOT NULL DEFAULT 'DZD'" },
    { column: "total_amount", ddl: 'REAL NOT NULL DEFAULT 0' },
    { column: "paid_amount", ddl: 'REAL NOT NULL DEFAULT 0' },
    { column: "remaining_amount", ddl: 'REAL NOT NULL DEFAULT 0' },
  ] as const;

  await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  try {
    await getExecutor().$transaction(async (tx) => {
      for (const { table, from, to } of renamePairs) {
        const fromExists = await hasColumn(table, from);
        const toExists = await hasColumn(table, to);
        if (fromExists && !toExists) {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`,
          );
        }
      }

      for (const { column, ddl } of debtEntryAdditions) {
        if (!(await hasColumn("debt_entry", column))) {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "debt_entry" ADD COLUMN "${column}" ${ddl}`,
          );
        }
      }
      for (const { column, ddl } of invoiceAdditions) {
        if (!(await hasColumn("invoice", column))) {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "invoice" ADD COLUMN "${column}" ${ddl}`,
          );
        }
      }

      // Recreate the debt_entry_debt_account_id_idx if it was dropped
      // by the legacy migrations' staging-table dance.
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "debt_entry_debt_account_id_idx" ON "debt_entry" ("debt_account_id", "entry_date")',
      );
      await tx.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "debt_entry_invoice_id_idx" ON "debt_entry" ("invoice_id")',
      );

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        invoiceDebtLinkageMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

// Issue #21: drop the `_dzd` suffix from `debt_account.current_balance_dzd`.
// The DZD-suffix was previously dropped from `invoice.*`, `invoice_line_item.*`,
// and `debt_entry.*` by `runInvoiceDebtLinkageMigration`. This migration
// brings `debt_account` in line with the rest of the schema.
//
// Idempotent:
//   - skips if `app_schema_state` already has the migration key
//   - skips the rename if `current_balance` is already the column name
//   - skips the rename if the historical `current_balance_dzd` column
//     no longer exists (fresh DBs created after this migration runs)
//   - wraps the rename + state insert in a single transaction
//
// The migration is split into a pure function (`applyDebtAccountBalanceRename`)
// that takes a `DbExecutor` so it can be exercised directly against an
// in-memory SQLite in tests, .
export interface DbExecutor {
  $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
  $transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T>;
}

export { applyDebtAccountBalanceRename };

/** Rename current_balance_dzd to current_balance on debt_account. */
async function applyDebtAccountBalanceRename(db: DbExecutor) {
  const [migrationRow] = await db.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    debtAccountBalanceRenameMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  const hasOldColumn = await columnExists(db, "debt_account", "current_balance_dzd");
  const hasNewColumn = await columnExists(db, "debt_account", "current_balance");

  // Only open a no-FKs window when DDL is actually going to run.
  // Fresh DBs and already-migrated DBs take the no-op fast path.
  const ddlRequired = hasOldColumn && !hasNewColumn;

  if (ddlRequired) {
    await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  }
  try {
    await db.$transaction(async (tx) => {
      if (ddlRequired) {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "debt_account" RENAME COLUMN "current_balance_dzd" TO "current_balance"',
        );
      }

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        debtAccountBalanceRenameMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    if (ddlRequired) {
      await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    }
  }
}

 /** Check if a column exists in a table via PRAGMA table_info. */
async function columnExists(
  db: DbExecutor,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${tableName}")`,
  );
  return rows.some((column) => column.name === columnName);
}

 /** Add direction column to invoice table (PURCHASE/SALE). */
async function runInvoiceDirectionMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    invoiceDirectionMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  // Only add the column if it does not already exist (e.g. from
  // additive statements that run on every startup). If the column
  // already exists we still write the migration key so future
  // startups skip this check entirely.
  if (!(await hasColumn("invoice", "direction"))) {
    await getExecutor().$executeRawUnsafe(
      `ALTER TABLE "invoice" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'PURCHASE' CHECK ("direction" IN ('PURCHASE', 'SALE'))`,
    );
  }

  await getExecutor().$executeRawUnsafe(
    'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
    invoiceDirectionMigrationKey,
    new Date().toISOString(),
  );
}

 /** Apply debt_account balance column rename migration. */
async function runDebtAccountBalanceRenameMigration() {
  await applyDebtAccountBalanceRename(getExecutor());
}

// Issue #22: split each counterparty's debt into a payable and a
// receivable ledger. Adds a `direction` column to `debt_account`,
// backfills existing rows to 'PAYABLE', and creates a composite
// unique index so each counterparty has at most one account of each
// direction.
//
// Idempotent:
//   - skips if `app_schema_state` already has the migration key
//   - drops the legacy single-column index `IF EXISTS`
//   - creates the new composite index `IF NOT EXISTS`
//   - wraps all DDL + state insert in a transaction
//
// The legacy index `debt_account_external_counterparty_unique` was
// installed by `debtSingleAccountMigration` (Issue #13 era) and
// enforced "one debt account per external counterparty". That
// constraint is incompatible with bidirectional ledgers — a
// counterparty can now have BOTH a PAYABLE and a RECEIVABLE account.
// The DROP step is what unblocks the second-ledger INSERT on legacy
// databases. Fresh installs skip both the DROP (no legacy index) and
// the CREATE (no legacy index).
//
// The `direction` column itself is created by the additive statement
// in `schema-definitions.ts` (runs on every startup). The migration
// here only handles the index swap and the app_schema_state
// bookkeeping.
export async function applyDebtAccountDirectionMigration(db: DbExecutor): Promise<void> {
  const [migrationRow] = await db.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    debtAccountDirectionMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  await db.$transaction(async (tx) => {
    // Drop the legacy single-column unique index. `IF EXISTS` makes
    // this safe on fresh installs that never had the constraint.
    await tx.$executeRawUnsafe(
      'DROP INDEX IF EXISTS "debt_account_external_counterparty_unique"',
    );

    // Create the composite unique index. `IF NOT EXISTS` makes this
    // safe to re-run on a DB where the index was created by a
    // schema-statements-based fresh install.
    await tx.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "debt_account_external_counterparty_direction_unique" ON "debt_account" ("external_counterparty_id", "direction") WHERE "external_counterparty_id" IS NOT NULL',
    );

    await tx.$executeRawUnsafe(
      'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
      debtAccountDirectionMigrationKey,
      new Date().toISOString(),
    );
  });
}

 /** Add direction column and composite unique index to debt_account. */
async function runDebtAccountDirectionMigration() {
  await applyDebtAccountDirectionMigration(getExecutor());
}

 /** Seed or update default roles from role-seeds.ts. */
async function ensureSeedRoles() {
  for (const role of roleSeeds) {
    const existing = (await getExecutor().$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "role" WHERE key = ? LIMIT 1',
      role.key,
    ))[0];

    const timestamp = new Date().toISOString();

    if (!existing) {
      await getExecutor().$executeRawUnsafe(
        'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        role.key,
        role.name,
        role.description,
        role.isSystem ? 1 : 0,
        timestamp,
        timestamp,
      );
      continue;
    }

    await getExecutor().$executeRawUnsafe(
      'UPDATE "role" SET name = ?, description = ?, is_system = ?, updated_at = ? WHERE key = ?',
      role.name,
      role.description,
      role.isSystem ? 1 : 0,
      timestamp,
      role.key,
    );
  }
}

 /** Seed role-permission mappings from role-seeds.ts. */
async function ensureSeedRolePermissions() {
  // Get all role IDs (key → UUID mapping)
  const roles = (await getExecutor().$queryRawUnsafe<Array<{ id: string; key: string }>>(
    'SELECT id, key FROM "role"',
  ));
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));

  const permissions = rolePermissionSeeds();

  for (const { roleId: roleKey, permission } of permissions) {
    const roleId = roleIdByKey.get(roleKey);
    if (!roleId) continue;

    const existing = (await getExecutor().$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "role_permission" WHERE role_id = ? AND permission = ? LIMIT 1',
      roleId,
      permission,
    ))[0];

    if (!existing) {
      await getExecutor().$executeRawUnsafe(
        'INSERT INTO "role_permission" (id, role_id, permission, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        roleId,
        permission,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }
  }
}

/**
 * Issue #10 — Slice 3 three-tier RBAC.
 *
 * Drops the legacy `worker`, `project_manager`, and `warehouse_manager` roles
 * (which were internal-only and never used by the public contract) and
 * reassigns any employees that were attached to them onto the new
 * `manager` role. After this migration, only `admin`, `manager`, and
 * `viewer` exist as roles in the database.
 *
 * Also normalises any dot-separated permission strings (e.g. "employees.create")
 * to the colon form ("employees:create") in case a pre-#10 database still
 * has rows in the old format. No-op if no rows match.
 *
 * The migration is idempotent: re-running it is a no-op once the legacy
 * rows are gone. Foreign-key constraints (employee.role_id → role.id)
 * require PRAGMA foreign_keys = OFF during the swap so we can delete
 * the role rows in a controlled order.
 */
async function runRbacThreeRoleMigration() {
  const [migrationRow] = await getExecutor().$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    rbacThreeRoleMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  const legacyKeys = ["worker", "project_manager", "warehouse_manager"];

  await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await getExecutor().$transaction(async (tx) => {
      // Resolve the manager role id (created by ensureSeedRoles above).
      const [managerRow] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM "role" WHERE key = ? LIMIT 1',
        "manager",
      );

      if (!managerRow) {
        // Defensive: ensureSeedRoles should have created the manager role
        // before this migration runs. If it's missing for any reason, bail
        // out and let a later startup retry.
        throw new Error("rbac_three_role_v1: 'manager' role missing — ensureSeedRoles did not run");
      }

      const managerId = managerRow.id;

      // Reassign any employees pointing at legacy roles onto the manager role.
      for (const legacyKey of legacyKeys) {
        const [legacyRow] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          'SELECT id FROM "role" WHERE key = ? LIMIT 1',
          legacyKey,
        );
        if (!legacyRow) continue;

        await tx.$executeRawUnsafe(
          'UPDATE "employee" SET "role_id" = ?, "updated_at" = ? WHERE "role_id" = ?',
          managerId,
          new Date().toISOString(),
          legacyRow.id,
        );

        // Drop any role_permission rows for the legacy role.
        await tx.$executeRawUnsafe(
          'DELETE FROM "role_permission" WHERE "role_id" = ?',
          legacyRow.id,
        );

        // Drop the legacy role itself.
        await tx.$executeRawUnsafe(
          'DELETE FROM "role" WHERE "id" = ?',
          legacyRow.id,
        );
      }

      // Normalise the permission column format from `resource.action` to
      // `resource:action` for any rows that slipped through the colon-only
      // rewrite on a pre-#10 database. No-op if no rows match.
      const dotPerms: Array<{ id: string; permission: string }> = await tx.$queryRawUnsafe(
        "SELECT id, permission FROM role_permission WHERE permission LIKE '%.%.%' AND permission NOT LIKE '%:%'",
      );
      for (const row of dotPerms) {
        const lastDot = row.permission.lastIndexOf(".");
        if (lastDot > 0) {
          const normalized = `${row.permission.slice(0, lastDot)}:${row.permission.slice(lastDot + 1)}`;
          await tx.$executeRawUnsafe(
            "UPDATE role_permission SET permission = ? WHERE id = ?",
            normalized,
            row.id,
          );
        }
      }

      await tx.$executeRawUnsafe(
        'INSERT INTO "app_schema_state" ("key", "executed_at") VALUES (?, ?)',
        rbacThreeRoleMigrationKey,
        new Date().toISOString(),
      );
    });
  } finally {
    await getExecutor().$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

export async function ensureDatabaseSchema(db: DbExecutor): Promise<void> {
  _executor = db;
  const executor = getExecutor();

  await executor.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  for (const statement of schemaStatements) {
    try {
      await getExecutor().$executeRawUnsafe(statement)
    } catch (error) {
      if (!isMissingColumnError(error) || (!statement.includes("project_id") && !statement.includes("external_counterparty_id") && !statement.includes("current_warehouse_id") && !statement.includes("current_project_id"))) {
        throw error
      }
    }
  }

  for (const statement of additiveStatements) {
    try {
      await getExecutor().$executeRawUnsafe(statement);
    } catch (error) {
      if (!isDuplicateColumnError(error)) {
        throw error;
      }
    }
  }

  await ensureInventoryProjectIndexes()

  await runObsoleteMigrations();
  await runStatusConstraintMigrations();
  await runActorLabelBackfillMigration();
  await runDebtSingleAccountMigration();
  await runAddOutboundTransferMigration();
  await runAddAdvanceDebtEntryMigration();
  await runInvoiceDebtLinkageMigration();
  await runDebtEntryConstraintsMigration();
  await runDebtAccountBalanceRenameMigration();
  await runDebtAccountDirectionMigration();

  await syncLegacyTimestampColumns();
  await repairLegacyAuthTables();

  await ensureSeedRoles();
  await ensureSeedRolePermissions();

  // Run AFTER seeding so the new `manager` role is guaranteed to exist
  // before legacy roles are removed.
  await runRbacThreeRoleMigration();
}
