import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryStore,
  InMemoryWorkforceRepository,
} from "./adapters";
import { CompanyError, toFailureResult } from "./company.errors";
import {
  assertDebtEntryDateNotBackdated,
  buildDebtPartyKey,
  deleteResult,
  getDebtAccountBalanceLabel,
  getDebtAccountNetContribution,
  getDebtAccountStatus,
  getDebtBalanceLabel,
  getNetDebtBalance,
  normalizeMutationAuditContext,
  normalizeSalaryAmount,
  normalizeSignedMoneyAmount,
  normalizeText,
  successResult,
} from "./company.helpers";
import { createCompanyHarnessTracker, createInMemoryCompanyHarness } from "./company.test-helpers";
import {
  ensureEmployeeTransitionAllowed,
  ensureProjectTransitionAllowed,
  ensureWarehouseTransitionAllowed,
  listActiveWorkerIdsForProject,
  requireActiveEmployee,
  requireAssignableEmployeeRole,
  requireDebtAccount,
  requireEmployee,
  requireEmployeeWithRoleKey,
  requireEmployeeWorker,
  requireExternalCounterparty,
  requireProject,
  requireRole,
  requireWarehouse,
} from "./company.entity-resolvers";
import { SYSTEM_ROLE_KEYS } from "./company.types";
import { createCompanyRepository } from "./company.repository";

describe("CompanyError / toFailureResult", () => {
  it("wraps a CompanyError into a failure result with its appError payload", () => {
    const error = new CompanyError("VALIDATION", "رسالة خطأ", [
      { field: "amount", message: "رسالة حقل" },
    ]);

    expect(toFailureResult(error)).toEqual({
      success: false,
      error: {
        code: "VALIDATION",
        message: "رسالة خطأ",
        fieldErrors: [{ field: "amount", message: "رسالة حقل" }],
      },
    });
  });

  it("rethrows non-CompanyError values instead of wrapping them", () => {
    const plain = new Error("plain");
    expect(() => toFailureResult(plain)).toThrow("plain");
    expect(() => toFailureResult("string value")).toThrow("string value");
  });

  it("defaults fieldErrors to an empty array when omitted", () => {
    const error = new CompanyError("NOT_FOUND", "غير موجود");
    expect(error.appError.fieldErrors).toEqual([]);
    expect(error.name).toBe("CompanyError");
  });
});

describe("company.helpers", () => {
  it("normalizeSignedMoneyAmount accepts a finite non-zero amount", () => {
    expect(normalizeSignedMoneyAmount(1500)).toBe(1500);
  });

  it("normalizeSignedMoneyAmount rejects zero and non-finite amounts", () => {
    expect(() => normalizeSignedMoneyAmount(0)).toThrowError(CompanyError);
    expect(() => normalizeSignedMoneyAmount(Number.NaN)).toThrowError(CompanyError);
    expect(() => normalizeSignedMoneyAmount(Number.POSITIVE_INFINITY)).toThrowError(CompanyError);
    expect(() => normalizeSignedMoneyAmount(Number.NEGATIVE_INFINITY)).toThrowError(CompanyError);
  });

  it("normalizeSalaryAmount maps non-number or NaN to null", () => {
    expect(normalizeSalaryAmount(null)).toBeNull();
    expect(normalizeSalaryAmount(undefined)).toBeNull();
    expect(normalizeSalaryAmount(Number.NaN)).toBeNull();
    expect(normalizeSalaryAmount(5000)).toBe(5000);
  });

  it("normalizeText trims and collapses empty strings to null", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText(null)).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
    expect(normalizeText(42 as unknown as string)).toBeNull();
  });

  it("getDebtAccountStatus maps zero balance to SETTLED and nonzero to OPEN", () => {
    expect(getDebtAccountStatus(0)).toBe("SETTLED");
    expect(getDebtAccountStatus(-5)).toBe("OPEN");
  });

  it("getDebtAccountNetContribution sign-flips PAYABLE and keeps RECEIVABLE", () => {
    expect(getDebtAccountNetContribution({ currentBalance: 100, direction: "RECEIVABLE" })).toBe(100);
    expect(getDebtAccountNetContribution({ currentBalance: 100, direction: "PAYABLE" })).toBe(-100);
  });

  it("getNetDebtBalance aggregates mixed directions (issue #22 convention)", () => {
    expect(
      getNetDebtBalance([
        { currentBalance: 100, direction: "RECEIVABLE" },
        { currentBalance: 40, direction: "PAYABLE" },
      ]),
    ).toBe(60);
    expect(getNetDebtBalance([])).toBe(0);
  });

  it("getDebtAccountBalanceLabel delegates through the net-perspective label", () => {
    expect(getDebtAccountBalanceLabel({ currentBalance: 10, direction: "RECEIVABLE" })).toBe("لنا عنده");
    expect(getDebtAccountBalanceLabel({ currentBalance: 10, direction: "PAYABLE" })).toBe("علينا له");
    // An overpaid PAYABLE account (negative balance) nets to a positive
    // position, i.e. "they owe us".
    expect(getDebtAccountBalanceLabel({ currentBalance: -5, direction: "PAYABLE" })).toBe("لنا عنده");
  });

  it("getDebtBalanceLabel covers positive, negative and zero", () => {
    expect(getDebtBalanceLabel(5)).toBe("لنا عنده");
    expect(getDebtBalanceLabel(-5)).toBe("علينا له");
    expect(getDebtBalanceLabel(0)).toBe("مغلق");
  });

  it("buildDebtPartyKey builds worker and counterparty keys", () => {
    expect(
      buildDebtPartyKey({ partyType: "INTERNAL_WORKER", workerId: "w1", externalCounterpartyId: null }),
    ).toBe("INTERNAL_WORKER:w1");
    expect(
      buildDebtPartyKey({ partyType: "EXTERNAL_COUNTERPARTY", workerId: null, externalCounterpartyId: "c1" }),
    ).toBe("EXTERNAL_COUNTERPARTY:c1");
  });

  it("normalizeMutationAuditContext fills missing actor fields", () => {
    expect(normalizeMutationAuditContext()).toMatchObject({ actorUserId: null, actorLabel: null });
    expect(normalizeMutationAuditContext(undefined).transactionId).toBeTruthy();
    const partial = normalizeMutationAuditContext({ actorUserId: "u1" });
    expect(partial).toMatchObject({ actorUserId: "u1", actorLabel: null });
    expect(partial.transactionId).toBeTruthy();
    const full = normalizeMutationAuditContext({
      actorUserId: "u1",
      actorLabel: "label",
      transactionId: "t1",
    });
    expect(full).toEqual({ actorUserId: "u1", actorLabel: "label", transactionId: "t1" });
  });

  it("assertDebtEntryDateNotBackdated rejects dates older than the latest entry", () => {
    expect(() =>
      assertDebtEntryDateNotBackdated("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "entryDate"),
    ).toThrowError(CompanyError);
    expect(() =>
      assertDebtEntryDateNotBackdated("2026-02-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "entryDate"),
    ).not.toThrow();
    expect(() => assertDebtEntryDateNotBackdated("2026-01-01T00:00:00.000Z", null, "entryDate")).not.toThrow();
  });

  it("successResult and deleteResult shape their payloads", () => {
    expect(successResult("ok", { id: 1 })).toEqual({ success: true, message: "ok", item: { id: 1 } });
    expect(deleteResult("deleted")).toEqual({ success: true, message: "deleted" });
  });
});

describe("company.entity-resolvers", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();

  afterEach(closeAll);

  it("requireRole throws NOT_FOUND for a missing role", () => {
    const { repository } = createHarness();
    expect(() => requireRole(repository, "missing-role")).toThrowError(CompanyError);
  });

  it("requireAssignableEmployeeRole rejects non-system roles", () => {
    const { repository, database } = createHarness();
    const now = new Date().toISOString();
    database
      .prepare(
        'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      )
      .run("custom-role", "custom", "دور مخصص", null, now, now);
    expect(() => requireAssignableEmployeeRole(repository, "custom-role", "roleId")).toThrowError(
      CompanyError,
    );
  });

  it("requireEmployeeWithRoleKey rejects an employee whose role does not match", () => {
    const { repository, service, roleIds } = createHarness();
    const employee = service.createEmployee({
      firstName: "علي",
      lastName: "بن سالم",
      phone: "0550123456",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    expect(() =>
      requireEmployeeWithRoleKey(repository, employee.id, SYSTEM_ROLE_KEYS.projectManager, "roleId"),
    ).toThrowError(CompanyError);
  });

  it("requireEmployeeWorker wraps the role-key guard for workers", () => {
    const { repository, service, roleIds } = createHarness();
    const manager = service.createEmployee({
      firstName: "سارة",
      lastName: "بوزيد",
      phone: "0660123456",
      roleId: roleIds.projectManager,
      status: "ACTIVE",
    }).item;
    expect(() => requireEmployeeWorker(repository, manager.id, "workerId")).toThrowError(CompanyError);
  });

  it("requireActiveEmployee rejects non-active employees", () => {
    const { repository, service, roleIds } = createHarness();
    const employee = service.createEmployee({
      firstName: "يوسف",
      lastName: "مرابط",
      phone: "0770123456",
      roleId: roleIds.worker,
      status: "INACTIVE",
    }).item;
    expect(() => requireActiveEmployee(employee, "employeeId")).toThrowError(CompanyError);
  });

  it("requireProject, requireWarehouse and requireDebtAccount throw on missing ids", () => {
    const { repository } = createHarness();
    expect(() => requireProject(repository, "missing-project")).toThrowError(CompanyError);
    expect(() => requireWarehouse(repository, "missing-warehouse")).toThrowError(CompanyError);
    expect(() => requireDebtAccount(repository, "missing-account")).toThrowError(CompanyError);
  });

  it("requireExternalCounterparty throws on missing ids and honours a custom field", () => {
    const { repository } = createHarness();
    expect(() => requireExternalCounterparty(repository, "missing-cp")).toThrowError(CompanyError);
    expect(() => requireExternalCounterparty(repository, "missing-cp", "customField")).toThrowError(
      expect.objectContaining({
        appError: expect.objectContaining({
          fieldErrors: [{ field: "customField", message: expect.any(String) }],
        }),
      }),
    );
  });

  it("requireEmployee resolves an existing employee", () => {
    const { repository, service, roleIds } = createHarness();
    const employee = service.createEmployee({
      firstName: "خالد",
      lastName: "بوعلام",
      phone: "0880123456",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;
    expect(requireEmployee(repository, employee.id).id).toBe(employee.id);
  });

  describe("ensureEmployeeTransitionAllowed", () => {
    it("blocks a worker role/status change while active workplace links exist", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "المشروع",
        phone: "0111000001",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "نشط",
        phone: "0111000002",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      service.createManagerAssignment({
        workerId: worker.id,
        managerId: manager.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      expect(() =>
        ensureEmployeeTransitionAllowed(
          repository,
          repository,
          worker,
          SYSTEM_ROLE_KEYS.worker,
          SYSTEM_ROLE_KEYS.projectManager,
          "ACTIVE",
        ),
      ).toThrowError(CompanyError);
      expect(() =>
        ensureEmployeeTransitionAllowed(
          repository,
          repository,
          worker,
          SYSTEM_ROLE_KEYS.worker,
          SYSTEM_ROLE_KEYS.worker,
          "INACTIVE",
        ),
      ).toThrowError(CompanyError);
    });

    it("blocks a project manager change while they manage active projects or workers", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشاريع",
        phone: "0111000010",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      service.createProject({ name: "مشروع نشط", status: "ACTIVE", managerId: manager.id });
      expect(() =>
        ensureEmployeeTransitionAllowed(
          repository,
          repository,
          manager,
          SYSTEM_ROLE_KEYS.projectManager,
          SYSTEM_ROLE_KEYS.worker,
          "ACTIVE",
        ),
      ).toThrowError(CompanyError);
    });

    it("blocks a warehouse manager change while they manage active warehouses", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخازن",
        phone: "0111000020",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      service.createWarehouse({ name: "مستودع نشط", status: "ACTIVE", managerId: manager.id });
      expect(() =>
        ensureEmployeeTransitionAllowed(
          repository,
          repository,
          manager,
          SYSTEM_ROLE_KEYS.warehouseManager,
          SYSTEM_ROLE_KEYS.worker,
          "ACTIVE",
        ),
      ).toThrowError(CompanyError);
    });

    it("allows a safe transition when no active links exist", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "حر",
        phone: "0111000030",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      expect(() =>
        ensureEmployeeTransitionAllowed(
          repository,
          repository,
          manager,
          SYSTEM_ROLE_KEYS.projectManager,
          SYSTEM_ROLE_KEYS.projectManager,
          "INACTIVE",
        ),
      ).not.toThrow();
    });
  });

  describe("ensureProjectTransitionAllowed", () => {
    it("rejects deactivation or manager removal while active workers are assigned", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشروع",
        phone: "0111000040",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مرتبط",
        phone: "0111000041",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
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

      expect(() =>
        ensureProjectTransitionAllowed(
          repository,
          repository,
          project.id,
          manager.id,
          undefined,
          "STOPPED",
        ),
      ).toThrowError(CompanyError);
      expect(() =>
        ensureProjectTransitionAllowed(repository, repository, project.id, manager.id, null, undefined),
      ).toThrowError(CompanyError);
    });

    it("returns early when there are no active assignments", () => {
      const { repository, service } = createHarness();
      const project = service.createProject({ name: "مشروع حر", status: "ACTIVE" }).item;
      expect(() =>
        ensureProjectTransitionAllowed(repository, repository, project.id, null, null, "STOPPED"),
      ).not.toThrow();
    });
  });

  describe("ensureWarehouseTransitionAllowed", () => {
    it("rejects archiving a warehouse that still has an active manager", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن",
        phone: "0111000050",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const warehouse = service
        .createWarehouse({ name: "مستودع", status: "ACTIVE", managerId: manager.id })
        .item;
      expect(() =>
        ensureWarehouseTransitionAllowed(repository, warehouse.id, manager.id, undefined, "ARCHIVED"),
      ).toThrowError(CompanyError);
    });

    it("rejects manager reassignment while active worker assignments exist", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن ثان",
        phone: "0111000060",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0111000061",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service
        .createWarehouse({ name: "مستودع مرتبط", status: "ACTIVE" })
        .item;
      service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      expect(() =>
        ensureWarehouseTransitionAllowed(repository, warehouse.id, null, manager.id, undefined),
      ).toThrowError(CompanyError);
    });

    it("returns early when nothing is active and the manager is not being detached", () => {
      const { repository, service } = createHarness();
      const warehouse = service.createWarehouse({ name: "مستودع حر", status: "ACTIVE" }).item;
      expect(() =>
        ensureWarehouseTransitionAllowed(repository, warehouse.id, null, undefined, undefined),
      ).not.toThrow();
    });
  });

  describe("listActiveWorkerIdsForProject", () => {
    it("returns active worker ids only (skips missing employees and non-workers)", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشروع",
        phone: "0111000070",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مشروع",
        phone: "0111000071",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
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

      expect(listActiveWorkerIdsForProject(repository, repository, project.id)).toEqual([worker.id]);
    });

    it("skips assignments whose employee or role cannot be resolved", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشروع",
        phone: "0111000072",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const nonWorker = service.createEmployee({
        firstName: "موظف",
        lastName: "غير عامل",
        phone: "0111000073",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
      // Non-worker employee assigned directly via the repository (skips the
      // worker-only service guards).
      repository.createProjectAssignment(
        { employeeId: nonWorker.id, projectId: project.id, status: "ACTIVE", startDate: "2026-01-01T00:00:00.000Z", endDate: null, notes: null },
        { actorUserId: "admin", actorLabel: "مدير", transactionId: crypto.randomUUID() },
      );
      // Non-worker members are filtered out of the returned worker ids.
      expect(listActiveWorkerIdsForProject(repository, repository, project.id)).toEqual([]);

      // Ghost employee: a workforce repo that cannot resolve the employee
      // must skip the assignment rather than crash.
      const ghostRepo = { getEmployeeById: () => null, getRoleById: () => null } as unknown as typeof repository;
      expect(listActiveWorkerIdsForProject(repository, ghostRepo, project.id)).toEqual([]);
    });
  });

  describe("ensureProjectTransitionAllowed — resolver edge cases", () => {
    it("skips ghost employees and tolerates non-worker members on manager removal", () => {
      const { repository, service, roleIds } = createHarness();
      const manager = service.createEmployee({
        firstName: "مدير",
        lastName: "مشروع",
        phone: "0111000074",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const nonWorker = service.createEmployee({
        firstName: "موظف",
        lastName: "مرتبط",
        phone: "0111000075",
        roleId: roleIds.projectManager,
        status: "ACTIVE",
      }).item;
      const project = service.createProject({ name: "مشروع", status: "ACTIVE", managerId: manager.id }).item;
      repository.createProjectAssignment(
        { employeeId: nonWorker.id, projectId: project.id, status: "ACTIVE", startDate: "2026-01-01T00:00:00.000Z", endDate: null, notes: null },
        { actorUserId: "admin", actorLabel: "مدير", transactionId: crypto.randomUUID() },
      );

      // Non-worker members mean activeWorkerAssignments is empty, so removing
      // the manager is allowed.
      expect(() =>
        ensureProjectTransitionAllowed(repository, repository, project.id, manager.id, null, undefined),
      ).not.toThrow();

      // Ghost member: an unresolvable employee is skipped by the worker filter.
      const ghostRepo = { getEmployeeById: () => null, getRoleById: () => null } as unknown as typeof repository;
      expect(() =>
        ensureProjectTransitionAllowed(repository, ghostRepo, project.id, manager.id, undefined, "STOPPED"),
      ).toThrowError(CompanyError);
    });
  });

  describe("ensureEmployeeTransitionAllowed — workplace-link guards", () => {
    it("blocks a warehouse manager with an active warehouse assignment", () => {
      const { repository, service, roleIds } = createHarness();
      const whManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن",
        phone: "0111000076",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      service.createWarehouseAssignment({
        employeeId: whManager.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      expect(() =>
        ensureEmployeeTransitionAllowed(
          repository,
          repository,
          whManager,
          SYSTEM_ROLE_KEYS.warehouseManager,
          SYSTEM_ROLE_KEYS.worker,
          "ACTIVE",
        ),
      ).toThrowError(CompanyError);
    });

    it("allows a warehouse manager to deactivate when nothing is linked", () => {
      const { repository, service, roleIds } = createHarness();
      const whManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن حر",
        phone: "0111000077",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      expect(() =>
        ensureEmployeeTransitionAllowed(
          repository,
          repository,
          whManager,
          SYSTEM_ROLE_KEYS.warehouseManager,
          SYSTEM_ROLE_KEYS.warehouseManager,
          "INACTIVE",
        ),
      ).not.toThrow();
    });
  });

  describe("ensureWarehouseTransitionAllowed — no-op status update", () => {
    it("tolerates a status-only update while workers are assigned", () => {
      const { repository, service, roleIds } = createHarness();
      const whManager = service.createEmployee({
        firstName: "مدير",
        lastName: "مخزن",
        phone: "0111000078",
        roleId: roleIds.warehouseManager,
        status: "ACTIVE",
      }).item;
      const worker = service.createEmployee({
        firstName: "عامل",
        lastName: "مخزن",
        phone: "0111000079",
        roleId: roleIds.worker,
        status: "ACTIVE",
      }).item;
      const warehouse = service.createWarehouse({ name: "مستودع", status: "ACTIVE" }).item;
      service.createWarehouseAssignment({
        employeeId: worker.id,
        warehouseId: warehouse.id,
        status: "ACTIVE",
        startDate: "2026-01-01T00:00:00.000Z",
      });
      // Same manager + still-ACTIVE status: no deactivation, no reassignment.
      expect(() =>
        ensureWarehouseTransitionAllowed(
          repository,
          warehouse.id,
          null,
          undefined,
          "ACTIVE",
        ),
      ).not.toThrow();
    });
  });
});

describe("createCompanyRepository (composition root)", () => {
  it("builds a Drizzle-backed repository from a raw sqlite handle", () => {
    const harness = createInMemoryCompanyHarness();
    try {
      const repository = createCompanyRepository(harness.database);
      expect(repository.listRoles().length).toBeGreaterThanOrEqual(3);
      expect(repository.listEmployees()).toEqual([]);
    } finally {
      harness.close();
    }
  });
});

describe("InMemoryWorkforceRepository employee search (issue #183)", () => {
  const seed = (repo: InMemoryWorkforceRepository) => {
    repo.createEmployee({
      firstName: "Ahmed",
      lastName: "Ben Ali",
      phone: "0555123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
    repo.createEmployee({
      firstName: "Sara",
      lastName: "Bouzid",
      phone: "0666123456",
      roleId: "role-worker",
      status: "INACTIVE",
    });
    repo.createEmployee({
      firstName: "Yacine",
      lastName: "Merbah",
      phone: "0777123456",
      roleId: "role-worker",
      status: "ACTIVE",
    });
  };

  it("filters listEmployees by name/phone case-insensitively", () => {
    const repo = new InMemoryWorkforceRepository(new InMemoryStore());
    seed(repo);

    expect(repo.listEmployees({ search: "ben" }).map((e) => e.firstName)).toEqual(["Ahmed"]);
    expect(repo.listEmployees({ search: "BEN ALI" }).map((e) => e.firstName)).toEqual(["Ahmed"]);
    expect(repo.listEmployees({ search: "0777123456" }).map((e) => e.firstName)).toEqual(["Yacine"]);
    // Full first+last name (spans the concatenated haystack).
    expect(repo.listEmployees({ search: "sara bouzid" }).map((e) => e.firstName)).toEqual(["Sara"]);
  });

  it("applies search before pagination in listEmployeesPaged", () => {
    const repo = new InMemoryWorkforceRepository(new InMemoryStore());
    seed(repo);

    const result = repo.listEmployeesPaged({
      filters: { search: "a" },
      limit: 1,
    });

    // "a" matches Ahmed and Sara and Yacine — total is the whole filtered set.
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("returns everything for an empty or whitespace-only search", () => {
    const repo = new InMemoryWorkforceRepository(new InMemoryStore());
    seed(repo);

    expect(repo.listEmployees({ search: "" })).toHaveLength(3);
    expect(repo.listEmployees({ search: "   " })).toHaveLength(3);
    expect(repo.listEmployees()).toHaveLength(3);
  });
});
