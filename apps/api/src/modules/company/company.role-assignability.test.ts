import { afterEach, describe, expect, it } from "vitest";

import { roleSeeds } from "../../infrastructure/database/schema-definitions";
import { DEFAULT_ROLE_PERMISSIONS } from "../rbac/role-seeds";
import { CompanyError } from "./company.errors";
import {
  createAuditContext,
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

/** The only identity the admin-role grant test authorizer recognizes as owner. */
const OWNER_USER_ID = "owner-user-1";

/** Test authorizer: only `OWNER_USER_ID` holds the admin-level grant. */
const adminAuthorizer = {
  isBootstrapOwner: (userId: string) => userId === OWNER_USER_ID,
};

function insertSystemRole(database: SqliteDatabase, key: string, name: string) {
  // Idempotent: the harness already seeds the workforce labels, so re-inserting
  // one would hit the UNIQUE key constraint. Only insert when the key is
  // missing (used for admin / custom placeholders the harness does not seed).
  const existing = database
    .prepare('SELECT "id" FROM "role" WHERE "key" = ? LIMIT 1')
    .get(key) as { id: string } | undefined;
  if (existing) {
    return;
  }
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

  it("accepts workforce labels without any caller grant", () => {
    const { repository, database } = createHarness();

    for (const key of ["worker", "project_manager"] as const) {
      insertSystemRole(database, key, key);
      const roleId = getRoleIdByKey(database, key);
      expect(() => requireAssignableEmployeeRole(repository, roleId, "roleId")).not.toThrow();
    }
  });

  it("rejects the admin role when no caller grant is provable (fail closed)", () => {
    const { repository, database } = createHarness();
    insertSystemRole(database, "admin", "admin");

    expect(() =>
      requireAssignableEmployeeRole(repository, getRoleIdByKey(database, "admin"), "roleId"),
    ).toThrowError(CompanyError);
  });

  it("accepts the admin role only when the caller holds the admin grant", () => {
    const { repository, database } = createHarness();
    insertSystemRole(database, "admin", "admin");

    expect(() =>
      requireAssignableEmployeeRole(repository, getRoleIdByKey(database, "admin"), "roleId", {
        authorizer: adminAuthorizer,
        actorUserId: OWNER_USER_ID,
      }),
    ).not.toThrow();
  });

  it("rejects the admin role when the caller holds a lesser grant (manager)", () => {
    const { repository, database } = createHarness();
    insertSystemRole(database, "admin", "admin");

    expect(() =>
      requireAssignableEmployeeRole(repository, getRoleIdByKey(database, "admin"), "roleId", {
        authorizer: adminAuthorizer,
        actorUserId: "manager-user-1",
      }),
    ).toThrowError(CompanyError);
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
    auditContext?: Parameters<CompanyService["createEmployee"]>[1],
  ) {
    insertSystemRole(database, roleKey, roleKey);
    return service.createEmployee(
      {
        firstName: "عامل",
        lastName: roleKey,
        phone,
        roleId: getRoleIdByKey(database, roleKey),
        status: "ACTIVE",
      },
      auditContext,
    ).item;
  }

  it("createEmployee accepts workforce label roles", () => {
    const { service, database } = createHarness();

    for (const roleKey of ["worker", "project_manager"] as const) {
      const employee = createAssignableEmployee(service, database, roleKey, `0554123${roleKey}`);
      expect(employee.roleId).toBe(getRoleIdByKey(database, roleKey));
    }
  });

  it("createEmployee rejects minting an admin employee without the admin grant", () => {
    const { service, database } = createHarness();
    insertSystemRole(database, "admin", "admin");

    try {
      service.createEmployee({
        firstName: "عامل",
        lastName: "إدارة",
        phone: "0554123000",
        roleId: getRoleIdByKey(database, "admin"),
        status: "ACTIVE",
      });
      expect.unreachable("admin minting should have been rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyError);
      expect((error as CompanyError).appError.code).toBe("UNAUTHORIZED");
    }
  });

  it("createEmployee allows an admin-holder to mint an admin employee", () => {
    const { service, database } = createHarness({ workspaceAdminAuthorizer: adminAuthorizer });

    const employee = createAssignableEmployee(
      service,
      database,
      "admin",
      "0554123001",
      createAuditContext({ actorUserId: OWNER_USER_ID }),
    );

    expect(employee.roleId).toBe(getRoleIdByKey(database, "admin"));
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
    insertSystemRole(database, "worker", "worker");
    const roleId = getRoleIdByKey(database, "worker");

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

  it("updateEmployee accepts a role change to a workforce label", () => {
    const { service, database } = createHarness();
    const employee = createAssignableEmployee(service, database, "worker", "0554100000");
    insertSystemRole(database, "project_manager", "project_manager");
    const pmRoleId = getRoleIdByKey(database, "project_manager");

    const updated = service.updateEmployee({ id: employee.id, roleId: pmRoleId }).item;

    expect(updated.roleId).toBe(pmRoleId);
  });

  it("updateEmployee rejects a role change to a non-system role", () => {
    const { service, database } = createHarness();
    const employee = createAssignableEmployee(service, database, "worker", "0554100001");
    insertCustomRole(database, "custom");

    expect(() => service.updateEmployee({ id: employee.id, roleId: "custom-custom" })).toThrowError(
      CompanyError,
    );
  });

  it("updateEmployee rejects promoting an employee to admin without the grant", () => {
    const { service, database } = createHarness();
    const employee = createAssignableEmployee(service, database, "worker", "0554100002");
    insertSystemRole(database, "admin", "admin");

    try {
      service.updateEmployee({ id: employee.id, roleId: getRoleIdByKey(database, "admin") });
      expect.unreachable("admin promotion should have been rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyError);
      expect((error as CompanyError).appError.code).toBe("UNAUTHORIZED");
    }
  });

  it("updateEmployee allows an admin-holder to promote an employee to admin", () => {
    const { service, database } = createHarness({ workspaceAdminAuthorizer: adminAuthorizer });
    const employee = createAssignableEmployee(
      service,
      database,
      "worker",
      "0554100003",
      createAuditContext({ actorUserId: OWNER_USER_ID }),
    );
    insertSystemRole(database, "admin", "admin");

    const updated = service.updateEmployee(
      { id: employee.id, roleId: getRoleIdByKey(database, "admin") },
      createAuditContext({ actorUserId: OWNER_USER_ID }),
    ).item;

    expect(updated.roleId).toBe(getRoleIdByKey(database, "admin"));
  });

  it("createEmployeesBatch accepts a batch of workforce label roles", () => {
    const { service, database } = createHarness();

    for (const roleKey of ["project_manager", "warehouse_manager"] as const) {
      insertSystemRole(database, roleKey, roleKey);
    }

    const result = service.createEmployeesBatch({
      employees: ["project_manager", "warehouse_manager"].map((roleKey, index) => ({
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

    expect(result.item.employees).toHaveLength(2);
  });

  it("createEmployeesBatch rejects an admin row without the grant (UNAUTHORIZED, persists nothing)", () => {
    const { service, database } = createHarness();
    insertSystemRole(database, "admin", "admin");

    try {
      service.createEmployeesBatch({
        employees: [
          {
            firstName: "عامل",
            lastName: "إدارة",
            phone: "0554111131",
            roleId: getRoleIdByKey(database, "admin"),
            status: "ACTIVE" as const,
            salaryAmountDzd: null,
            salaryPeriod: null,
            notes: null,
            managerId: null,
            projectId: null,
          },
        ],
      });
      expect.unreachable("batch admin minting should have been rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CompanyError);
      expect((error as CompanyError).appError.code).toBe("UNAUTHORIZED");
    }

    const count = database
      .prepare('SELECT COUNT(*) AS n FROM "employee"')
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("createEmployeesBatch allows an admin-holder to batch-create admin employees", () => {
    const { service, database } = createHarness({ workspaceAdminAuthorizer: adminAuthorizer });
    insertSystemRole(database, "admin", "admin");

    const result = service.createEmployeesBatch(
      {
        employees: [
          {
            firstName: "عامل",
            lastName: "إدارة",
            phone: "0554111132",
            roleId: getRoleIdByKey(database, "admin"),
            status: "ACTIVE" as const,
            salaryAmountDzd: null,
            salaryPeriod: null,
            notes: null,
            managerId: null,
            projectId: null,
          },
        ],
      },
      createAuditContext({ actorUserId: OWNER_USER_ID }),
    );

    expect(result.item.employees).toHaveLength(1);
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
    insertSystemRole(database, "manager", "manager");
    insertCustomRole(database, "custom");
    const managerRoleId = getRoleIdByKey(database, "manager");

    const validRow = {
      firstName: "عامل",
      lastName: "سليم",
      phone: "0554111111",
      roleId: managerRoleId,
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
