import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "../rbac/role-seeds";
import { CompanyError } from "./company.errors";
import {
  createCompanyHarnessTracker,
  createInMemoryCompanyHarness,
} from "./company.test-helpers";
import { requireAssignableEmployeeRole } from "./company.entity-resolvers";
import {
  ASSIGNABLE_ROLE_KEYS,
  isAssignableEmployeeRoleKey,
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

  it("still accepts the legacy workforce keys so the dormant lifecycle harness keeps working", () => {
    for (const key of Object.values(LEGACY_WORKFORCE_ROLE_KEYS)) {
      expect(isAssignableEmployeeRoleKey(key)).toBe(true);
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
    const now = new Date().toISOString();
    database
      .prepare(
        'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      )
      .run("custom-role", "custom", "دور مخصص", null, now, now);

    expect(() =>
      service.createEmployee({
        firstName: "عامل",
        lastName: "مخصص",
        phone: "0554999999",
        roleId: "custom-role",
        status: "ACTIVE",
      }),
    ).toThrowError(CompanyError);
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
    const now = new Date().toISOString();
    database
      .prepare(
        'INSERT INTO "role" (id, key, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      )
      .run("custom-role", "custom", "دور مخصص", null, now, now);

    try {
      service.createEmployeesBatch({
        employees: [
          {
            firstName: "عامل",
            lastName: "مخصص",
            phone: "0554777777",
            roleId: "custom-role",
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
});
