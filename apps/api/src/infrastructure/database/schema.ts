import { prisma } from "./prisma";
import {
  actorLabelBackfillMigrationKey,
  additiveStatements,
  addAdvanceDebtEntryMigrationKey,
  addOutboundTransferMigrationKey,
  companyIndexStatements,
  companyStatusConstraintChecks,
  debtSingleAccountMigrationKey,
  obsoleteMigrationKey,
  rolePermissionSeeds,
  roleSeeds,
  schemaStatements,
  statusConstraintMigrationKey,
} from "./schema-definitions";

function isDuplicateColumnError(error: unknown) {
  return error instanceof Error && error.message.includes("duplicate column name");
}

function isMissingColumnError(error: unknown) {
  return error instanceof Error && error.message.includes("no such column")
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

async function ensureInventoryProjectIndexes() {
  if (await hasColumn("inventory_invoice_group", "project_id")) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_invoice_group_project_id_idx" ON "inventory_invoice_group" ("project_id", "created_at")',
    )
  }

  if (await hasColumn("inventory_entry", "project_id")) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_entry_project_id_idx" ON "inventory_entry" ("project_id")',
    )
  }

  if (await hasColumn("inventory_invoice_group", "external_counterparty_id")) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_invoice_group_external_counterparty_id_idx" ON "inventory_invoice_group" ("external_counterparty_id")',
    )
  }

  if (await hasColumn("inventory_asset_unit", "current_warehouse_id")) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_current_warehouse_id_idx" ON "inventory_asset_unit" ("current_warehouse_id")',
    )
  }

  if (await hasColumn("inventory_asset_unit", "current_project_id")) {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_current_project_id_idx" ON "inventory_asset_unit" ("current_project_id")',
    )
  }

  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_inventory_entry_id_idx" ON "inventory_consumable_balance" ("inventory_entry_id")',
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_item_definition_id_idx" ON "inventory_consumable_balance" ("item_definition_id")',
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_warehouse_id_idx" ON "inventory_consumable_balance" ("warehouse_id")',
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_project_id_idx" ON "inventory_consumable_balance" ("project_id")',
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_movement_inventory_entry_id_idx" ON "inventory_movement" ("inventory_entry_id", "occurred_at")',
  )
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "inventory_movement_asset_unit_id_idx" ON "inventory_movement" ("asset_unit_id", "occurred_at")',
  )
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

async function runDebtSingleAccountMigration() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    debtSingleAccountMigrationKey,
  )

  if (migrationRow) {
    return
  }

  type DebtAccountRow = {
    id: string
    party_type: "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY"
    worker_id: string | null
    external_counterparty_id: string | null
    status: "OPEN" | "SETTLED"
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

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF")

  try {
    await prisma.$transaction(async (tx) => {
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
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON")
  }
}

async function runAddOutboundTransferMigration() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    addOutboundTransferMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await prisma.$transaction(async (tx) => {
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
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

async function runAddAdvanceDebtEntryMigration() {
  const [migrationRow] = await prisma.$queryRawUnsafe<Array<{ key: string }>>(
    'SELECT "key" FROM "app_schema_state" WHERE "key" = ? LIMIT 1',
    addAdvanceDebtEntryMigrationKey,
  );

  if (migrationRow) {
    return;
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    await prisma.$transaction(async (tx) => {
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
      'UPDATE "role" SET name = ?, description = ?, is_system = ?, updated_at = ? WHERE key = ?',
      role.name,
      role.description,
      role.isSystem ? 1 : 0,
      timestamp,
      role.key,
    );
  }
}

async function ensureSeedRolePermissions() {
  // Get all role IDs (key → UUID mapping)
  const roles = (await prisma.$queryRawUnsafe<Array<{ id: string; key: string }>>(
    'SELECT id, key FROM "role"',
  ));
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));

  const permissions = rolePermissionSeeds();

  for (const { roleId: roleKey, permission } of permissions) {
    const roleId = roleIdByKey.get(roleKey);
    if (!roleId) continue;

    const existing = (await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "role_permission" WHERE role_id = ? AND permission = ? LIMIT 1',
      roleId,
      permission,
    ))[0];

    if (!existing) {
      await prisma.$executeRawUnsafe(
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

export async function ensureDatabaseSchema(): Promise<void> {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  for (const statement of schemaStatements) {
    try {
      await prisma.$executeRawUnsafe(statement)
    } catch (error) {
      if (!isMissingColumnError(error) || (!statement.includes("project_id") && !statement.includes("external_counterparty_id") && !statement.includes("current_warehouse_id") && !statement.includes("current_project_id"))) {
        throw error
      }
    }
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

  await ensureInventoryProjectIndexes()

  await runObsoleteMigrations();
  await runStatusConstraintMigrations();
  await runActorLabelBackfillMigration();
  await runDebtSingleAccountMigration();
  await runAddOutboundTransferMigration();
  await runAddAdvanceDebtEntryMigration();

  await syncLegacyTimestampColumns();
  await repairLegacyAuthTables();

  await ensureSeedRoles();
  await ensureSeedRolePermissions();
}
