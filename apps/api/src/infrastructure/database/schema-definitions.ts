export const schemaStatements = [
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
    "previous_name" TEXT,
    "previous_phone" TEXT,
    "password_changed" INTEGER NOT NULL DEFAULT 0,
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
  `CREATE TABLE IF NOT EXISTS "external_counterparty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "note" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "debt_account" (
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
      CHECK (("worker_id" IS NOT NULL AND "external_counterparty_id" IS NULL) OR ("worker_id" IS NULL AND "external_counterparty_id" IS NOT NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS "debt_entry" (
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
  `CREATE TABLE IF NOT EXISTS "debt_closure_link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_debt_account_id" TEXT NOT NULL,
    "target_debt_account_id" TEXT NOT NULL,
    "closed_amount_dzd" REAL NOT NULL,
    "entry_date" DATETIME NOT NULL,
    "note" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "debt_closure_link_source_debt_account_id_fkey"
      FOREIGN KEY ("source_debt_account_id") REFERENCES "debt_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "debt_closure_link_target_debt_account_id_fkey"
      FOREIGN KEY ("target_debt_account_id") REFERENCES "debt_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "debt_closure_link_accounts_check"
      CHECK ("source_debt_account_id" <> "target_debt_account_id"),
    CONSTRAINT "debt_closure_link_amount_check"
      CHECK ("closed_amount_dzd" > 0)
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
  'CREATE INDEX IF NOT EXISTS "external_counterparty_full_name_idx" ON "external_counterparty" ("full_name")',
  'CREATE INDEX IF NOT EXISTS "debt_account_worker_id_idx" ON "debt_account" ("worker_id")',
  'CREATE INDEX IF NOT EXISTS "debt_account_external_counterparty_id_idx" ON "debt_account" ("external_counterparty_id")',
  'CREATE INDEX IF NOT EXISTS "debt_entry_debt_account_id_idx" ON "debt_entry" ("debt_account_id", "entry_date")',
  'CREATE INDEX IF NOT EXISTS "debt_closure_link_source_debt_account_id_idx" ON "debt_closure_link" ("source_debt_account_id", "entry_date")',
  'CREATE INDEX IF NOT EXISTS "debt_closure_link_target_debt_account_id_idx" ON "debt_closure_link" ("target_debt_account_id", "entry_date")',
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_manager_assignment_active_worker_key" ON "employee_manager_assignment" ("worker_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_project_assignment_active_employee_key" ON "employee_project_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_warehouse_assignment_active_employee_key" ON "employee_warehouse_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_state_history_active_employee_key" ON "employee_state_history" ("employee_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "project_manager_ownership_history_active_project_key" ON "project_manager_ownership_history" ("project_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_active_warehouse_key" ON "warehouse_manager_ownership_history" ("warehouse_id") WHERE "end_date" IS NULL`,
]

export const additiveStatements = [
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
  'ALTER TABLE "user_profile_history" ADD COLUMN "previous_name" TEXT',
  'ALTER TABLE "user_profile_history" ADD COLUMN "previous_phone" TEXT',
  'ALTER TABLE "user_profile_history" ADD COLUMN "password_changed" INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE "user_profile_history" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "app_bootstrap_state" ADD COLUMN "user_id" TEXT',
]

export const obsoleteMigrationKey = "drop_todos_table_v1"
export const statusConstraintMigrationKey = "enforce_company_status_checks_v1"
export const actorLabelBackfillMigrationKey = "backfill_actor_labels_v1"
export const debtMultiCaseMigrationKey = "enable_debt_multi_case_v1"
export const debtEntryClosureMigrationKey = "enable_debt_entry_closure_v1"

export const companyIndexStatements = [
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
]

export const companyStatusConstraintChecks = [
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
] as const

export const roleSeeds = [
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
] as const
