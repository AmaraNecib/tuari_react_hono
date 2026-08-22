import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  getPermissionsForRole,
  type RolePermissionSeed,
} from "./role-seeds";
import { ALL_PERMISSIONS } from "./permissions";

describe("role seeds", () => {
  describe("DEFAULT_ROLE_PERMISSIONS", () => {
    it("has 4 roles (admin + 3 workforce labels)", () => {
      expect(DEFAULT_ROLE_PERMISSIONS).toHaveLength(4);
      expect(DEFAULT_ROLE_PERMISSIONS.map((s) => s.role.key).sort()).toEqual([
        "admin",
        "project_manager",
        "warehouse_manager",
        "worker",
      ]);
    });

    it("does NOT seed the legacy manager/viewer roles (removed)", () => {
      for (const key of ["manager", "viewer"]) {
        expect(DEFAULT_ROLE_PERMISSIONS.some((s) => s.role.key === key)).toBe(false);
      }
    });

    it("includes admin role with key 'admin' and ALL permissions", () => {
      const admin = requireSeed("admin");
      expect(admin.role.name).toBe("مدير النظام");
      expect(admin.role.isSystem).toBe(true);
      expect(admin.permissions).toEqual(ALL_PERMISSIONS);
    });

    it("includes admin as the only role with permissions (single-actor)", () => {
      // Only admin may act; every workforce label is empty.
      for (const seed of DEFAULT_ROLE_PERMISSIONS) {
        if (seed.role.key === "admin") {
          expect(seed.permissions).toEqual(ALL_PERMISSIONS);
        } else {
          expect(seed.permissions).toEqual([]);
        }
      }
    });

    it("includes the three workforce labels with NO permissions (per issue #20)", () => {
      for (const key of ["project_manager", "warehouse_manager", "worker"]) {
        const label = requireSeed(key);
        expect(label.role.isSystem).toBe(true);
        expect(label.permissions).toEqual([]);
      }
    });

    it("all permission strings use the colon separator (resource:action)", () => {
      for (const seed of DEFAULT_ROLE_PERMISSIONS) {
        for (const permission of seed.permissions) {
          expect(permission).toMatch(/^\w+:\w+$/);
        }
      }
    });
  });

  describe("getPermissionsForRole", () => {
    it("returns ALL permissions for admin", () => {
      expect(getPermissionsForRole("admin")).toEqual(ALL_PERMISSIONS);
    });

    it("returns the workforce labels' empty permission set", () => {
      for (const key of ["project_manager", "warehouse_manager", "worker"]) {
        expect(getPermissionsForRole(key)).toEqual([]);
      }
    });

    it("getPermissionsForRole returns the empty set for the removed manager/viewer roles", () => {
      // manager/viewer are no longer seeded; a removed role resolves to empty.
      for (const key of ["manager", "viewer"]) {
        expect(getPermissionsForRole(key)).toEqual([]);
      }
    });

    it("returns empty array for unknown role", () => {
      expect(getPermissionsForRole("nonexistent")).toEqual([]);
    });

    it("returns empty array for empty or differently-cased role keys (exact match)", () => {
      expect(getPermissionsForRole("")).toEqual([]);
      expect(getPermissionsForRole("ADMIN")).toEqual([]);
    });

    it("returns a fresh copy — mutating it cannot corrupt the seed", () => {
      const perms = getPermissionsForRole("admin");
      perms.length = 0;
      expect(getPermissionsForRole("admin")).toEqual(ALL_PERMISSIONS);
      const seed = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin")!;
      expect(seed.permissions).toEqual(ALL_PERMISSIONS);
    });
  });
});

/** Find a seeded role or fail loudly so a typo'd key is caught, not hidden. */
function requireSeed(key: string): RolePermissionSeed {
  const seed = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === key);
  expect(seed).toBeDefined();
  return seed!;
}
