import { describe, it, expect } from "vitest";
import {
  createSchemaDefinitions,
  debtAccountBalanceRenameMigrationKey,
  rolePermissionSeeds,
} from "./schema-definitions";
import { DEFAULT_ROLE_PERMISSIONS } from "../../modules/rbac/role-seeds";

describe("role_permission schema", () => {
  const definitions = createSchemaDefinitions();

  it("includes role_permission table creation", () => {
    const rolePermissionDef = definitions.find((d) =>
      d.includes('"role_permission"'),
    );
    expect(rolePermissionDef).toBeDefined();
    expect(rolePermissionDef).toContain("role_id");
    expect(rolePermissionDef).toContain("permission");
  });

  it("has foreign key to role table", () => {
    const rolePermissionDef = definitions.find((d) =>
      d.includes('"role_permission"'),
    );
    expect(rolePermissionDef).toContain('FOREIGN KEY ("role_id") REFERENCES "role" ("id")');
  });

  it("has unique constraint on role_id + permission", () => {
    const rolePermissionDef = definitions.find((d) =>
      d.includes('"role_permission"'),
    );
    expect(rolePermissionDef).toContain("UNIQUE");
  });
});

describe("debt_account schema (#21 rename migration)", () => {
  const definitions = createSchemaDefinitions();

  function getDebtAccountDefinition() {
    const def = definitions.find((d) => d.includes('"debt_account"'));
    if (!def) {
      throw new Error("debt_account CREATE TABLE statement not found in schemaStatements");
    }
    return def;
  }

  it("uses the new column name `current_balance` (no DZD suffix)", () => {
    // The previous column name was `current_balance_dzd`. The rename
    // migration (#21) drops the `_dzd` suffix to match the rest of the
    // schema (invoice.*_amount, debt_entry.signed_amount, etc).
    const def = getDebtAccountDefinition();
    expect(def).toContain('"current_balance"');
    expect(def).not.toContain('"current_balance_dzd"');
  });

  it("declares a unique migration key for the rename", () => {
    // The migration registers itself in `app_schema_state` under this
    // key. A constant makes the key discoverable from tests and from
    // the migration function itself.
    expect(debtAccountBalanceRenameMigrationKey).toBe("rename_debt_account_balance_drop_dzd_v1");
  });
});

describe("rolePermissionSeeds", () => {
  it("generates seed entries for all default roles", () => {
    const seeds = rolePermissionSeeds();
    const roleKeys = [...new Set(seeds.map((s) => s.roleId))];
    expect(roleKeys).toContain("admin");
    expect(roleKeys).toContain("viewer");
    expect(roleKeys).toContain("worker");
    expect(roleKeys).toContain("project_manager");
    expect(roleKeys).toContain("warehouse_manager");
  });

  it("admin has all permissions", () => {
    const seeds = rolePermissionSeeds();
    const adminPerms = seeds
      .filter((s) => s.roleId === "admin")
      .map((s) => s.permission)
      .sort();
    const expected = [...DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin")!.permissions].sort();
    expect(adminPerms).toEqual(expected);
  });

  it("viewer has only employees.read", () => {
    const seeds = rolePermissionSeeds();
    const viewerPerms = seeds
      .filter((s) => s.roleId === "viewer")
      .map((s) => s.permission);
    expect(viewerPerms).toEqual(["employees.read"]);
  });

  it("each seed has roleId and permission", () => {
    const seeds = rolePermissionSeeds();
    for (const seed of seeds) {
      expect(typeof seed.roleId).toBe("string");
      expect(seed.roleId.length).toBeGreaterThan(0);
      expect(typeof seed.permission).toBe("string");
      expect(seed.permission).toMatch(/^\w+\.\w+$/);
    }
  });
});
