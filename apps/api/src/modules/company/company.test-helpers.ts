import Database from "better-sqlite3";

import { SqliteCompanyRepository } from "./company.repository";
import { CompanyService } from "./company.service";
import { SYSTEM_ROLE_KEYS } from "./company.types";

const schemaStatements = [
  `CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "phoneNumber" TEXT NOT NULL UNIQUE,
    "phoneNumberVerified" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE "user_profile_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "actor_user_id" TEXT,
    "actor_label" TEXT,
    "transaction_id" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE "role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
  )`,
  `CREATE TABLE "employee" (
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
    FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'STOPPED', 'COMPLETED', 'ARCHIVED')),
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE "warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE "employee_manager_assignment" (
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
    FOREIGN KEY ("worker_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "employee_project_assignment" (
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
    FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "employee_warehouse_assignment" (
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
    FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "employee_state_history" (
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
    FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("role_id") REFERENCES "role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "project_manager_ownership_history" (
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
    FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "warehouse_manager_ownership_history" (
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
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "employee_salary_payment" (
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
    FOREIGN KEY ("employee_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "employee_manager_assignment_active_worker_key" ON "employee_manager_assignment" ("worker_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX "employee_project_assignment_active_employee_key" ON "employee_project_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX "employee_warehouse_assignment_active_employee_key" ON "employee_warehouse_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX "employee_state_history_active_employee_key" ON "employee_state_history" ("employee_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX "project_manager_ownership_history_active_project_key" ON "project_manager_ownership_history" ("project_id") WHERE "end_date" IS NULL`,
  `CREATE UNIQUE INDEX "warehouse_manager_ownership_history_active_warehouse_key" ON "warehouse_manager_ownership_history" ("warehouse_id") WHERE "end_date" IS NULL`,
  `CREATE INDEX "employee_salary_payment_employee_id_idx" ON "employee_salary_payment" ("employee_id", "payment_date")`,
];

export function createInMemoryCompanyHarness() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");

  for (const statement of schemaStatements) {
    database.prepare(statement).run();
  }

  const now = new Date().toISOString();
  const workerRoleId = crypto.randomUUID();
  const projectManagerRoleId = crypto.randomUUID();
  const warehouseManagerRoleId = crypto.randomUUID();

  const insertRole = database.prepare(
    'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insertRole.run(workerRoleId, SYSTEM_ROLE_KEYS.worker, "عامل", "الدور التنفيذي الأساسي للعمال الميدانيين", 1, now, now);
  insertRole.run(
    projectManagerRoleId,
    SYSTEM_ROLE_KEYS.projectManager,
    "مدير مشروع",
    "مسؤول عن متابعة العمال والمشاريع الميدانية",
    1,
    now,
    now,
  );
  insertRole.run(
    warehouseManagerRoleId,
    SYSTEM_ROLE_KEYS.warehouseManager,
    "مدير مخزن",
    "مسؤول عن تشغيل وإدارة المستودعات",
    1,
    now,
    now,
  );

  const repository = new SqliteCompanyRepository(database);
  const service = new CompanyService(repository);

  return {
    database,
    repository,
    service,
    roleIds: {
      worker: workerRoleId,
      projectManager: projectManagerRoleId,
      warehouseManager: warehouseManagerRoleId,
    },
    close() {
      database.close();
    },
  };
}
