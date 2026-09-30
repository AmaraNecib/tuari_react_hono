import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { SqliteCompanyRepository } from "./adapters/sqlite-company.repository";
import { CompanyService } from "./company.service";
import { LEGACY_WORKFORCE_ROLE_KEYS } from "./company.types";

/**
 * System log aggregation tests. Uses the FULL schema (including inventory
 * tables) so every repository list* source that buildCompanySystemLog reads
 * can return rows — the in-memory harness schema lacks inventory tables.
 */
describe("buildCompanySystemLog coverage", () => {
  let db: Database.Database;
  let repo: SqliteCompanyRepository;
  let service: CompanyService;
  let roleIds: { worker: string; projectManager: string; warehouseManager: string };

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = MEMORY");
    db.pragma("foreign_keys = ON");
    for (const stmt of fullSchema) {
      db.exec(stmt);
    }
    const now = "2026-01-01T00:00:00.000Z";
    const insertRole = db.prepare(
      `INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 1, ?, ?)`,
    );
    roleIds = {
      worker: crypto.randomUUID(),
      projectManager: crypto.randomUUID(),
      warehouseManager: crypto.randomUUID(),
    };
    insertRole.run(roleIds.worker, LEGACY_WORKFORCE_ROLE_KEYS.worker, "عامل", now, now);
    insertRole.run(roleIds.projectManager, LEGACY_WORKFORCE_ROLE_KEYS.projectManager, "مدير مشروع", now, now);
    insertRole.run(roleIds.warehouseManager, LEGACY_WORKFORCE_ROLE_KEYS.warehouseManager, "مدير مخزن", now, now);

    repo = new SqliteCompanyRepository(db);
    service = new CompanyService(repo);
  });

  afterEach(() => {
    db.close();
  });

  const audit = (overrides?: { actorUserId?: string; actorLabel?: string }) => ({
    actorLabel: overrides?.actorLabel ?? "مدير التشغيل",
    actorUserId: overrides?.actorUserId ?? "admin-user-1",
    transactionId: crypto.randomUUID(),
  });

  const createWorker = (phone: string, status: "ACTIVE" | "INACTIVE" | "LEFT" = "ACTIVE") =>
    service.createEmployee({
      firstName: "عامل",
      lastName: phone,
      phone,
      roleId: roleIds.worker,
      status,
      salaryAmountDzd: 40000,
      salaryPeriod: "MONTHLY",
    }).item;

  const createProjectManager = (phone: string) =>
    service.createEmployee({
      firstName: "مدير",
      lastName: "مشروع",
      phone,
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;

  const createWarehouseManager = (phone: string) =>
    service.createEmployee({
      firstName: "مدير",
      lastName: "مخزن",
      phone,
      roleId: roleIds.warehouseManager,
      status: "ACTIVE",
    }).item;

  it("renders every Arabic status label from employee state history", () => {
    const active = createWorker("0556000001");
    const inactive = createWorker("0556000002", "INACTIVE");
    const left = createWorker("0556000003", "LEFT");

    // Transition active -> inactive -> left to produce multiple history rows
    service.updateEmployee({ id: active.id, status: "INACTIVE" }, audit());
    service.updateEmployee({ id: inactive.id, status: "LEFT" }, audit());

    // Employee state history rows only ever carry ACTIVE/INACTIVE/LEFT naturally.
    // STOPPED/COMPLETED/ARCHIVED/ENDED are written directly to exercise the
    // generic label function's full contract.
    const now = new Date().toISOString();
    const closeActiveHistory = db.prepare(
      `UPDATE "employee_state_history" SET end_date = ? WHERE employee_id = ? AND end_date IS NULL`,
    );
    const insertHistory = db.prepare(
      `INSERT INTO "employee_state_history"
        (id, employee_id, role_id, status, salary_amount_dzd, salary_period, event_type, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, 'UPDATED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    );
    for (const status of ["STOPPED", "COMPLETED", "ARCHIVED", "ENDED"]) {
      const employee = createWorker(`05560000${10 + status.length}`);
      closeActiveHistory.run(now, employee.id);
      insertHistory.run(crypto.randomUUID(), employee.id, roleIds.worker, status, now, now, now);
    }
    // Unknown status exercises the switch default (returns the raw value).
    const unknownEmployee = createWorker("0556000099");
    closeActiveHistory.run(now, unknownEmployee.id);
    insertHistory.run(crypto.randomUUID(), unknownEmployee.id, roleIds.worker, "UNKNOWN", now, now, now);

    const items = service.listSystemLog().items;
    const details = items.map((item) => item.detail).join(" | ");
    expect(details).toContain("غير نشط");
    expect(details).toContain("غادر");
    expect(details).toContain("متوقف");
    expect(details).toContain("مكتمل");
    expect(details).toContain("مؤرشف");
    expect(details).toContain("منتهي");
    expect(details).toContain("UNKNOWN");
    expect(details).toContain("نشط");
  });

  it("renders ADVANCE debt entry labels through the default label branches", () => {
    const worker = createWorker("0556000010");
    service.finance.createEmployeeDebtEntry({
      employeeId: worker.id,
      entryType: "ADVANCE",
      amountDzd: 500,
    });
    const items = service.listSystemLog().items;
    const debtEvent = items.find((item) => item.actionType === "DEBT_ENTRY_RECORDED");
    expect(debtEvent).toBeTruthy();
    // ADVANCE falls through both switch defaults: raw entryType label + generic summary
    expect(debtEvent?.summary).toContain("حركة دين");
    expect(debtEvent?.detail).toContain("ADVANCE");
  });

  it("aggregates warehouse assignments, warehouse manager history, salary payments and inventory items", () => {
    const manager = createProjectManager("0556000020");
    const whManager = createWarehouseManager("0556000021");
    const worker = createWorker("0556000022");
    const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
    const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE", managerId: whManager.id }).item;

    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    service.createProjectAssignment({
      employeeId: worker.id,
      projectId: project.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    const whWorker = createWorker("0556000023");
    service.createWarehouseAssignment({
      employeeId: whWorker.id,
      warehouseId: warehouse.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    service.createSalaryPayment({ employeeId: worker.id, actualAmountDzd: 40000, days: 30, projectSplits: [] }, audit());
    service.syncManagedProjects({ employeeId: manager.id, projectIds: [project.id] });
    service.syncManagedWarehouses({ employeeId: whManager.id, warehouseIds: [warehouse.id] });

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO "inventory_item_definition"
        (id, name, item_type, unit, description, is_active, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'عنصر', 'CONSUMABLE', 'قطعة', 'وصف', 1, 'admin-user-1', NULL, 'tx-inv', ?, ?)`,
    ).run(crypto.randomUUID(), now, now);

    const items = service.listSystemLog().items;
    const actionTypes = items.map((item) => item.actionType);
    expect(actionTypes).toContain("WORKPLACE_ASSIGNED");
    expect(actionTypes).toContain("PROJECT_MANAGER_CHANGED");
    expect(actionTypes).toContain("WAREHOUSE_MANAGER_CHANGED");
    expect(actionTypes).toContain("SALARY_PAYMENT_RECORDED");
    expect(actionTypes).toContain("INVENTORY_ITEM_CREATED");
  });

  it("applies every system log filter", () => {
    const worker = createWorker("0556000030");
    const manager = createProjectManager("0556000031");
    const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });

    const all = service.listSystemLog().items;
    expect(all.length).toBeGreaterThan(0);
    const first = all[0]!;

    // actionType
    const byAction = service.listSystemLog({ actionType: "WORKPLACE_ASSIGNED" }).items;
    expect(byAction.length).toBeGreaterThan(0);
    expect(byAction.every((item) => item.actionType === "WORKPLACE_ASSIGNED")).toBe(true);
    expect(service.listSystemLog({ actionType: "SALARY_PAYMENT_RECORDED" }).items).toEqual([]);

    // actorUserId (the assignment carries the audit actor)
    const byActor = service.listSystemLog({ actorUserId: first.actorUserId! }).items;
    expect(byActor.length).toBeGreaterThan(0);

    // entityId / entityType
    const employeeEvent = service.listSystemLog({ entityType: "EMPLOYEE" }).items[0]!;
    const byEntityId = service.listSystemLog({ entityId: employeeEvent.entityId! }).items;
    expect(byEntityId.length).toBeGreaterThan(0);

    // date range
    const byFrom = service.listSystemLog({ fromDate: "2020-01-01T00:00:00.000Z" }).items;
    expect(byFrom.length).toBe(all.length);
    const byTo = service.listSystemLog({ toDate: "2099-01-01T00:00:00.000Z" }).items;
    expect(byTo.length).toBe(all.length);
    const byFuture = service.listSystemLog({ fromDate: "2099-01-01T00:00:00.000Z" }).items;
    expect(byFuture).toEqual([]);

    // Mismatched filter values exercise each predicate's rejection branch.
    expect(service.listSystemLog({ actorUserId: "nobody" }).items).toEqual([]);
    expect(service.listSystemLog({ entityId: "nobody" }).items).toEqual([]);
    expect(service.listSystemLog({ entityType: "DEBT_ACCOUNT" }).items).toEqual([]);
    expect(service.listSystemLog({ toDate: "2020-01-01T00:00:00.000Z" }).items).toEqual([]);
    // A combined range keeps only events inside both bounds.
    expect(service.listSystemLog({ fromDate: "2020-01-01T00:00:00.000Z", toDate: "2099-01-01T00:00:00.000Z" }).items.length).toBe(all.length);
  });

  it("degrades gracefully when history rows reference missing entities", () => {
    const worker = createWorker("0556000050");
    const manager = createProjectManager("0556000051");
    const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
    const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    service.createProjectAssignment({
      employeeId: worker.id,
      projectId: project.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    const whWorker = createWorker("0556000053");
    service.createWarehouseAssignment({
      employeeId: whWorker.id,
      warehouseId: warehouse.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    service.syncManagedProjects({ employeeId: manager.id, projectIds: [project.id] });
    const whManager = createWarehouseManager("0556000052");
    service.syncManagedWarehouses({ employeeId: whManager.id, warehouseIds: [warehouse.id] });
    service.createSalaryPayment({ employeeId: worker.id, actualAmountDzd: 40000, days: 30, projectSplits: [] }, audit());
    const counterparty = service.createExternalCounterparty({
      fullName: "طرف خارجي",
      phoneNumber: "0219999999",
    }).item;
    const account = service.createDebtAccount({
        direction: "PAYABLE",
      partyType: "EXTERNAL_COUNTERPARTY",
      externalCounterpartyId: counterparty.id,
      openingBalanceDzd: 300,
    }).item;
    const entry = service.listDebtEntries({ debtAccountId: account.id }).items[0]!;
    service.recordDebtPayment({ debtEntryId: entry.id, amountDzd: 100, paymentMethod: "CASH" }, audit());

    // Insert orphaned rows with FK enforcement off so the log builder's
    // fallbacks (entityLabel null, id-based summaries, "دور غير معروف") run.
    const now = new Date().toISOString();
    db.pragma("foreign_keys = OFF");
    db.prepare(
      `INSERT INTO "employee_state_history"
        (id, employee_id, role_id, status, salary_amount_dzd, salary_period, event_type, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-emp', 'ghost-role', 'ACTIVE', NULL, NULL, 'UPDATED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "employee_state_history"
        (id, employee_id, role_id, status, salary_amount_dzd, salary_period, event_type, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-emp5', 'ghost-role2', 'ACTIVE', NULL, NULL, 'CREATED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "employee_manager_assignment"
        (id, worker_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-worker', 'ghost-manager', 'ACTIVE', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "employee_project_assignment"
        (id, employee_id, project_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-emp2', 'ghost-proj', 'ENDED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "employee_warehouse_assignment"
        (id, employee_id, warehouse_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-emp3', 'ghost-wh', 'ENDED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "project_manager_ownership_history"
        (id, project_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-proj2', 'ghost-manager2', 'ENDED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "warehouse_manager_ownership_history"
        (id, warehouse_id, manager_id, status, start_date, end_date, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-wh2', 'ghost-manager3', 'ENDED', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "employee_salary_payment"
        (id, employee_id, period_type, expected_amount_dzd, actual_amount_dzd, payment_date, note, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-emp4', 'MONTHLY', 1, 1, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now, now);
    db.prepare(
      `INSERT INTO "debt_account"
        (id, party_type, worker_id, external_counterparty_id, status, direction, current_balance, note, settled_at, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'INTERNAL_WORKER', 'ghost-worker2', NULL, 'OPEN', 'PAYABLE', 0, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now);
    db.prepare(
      `INSERT INTO "user_profile_history"
        (id, user_id, name, phone, previous_name, previous_phone, password_changed, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-user', 'اسم جديد', '0556', 'اسم قديم', '0111', 1, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now);
    // Profile row with unchanged fields: no change parts, so detail is null and
    // the name comparison's false branch runs.
    db.prepare(
      `INSERT INTO "user_profile_history"
        (id, user_id, name, phone, previous_name, previous_phone, password_changed, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-user2', 'نفس الاسم', '0666', 'نفس الاسم', '0666', 0, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now);
    // Profile row with no name/phone/actor: entityLabel and summary fall back
    // to the user id (deep ?? chain).
    db.prepare(
      `INSERT INTO "user_profile_history"
        (id, user_id, name, phone, previous_name, previous_phone, password_changed, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'ghost-user3', NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, ?, ?)`,
    ).run(crypto.randomUUID(), now, now);
    // ASSET inventory item: no unit, exercises the non-CONSUMABLE detail branch.
    db.prepare(
      `INSERT INTO "inventory_item_definition"
        (id, name, item_type, unit, description, is_active, actor_user_id, actor_label, transaction_id, created_at, updated_at)
       VALUES (?, 'أصل', 'ASSET', NULL, NULL, 1, 'admin-user-1', NULL, 'tx-inv2', ?, ?)`,
    ).run(crypto.randomUUID(), now, now);
    db.pragma("foreign_keys = ON");

    const items = service.listSystemLog().items;
    const details = items.map((item) => item.detail).join(" | ");
    expect(details).toContain("دور غير معروف");
    const actionTypes = items.map((item) => item.actionType);
    expect(actionTypes).toContain("ACCOUNT_UPDATED");
    // The orphaned user-profile row renders all three change parts.
    const accountEvent = items.find((item) => item.entityId === "ghost-user");
    expect(accountEvent?.detail).toContain("تم تحديث الاسم");
    expect(accountEvent?.detail).toContain("تم تحديث رقم الهاتف");
    expect(accountEvent?.detail).toContain("تم تحديث كلمة المرور");
  });

  it("resolves the actor label from the auth user and caches it", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO "user" (id, name, image, phoneNumber, phoneNumberVerified, created_at, updated_at)
       VALUES ('user-42', 'أحمد المدير', NULL, '0556999999', 1, ?, ?)`,
    ).run(now, now);

    const worker = createWorker("0556000040");
    const manager = createProjectManager("0556000041");
    const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
    service.createManagerAssignment({
      workerId: worker.id,
      managerId: manager.id,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    // Store an actorUserId on the assignment with no actorLabel so the log
    // resolves it through getAuthUserById (first call = cache miss, second = hit).
    const assignment = repo.listManagerAssignments()[0]!;
    repo.endManagerAssignment(
      { id: assignment.id, endDate: "2026-06-01T00:00:00.000Z", notes: null },
      { actorUserId: "user-42", transactionId: "tx-user-42" },
    );

    const items = service.listSystemLog().items;
    const withResolved = items.filter((item) => item.actorUserId === "user-42");
    expect(withResolved.length).toBeGreaterThan(0);
    for (const item of withResolved) {
      expect(item.actorLabel).toBe("أحمد المدير");
      expect(item.actorCurrentLabel).toBe("أحمد المدير");
    }
  });
});
