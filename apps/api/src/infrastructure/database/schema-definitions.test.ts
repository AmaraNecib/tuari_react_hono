import { describe, it, expect } from "vitest";
import { createSchemaDefinitions, rolePermissionSeeds } from "./schema-definitions";
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
