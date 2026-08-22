import { describe, it, expect, beforeEach } from "vitest";

import { RoleModule } from "./role.module";
import { InMemoryRoleRepository } from "./adapters/in-memory-role.repository";
import { DEFAULT_ROLE_PERMISSIONS } from "./role-seeds";
import type { Permission } from "./permissions";

/**
 * Convert a role seed (key + permissions list) into a RoleWithPermissions
 * record for the in-memory repository. Mirrors what the SQL adapter
 * returns after joining role + role_permission.
 */
function buildRoleRecord(key: string): {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: Permission[];
} {
  const seed = DEFAULT_ROLE_PERMISSIONS.find((s) => s.role.key === key);
  if (!seed) {
    throw new Error(`Unknown role in test: ${key}`);
  }
  return {
    id: `id-${key}`,
    key: seed.role.key,
    name: seed.role.name,
    description: seed.role.description,
    isSystem: seed.role.isSystem,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    permissions: [...seed.permissions] as Permission[],
  };
}

describe("RoleModule (Slice 3 RBAC)", () => {
  let repository: InMemoryRoleRepository;
  let module: RoleModule;

  beforeEach(() => {
    repository = new InMemoryRoleRepository();
    repository.seed(buildRoleRecord("admin"));
    repository.seed(buildRoleRecord("project_manager"));
    repository.seed(buildRoleRecord("warehouse_manager"));
    repository.seed(buildRoleRecord("worker"));
    module = new RoleModule({ repository });
  });

  describe("list()", () => {
    it("returns all roles with their permissions", async () => {
      const roles = await module.list();
      expect(roles).toHaveLength(4);
      const keys = roles.map((r) => r.key).sort();
      expect(keys).toEqual(["admin", "project_manager", "warehouse_manager", "worker"]);
    });

    it("returns roles sorted by key for stable display", async () => {
      const roles = await module.list();
      const sorted = [...roles].sort((a, b) => a.key.localeCompare(b.key));
      expect(roles.map((r) => r.key)).toEqual(sorted.map((r) => r.key));
    });

    it("includes the colon-separated permission strings for each role", async () => {
      const roles = await module.list();
      const admin = roles.find((r) => r.key === "admin")!;
      expect(admin.permissions).toContain("employees:create");
      expect(admin.permissions).toContain("debts:settle");
    });

    it("returns an empty array when no roles are seeded", async () => {
      const empty = new RoleModule({ repository: new InMemoryRoleRepository() });
      const roles = await empty.list();
      expect(roles).toEqual([]);
    });
  });

  describe("getById()", () => {
    it("returns the role when the id matches", async () => {
      const role = await module.getById("id-admin");
      expect(role).not.toBeNull();
      expect(role!.key).toBe("admin");
      expect(role!.permissions).toContain("employees:create");
    });

    it("returns null when the id does not match any role", async () => {
      const role = await module.getById("missing-id");
      expect(role).toBeNull();
    });
  });

  describe("getByKey()", () => {
    it("returns a workforce label with no permissions", async () => {
      const role = await module.getByKey("project_manager");
      expect(role).not.toBeNull();
      expect(role!.name).toBe("مدير مشروع");
      expect(role!.isSystem).toBe(true);
      expect(role!.permissions).toEqual([]);
    });

    it("returns null for the removed legacy manager/viewer roles", async () => {
      expect(await module.getByKey("manager")).toBeNull();
      expect(await module.getByKey("viewer")).toBeNull();
    });

    it("returns null when the key is unknown", async () => {
      const role = await module.getByKey("owner");
      expect(role).toBeNull();
    });
  });
});
