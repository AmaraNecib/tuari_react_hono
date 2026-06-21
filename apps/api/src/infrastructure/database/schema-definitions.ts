import { DEFAULT_ROLE_PERMISSIONS } from "../../modules/rbac/role-seeds";

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
  `CREATE TABLE IF NOT EXISTS "role_permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    UNIQUE ("role_id", "permission"),
    CONSTRAINT "role_permission_role_id_fkey"
      FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
      FOREIGN KEY ("debt_account_id") REFERENCES "debt_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory_item_definition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "item_type" TEXT NOT NULL CHECK ("item_type" IN ('CONSUMABLE', 'ASSET')),
    "unit" TEXT,
    "description" TEXT,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_item_definition_unit_check"
      CHECK (("item_type" = 'CONSUMABLE' AND "unit" IS NOT NULL AND TRIM("unit") <> '') OR ("item_type" = 'ASSET' AND "unit" IS NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory_invoice_group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoice_number" TEXT,
    "supplier_name" TEXT,
    "invoice_date" DATETIME,
    "warehouse_id" TEXT,
    "project_id" TEXT,
    "external_counterparty_id" TEXT,
    "gross_total_dzd" REAL NOT NULL DEFAULT 0,
    "paid_amount_dzd" REAL NOT NULL DEFAULT 0,
    "remaining_debt_dzd" REAL NOT NULL DEFAULT 0,
    "debt_account_id" TEXT,
    "note" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_invoice_group_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_invoice_group_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_invoice_group_destination_check"
      CHECK (NOT ("warehouse_id" IS NOT NULL AND "project_id" IS NOT NULL)),
    CONSTRAINT "inventory_invoice_group_external_counterparty_id_fkey"
      FOREIGN KEY ("external_counterparty_id") REFERENCES "external_counterparty" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_invoice_group_debt_amounts_check"
      CHECK ("gross_total_dzd" >= 0 AND "paid_amount_dzd" >= 0 AND "remaining_debt_dzd" >= 0)
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory_entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoice_group_id" TEXT NOT NULL,
    "item_definition_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "project_id" TEXT,
    "item_type" TEXT NOT NULL CHECK ("item_type" IN ('CONSUMABLE', 'ASSET')),
    "item_name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" REAL NOT NULL,
    "unit_price_dzd" REAL,
    "total_price_dzd" REAL NOT NULL,
    "note" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_entry_invoice_group_id_fkey"
      FOREIGN KEY ("invoice_group_id") REFERENCES "inventory_invoice_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_entry_item_definition_id_fkey"
      FOREIGN KEY ("item_definition_id") REFERENCES "inventory_item_definition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_entry_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_entry_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_entry_quantity_check"
      CHECK ("quantity" > 0),
    CONSTRAINT "inventory_entry_total_price_check"
      CHECK ("total_price_dzd" >= 0),
    CONSTRAINT "inventory_entry_unit_price_check"
      CHECK ("unit_price_dzd" IS NULL OR "unit_price_dzd" >= 0),
    CONSTRAINT "inventory_entry_unit_snapshot_check"
      CHECK (("item_type" = 'CONSUMABLE' AND "unit" IS NOT NULL AND TRIM("unit") <> '') OR ("item_type" = 'ASSET' AND "unit" IS NULL)),
    CONSTRAINT "inventory_entry_destination_check"
      CHECK (NOT ("warehouse_id" IS NOT NULL AND "project_id" IS NOT NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory_asset_unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventory_entry_id" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "asset_tag" TEXT,
    "serial_number" TEXT,
    "condition" TEXT CHECK ("condition" IN ('NEW', 'USED', 'MAINTENANCE', 'DAMAGED')),
    "purchase_date" DATETIME,
    "purchase_price_dzd" REAL NOT NULL,
    "current_warehouse_id" TEXT,
    "current_project_id" TEXT,
    "current_location_label" TEXT,
    "note" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_asset_unit_inventory_entry_id_fkey"
      FOREIGN KEY ("inventory_entry_id") REFERENCES "inventory_entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_asset_unit_current_warehouse_id_fkey"
      FOREIGN KEY ("current_warehouse_id") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_asset_unit_current_project_id_fkey"
      FOREIGN KEY ("current_project_id") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_asset_unit_purchase_price_check"
      CHECK ("purchase_price_dzd" >= 0),
    CONSTRAINT "inventory_asset_unit_current_destination_check"
      CHECK (NOT ("current_warehouse_id" IS NOT NULL AND "current_project_id" IS NOT NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory_consumable_balance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventory_entry_id" TEXT NOT NULL,
    "item_definition_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "project_id" TEXT,
    "quantity" REAL NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_consumable_balance_inventory_entry_id_fkey"
      FOREIGN KEY ("inventory_entry_id") REFERENCES "inventory_entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_consumable_balance_item_definition_id_fkey"
      FOREIGN KEY ("item_definition_id") REFERENCES "inventory_item_definition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_consumable_balance_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_consumable_balance_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_consumable_balance_quantity_check"
      CHECK ("quantity" > 0),
    CONSTRAINT "inventory_consumable_balance_destination_check"
      CHECK (NOT ("warehouse_id" IS NOT NULL AND "project_id" IS NOT NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory_movement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movement_type" TEXT NOT NULL CHECK ("movement_type" IN ('PURCHASE', 'TRANSFER')),
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
  `CREATE TABLE IF NOT EXISTS "inventory_invoice_attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoice_group_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL UNIQUE,
    "relative_path" TEXT NOT NULL,
    "sha256" TEXT,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_invoice_attachment_invoice_group_id_fkey"
      FOREIGN KEY ("invoice_group_id") REFERENCES "inventory_invoice_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_invoice_attachment_byte_size_check"
      CHECK ("byte_size" >= 0)
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
  'CREATE INDEX IF NOT EXISTS "inventory_item_definition_item_type_is_active_idx" ON "inventory_item_definition" ("item_type", "is_active")',
  'CREATE INDEX IF NOT EXISTS "inventory_invoice_group_warehouse_id_idx" ON "inventory_invoice_group" ("warehouse_id", "created_at")',
  'CREATE INDEX IF NOT EXISTS "inventory_invoice_group_project_id_idx" ON "inventory_invoice_group" ("project_id", "created_at")',
  'CREATE INDEX IF NOT EXISTS "inventory_invoice_group_external_counterparty_id_idx" ON "inventory_invoice_group" ("external_counterparty_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_entry_invoice_group_id_idx" ON "inventory_entry" ("invoice_group_id", "created_at")',
  'CREATE INDEX IF NOT EXISTS "inventory_entry_item_definition_id_idx" ON "inventory_entry" ("item_definition_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_entry_warehouse_id_idx" ON "inventory_entry" ("warehouse_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_entry_project_id_idx" ON "inventory_entry" ("project_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_inventory_entry_id_idx" ON "inventory_asset_unit" ("inventory_entry_id", "created_at")',
  'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_asset_tag_idx" ON "inventory_asset_unit" ("asset_tag")',
  'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_serial_number_idx" ON "inventory_asset_unit" ("serial_number")',
  'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_current_warehouse_id_idx" ON "inventory_asset_unit" ("current_warehouse_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_asset_unit_current_project_id_idx" ON "inventory_asset_unit" ("current_project_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_inventory_entry_id_idx" ON "inventory_consumable_balance" ("inventory_entry_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_item_definition_id_idx" ON "inventory_consumable_balance" ("item_definition_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_warehouse_id_idx" ON "inventory_consumable_balance" ("warehouse_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_consumable_balance_project_id_idx" ON "inventory_consumable_balance" ("project_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_movement_inventory_entry_id_idx" ON "inventory_movement" ("inventory_entry_id", "occurred_at")',
  'CREATE INDEX IF NOT EXISTS "inventory_movement_asset_unit_id_idx" ON "inventory_movement" ("asset_unit_id", "occurred_at")',
  'CREATE INDEX IF NOT EXISTS "inventory_invoice_attachment_invoice_group_id_idx" ON "inventory_invoice_attachment" ("invoice_group_id", "created_at")',
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_manager_assignment_active_worker_key" ON "employee_manager_assignment" ("worker_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_project_assignment_active_employee_key" ON "employee_project_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_warehouse_assignment_active_employee_key" ON "employee_warehouse_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "employee_state_history_active_employee_key" ON "employee_state_history" ("employee_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "project_manager_ownership_history_active_project_key" ON "project_manager_ownership_history" ("project_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_manager_ownership_history_active_warehouse_key" ON "warehouse_manager_ownership_history" ("warehouse_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "inventory_invoice_group_invoice_number_key" ON "inventory_invoice_group" ("invoice_number") WHERE "invoice_number" IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "inventory_outbound_transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transfer_date" DATETIME NOT NULL,
    "from_type" TEXT NOT NULL CHECK ("from_type" IN ('WAREHOUSE', 'PROJECT')),
    "from_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "transfer_type" TEXT NOT NULL CHECK ("transfer_type" IN ('SALE', 'GIFT', 'RETURN')),
    "status" TEXT NOT NULL CHECK ("status" IN ('COMPLETED')),
    "associated_debt_account_id" TEXT,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_outbound_transfer_counterparty_id_fkey"
      FOREIGN KEY ("counterparty_id") REFERENCES "external_counterparty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_outbound_transfer_debt_account_id_fkey"
      FOREIGN KEY ("associated_debt_account_id") REFERENCES "debt_account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory_outbound_transfer_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transfer_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit_price_dzd" REAL,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "inventory_outbound_transfer_item_transfer_id_fkey"
      FOREIGN KEY ("transfer_id") REFERENCES "inventory_outbound_transfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_outbound_transfer_item_item_id_fkey"
      FOREIGN KEY ("item_id") REFERENCES "inventory_item_definition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_outbound_transfer_item_quantity_check"
      CHECK ("quantity" > 0)
  )`,
  'CREATE INDEX IF NOT EXISTS "inventory_outbound_transfer_counterparty_id_idx" ON "inventory_outbound_transfer" ("counterparty_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_outbound_transfer_debt_account_id_idx" ON "inventory_outbound_transfer" ("associated_debt_account_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_outbound_transfer_transfer_id_idx" ON "inventory_outbound_transfer_item" ("transfer_id")',
  'CREATE INDEX IF NOT EXISTS "inventory_outbound_transfer_item_item_id_idx" ON "inventory_outbound_transfer_item" ("item_id")',
  // --- Purchase Invoice tables ---
  `CREATE TABLE IF NOT EXISTS "invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoice_number" TEXT,
    "supplier_name" TEXT NOT NULL,
    "supplier_phone" TEXT,
    "warehouse_id" TEXT,
    "project_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'RECEIVED', 'PAID')),
    "invoice_date" DATETIME,
    "due_date" DATETIME,
    "total_amount_dzd" REAL NOT NULL DEFAULT 0,
    "paid_amount_dzd" REAL NOT NULL DEFAULT 0,
    "remaining_amount_dzd" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "invoice_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "invoice_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "invoice_remaining_non_negative"
      CHECK ("remaining_amount_dzd" >= 0)
  )`,
  `CREATE TABLE IF NOT EXISTS "invoice_line_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit_price_dzd" REAL NOT NULL,
    "total_dzd" REAL NOT NULL,
    CONSTRAINT "invoice_line_item_invoice_id_fkey"
      FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invoice_line_item_quantity_positive"
      CHECK ("quantity" > 0),
    CONSTRAINT "invoice_line_item_unit_price_positive"
      CHECK ("unit_price_dzd" >= 0)
  )`,
  'CREATE INDEX IF NOT EXISTS "invoice_status_idx" ON "invoice" ("status")',
  'CREATE INDEX IF NOT EXISTS "invoice_supplier_name_idx" ON "invoice" ("supplier_name")',
  'CREATE INDEX IF NOT EXISTS "invoice_created_at_idx" ON "invoice" ("created_at")',
  'CREATE INDEX IF NOT EXISTS "invoice_warehouse_id_idx" ON "invoice" ("warehouse_id")',
  'CREATE INDEX IF NOT EXISTS "invoice_project_id_idx" ON "invoice" ("project_id")',
  'CREATE INDEX IF NOT EXISTS "invoice_line_item_invoice_id_idx" ON "invoice_line_item" ("invoice_id")',
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
  'ALTER TABLE "inventory_invoice_group" ADD COLUMN "project_id" TEXT',
  'ALTER TABLE "inventory_entry" ADD COLUMN "project_id" TEXT',
  'ALTER TABLE "inventory_invoice_group" ADD COLUMN "external_counterparty_id" TEXT',
  'ALTER TABLE "inventory_invoice_group" ADD COLUMN "gross_total_dzd" REAL NOT NULL DEFAULT 0',
  'ALTER TABLE "inventory_invoice_group" ADD COLUMN "paid_amount_dzd" REAL NOT NULL DEFAULT 0',
  'ALTER TABLE "inventory_invoice_group" ADD COLUMN "remaining_debt_dzd" REAL NOT NULL DEFAULT 0',
  'ALTER TABLE "inventory_invoice_group" ADD COLUMN "debt_account_id" TEXT',
  'ALTER TABLE "inventory_asset_unit" ADD COLUMN "current_warehouse_id" TEXT',
  'ALTER TABLE "inventory_asset_unit" ADD COLUMN "current_project_id" TEXT',
  'ALTER TABLE "inventory_asset_unit" ADD COLUMN "current_location_label" TEXT',
  'ALTER TABLE "inventory_item_definition" ADD COLUMN "actor_user_id" TEXT',
  'ALTER TABLE "inventory_item_definition" ADD COLUMN "actor_label" TEXT',
  'ALTER TABLE "inventory_item_definition" ADD COLUMN "transaction_id" TEXT',
]

export const obsoleteMigrationKey = "drop_todos_table_v1"
export const statusConstraintMigrationKey = "enforce_company_status_checks_v1"
export const actorLabelBackfillMigrationKey = "backfill_actor_labels_v1"
export const debtMultiCaseMigrationKey = "enable_debt_multi_case_v1"
export const debtEntryClosureMigrationKey = "enable_debt_entry_closure_v1"
export const debtSingleAccountMigrationKey = "simplify_debt_single_account_v1"
export const addOutboundTransferMigrationKey = "add_outbound_transfer_tables_v1"
export const addAdvanceDebtEntryMigrationKey = "add_advance_debt_entry_type_v1"

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
  { key: "admin", name: "مدير النظام", description: "الحساب الإداري الرئيسي — له جميع الصلاحيات", isSystem: true },
  { key: "viewer", name: "مشاهد", description: "حساب للقراءة فقط — لا يمكنه تعديل أي بيانات", isSystem: true },
  { key: "worker", name: "عامل", description: "الدور التنفيذي الأساسي للعمال الميدانيين", isSystem: true },
  {
    key: "project_manager",
    name: "مدير مشروع",
    description: "مسؤول عن متابعة العمال والمشاريع الميدانية",
    isSystem: true,
  },
  {
    key: "warehouse_manager",
    name: "مدير مخزن",
    description: "مسؤول عن تشغيل وإدارة المستودعات",
    isSystem: true,
  },
] as const;

// ---------- role_permission seeds ----------

export function rolePermissionSeeds(): Array<{ roleId: string; permission: string }> {
  // roleId is the role key (e.g. "admin"). The caller (ensureSeedRolePermissions)
  // resolves keys to actual UUIDs before inserting.
  return DEFAULT_ROLE_PERMISSIONS.flatMap((rp) => {
    return rp.permissions.map((permission) => ({ roleId: rp.role.key, permission }));
  });
}

export function createSchemaDefinitions(): string[] {
  return [...schemaStatements];
}
