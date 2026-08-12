import { afterEach, describe, expect, it } from "vitest";

import { roleSeeds } from "../../infrastructure/database/schema-definitions";
import { DEFAULT_ROLE_PERMISSIONS } from "../rbac/role-seeds";
import { CompanyError } from "./company.errors";
import {
  createCompanyHarnessTracker,
  createInMemoryCompanyHarness,
} from "./company.test-helpers";
import { requireAssignableEmployeeRole } from "./company.entity-resolvers";
import {
  ASSIGNABLE_ROLE_KEYS,
  isAcceptedEmployeeRoleKey,
  LEGACY_WORKFORCE_ROLE_KEYS,
} from "./company.types";
import type { CompanyService } from "./company.service";

type SqliteDatabase = ReturnType<typeof createInMemoryCompanyHarness>["database"];

function insertSystemRole(database: SqliteDatabase, key: string, name: string) {
  const now = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    )
    .run(crypto.randomUUID(), key, name, null, now, now);
}

function insertCustomRole(database: SqliteDatabase, key: string, id = `custom-${key}`) {
  const now = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    )
    .run(id, key, `دور مخصص ${key}`, null, now, now);
}

function getRoleIdByKey(database: SqliteDatabase, key: string): string {
  const row = database.prepare('SELECT id FROM "role" WHERE key = ?').get(key) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new Error(`role not seeded: ${key}`);
  }
  return row.id;
}

describe("ASSIGNABLE_ROLE_KEYS vs RBAC seeds", () => {
  it("matches the seeded system roles exactly (drift guard)", () => {
    const seededSystemKeys = DEFAULT_ROLE_PERMISSIONS.filter((seed) => seed.role.isSystem)
      .map((seed) => seed.role.key)
      .sort();
    const assignableKeys = Object.values(ASSIGNABLE_ROLE_KEYS).sort();

    expect(assignableKeys).toEqual(seededSystemKeys);
  });

  it("matches the schema-definitions role seeds exactly (second drift source)", () => {
    const schemaSeedKeys = roleSeeds.map((seed) => seed.key).sort();
    const assignableKeys = Object.values(ASSIGNABLE_ROLE_KEYS).sort();

    expect(assignableKeys).toEqual(schemaSeedKeys);
  });

  it("still accepts the legacy workforce keys so the dormant lifecycle harness keeps working", () => {
    for (const key of Object.values(LEGACY_WORKFORCE_ROLE_KEYS)) {
      expect(isAcceptedEmployeeRoleKey(key)).toBe(true);
    }
  });

  it("rejects unknown, empty, and case-variant keys", () => {
    for (const key of ["owner", "super_admin", "operator", "", "ADMIN", " Manager"]) {
      expect(isAcceptedEmployeeRoleKey(key)).toBe(false);
    }
  });
});

describe("requireAssignableEmployeeRole (post-Slice 3)", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();
  afterEach(closeAll);

  it("accepts each seeded system role: admin, manager, viewer", () => {
    const { repository, database } = createHarness();

    for (const key of Object.values(ASSIGNABLE_ROLE_KEYS)) {
      insertSystemRole(database, key, key);
      const roleId = getRoleIdByKey(database, key);
      expect(() => requireAssignableEmployeeRole(repository, roleId, "roleId")).not.toThrow();
    }
  });

  it("rejects a non-system role", () => {
    const { repository, database } = createHarness();
    insertCustomRole(database, "custom");

    expect(() => requireAssignableEmployeeRole(repository, "custom-custom", "roleId")).toThrowError(
      CompanyError,
    );
  });

  it("rejects a non-system role even when its key is a seeded key (isSystem gate)", () => {
    const { repository, database } = createHarness();
    insertCustomRole(database, "admin");

    expect(() => requireAssignableEmployeeRole(repository, "custom-admin", "roleId")).toThrowError(
      CompanyError,
    );
  });

  it("rejects a role id that does not exist at all", () => {
    const { repository } = createHarness();

    expect(() =>
      requireAssignableEmployeeRole(repository, crypto.randomUUID(), "roleId"),
    ).toThrowError(CompanyError);
  });
});

describe("employee creation with assignable roles (post-Slice 3)", () => {
  const { createHarness, closeAll } = createCompanyHarnessTracker();
  afterEach(closeAll);

  function createAssignableEmployee(
    service: CompanyService,
    database: SqliteDatabase,
    roleKey: string,
    phone: string,
  ) {
    insertSystemRole(database, roleKey, roleKey);
    return service.createEmployee({
      firstName: "عامل",
      lastName: roleKey,
      phone,
      roleId: getRoleIdByKey(database, roleKey),
      status: "ACTIVE",
    }).item;
  }

  it("createEmployee accepts admin/manager/viewer roles", () => {
    const { service, database } = createHarness();

    for (const roleKey of Object.values(ASSIGNABLE_ROLE_KEYS)) {
      const employee = createAssignableEmployee(service, database, roleKey, `0554123${roleKey}`);
      expect(employee.roleId).toBe(getRoleIdByKey(database, roleKey));
    }
  });

  it("createEmployee rejects a non-system role", () => {
    const { service, database } = createHarness();
    insertCustomRole(database, "custom");

    expect(() =>
      service.createEmployee({
        firstName: "عامل",
        lastName: "مخصص",
        phone: "0554999999",
        roleId: "custom-custom",
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("createEmployee rejects a non-system role even with a seeded key", () => {
    const { service, database } = createHarness();
    insertCustomRole(database, "manager");

    expect(() =>
      service.createEmployee({
        firstName: "عامل",
        lastName: "مخصص",
        phone: "0554999998",
        roleId: "custom-manager",
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("createEmployee detects a duplicate phone even when the new phone is padded", () => {
    const { service, database } = createHarness();
    insertSystemRole(database, "manager", "manager");
    const roleId = getRoleIdByKey(database, "manager");

    service.createEmployee({
      firstName: "عامل",
      lastName: "أول",
      phone: "0554777888",
      roleId,
      status: "ACTIVE",
    });

    expect(() =>
      service.createEmployee({
        firstName: "عامل",
        lastName: "ثان",
        phone: "0554777888 ",
        roleId,
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
  });

  it("createEmployee accepts a legacy workforce role from the harness seeds (documented no-op)", () => {
    const { service, roleIds } = createHarness();

    const employee = service.createEmployee({
      firstName: "عامل",
      lastName: "قديم",
      phone: "0554000777",
      roleId: roleIds.worker,
      status: "ACTIVE",
    }).item;

    expect(employee.roleId).toBe(roleIds.worker);
  });

  it("updateEmployee accepts a role change to a seeded role", () => {
    const { service, database } = createHarness();
    const employee = createAssignableEmployee(service, database, "manager", "0554100000");
    insertSystemRole(database, "viewer", "viewer");
    const viewerRoleId = getRoleIdByKey(database, "viewer");

    const updated = service.updateEmployee({ id: employee.id, roleId: viewerRoleId }).item;

    expect(updated.roleId).toBe(viewerRoleId);
  });

  it("updateEmployee rejects a role change to a non-system role", () => {
    const { service, database } = createHarness();
    const employee = createAssignableEmployee(service, database, "manager", "0554100001");
    insertCustomRole(database, "custom");

    expect(() => service.updateEmployee({ id: employee.id, roleId: "custom-custom" })).toThrowError(
      CompanyError,
    );
  });

  it("createEmployeesBatch accepts a batch of assignable roles", () => {
    const { service, database } = createHarness();

    for (const roleKey of Object.values(ASSIGNABLE_ROLE_KEYS)) {
      insertSystemRole(database, roleKey, roleKey);
    }

    const result = service.createEmployeesBatch({
      employees: Object.values(ASSIGNABLE_ROLE_KEYS).map((roleKey, index) => ({
        firstName: "عامل",
        lastName: roleKey,
        phone: `0554233${index}`,
        roleId: getRoleIdByKey(database, roleKey),
        status: "ACTIVE" as const,
        salaryAmountDzd: null,
        salaryPeriod: null,
        notes: null,
        managerId: null,
        projectId: null,
      })),
    });

    expect(result.item.employees).toHaveLength(3);
  });

  it("createEmployeesBatch rejects a non-system role with a roleId field error", () => {
    const { service, database } = createHarness();
    insertCustomRole(database, "custom");

    try {
      service.createEmployeesBatch({
        employees: [
          {
            firstName: "عامل",
            lastName: "مخصص",
            phone: "0554777777",
            roleId: "custom-custom",
            status: "ACTIVE" as const,
            salaryAmountDzd: null,
            salaryPeriod: null,
            notes: null,
            managerId: null,
            projectId: null,
          },
        ],
      });
      expect.unreachable("batch create should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyError);
      const fieldErrors = (error as CompanyError).appError.fieldErrors;
      expect(fieldErrors.some((entry) => entry.field === "employees.0.roleId")).toBe(true);
    }
  });

  it("createEmployeesBatch rejects a batch with a nonexistent role id", () => {
    const { service } = createHarness();

    try {
      service.createEmployeesBatch({
        employees: [
          {
            firstName: "عامل",
            lastName: "مفقود",
            phone: "0554666666",
            roleId: crypto.randomUUID(),
            status: "ACTIVE" as const,
            salaryAmountDzd: null,
            salaryPeriod: null,
            notes: null,
            managerId: null,
            projectId: null,
          },
        ],
      });
      expect.unreachable("batch create should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyError);
      const fieldErrors = (error as CompanyError).appError.fieldErrors;
      expect(fieldErrors.some((entry) => entry.field === "employees.0.roleId")).toBe(true);
    }
  });

  it("createEmployeesBatch rejects a mixed batch atomically (persists nothing)", () => {
    const { service, database } = createHarness();
    insertSystemRole(database, "admin", "admin");
    insertCustomRole(database, "custom");
    const adminRoleId = getRoleIdByKey(database, "admin");

    const validRow = {
      firstName: "عامل",
      lastName: "سليم",
      phone: "0554111111",
      roleId: adminRoleId,
      status: "ACTIVE" as const,
      salaryAmountDzd: null,
      salaryPeriod: null,
      notes: null,
      managerId: null,
      projectId: null,
    };

    expect(() =>
      service.createEmployeesBatch({
        employees: [
          validRow,
          { ...validRow, lastName: "مخصص", phone: "0554111112", roleId: "custom-custom" },
        ],
      }),
    ).toThrowError(CompanyError);

    const count = database
      .prepare('SELECT COUNT(*) AS n FROM "employee"')
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("createEmployeesBatch accepts an empty employees list as a no-op", () => {
    const { service } = createHarness();

    const result = service.createEmployeesBatch({ employees: [] });

    expect(result.item.employees).toHaveLength(0);
  });
});
