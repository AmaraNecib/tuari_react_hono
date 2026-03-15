import Database from "better-sqlite3";

import { SqliteCompanyRepository } from "./company.repository";
import { CompanyService } from "./company.service";
import { SYSTEM_ROLE_KEYS } from "./company.types";

const schemaStatements = [
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
    "status" TEXT NOT NULL,
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
    "status" TEXT NOT NULL,
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
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE "employee_manager_assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worker_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("worker_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("manager_id") REFERENCES "employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE "employee_project_assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "employee_manager_assignment_active_worker_key" ON "employee_manager_assignment" ("worker_id") WHERE "status" = 'ACTIVE'`,
  `CREATE UNIQUE INDEX "employee_project_assignment_active_employee_key" ON "employee_project_assignment" ("employee_id") WHERE "status" = 'ACTIVE'`,
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
