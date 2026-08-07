import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  getPermissionsForRole,
  type RoleSeed,
  type RolePermissionSeed,
} from "./role-seeds";
import { ALL_PERMISSIONS } from "./permissions";

describe("role seeds", () => {
  describe("DEFAULT_ROLE_PERMISSIONS", () => {
    it("has 3 roles (ADMIN, MANAGER, VIEWER)", () => {
      expect(DEFAULT_ROLE_PERMISSIONS).toHaveLength(3);
    });

    it("includes admin role with key 'admin'", () => {
      const admin = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin");
      expect(admin).toBeDefined();
      expect(admin!.role.name).toBe("مدير النظام");
      expect(admin!.role.isSystem).toBe(true);
    });

    it("includes manager role with key 'manager'", () => {
      const manager = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "manager");
      expect(manager).toBeDefined();
      expect(manager!.role.isSystem).toBe(true);
    });

    it("includes viewer role with key 'viewer'", () => {
      const viewer = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "viewer");
      expect(viewer).toBeDefined();
      expect(viewer!.role.name).toBe("مشاهد");
      expect(viewer!.role.isSystem).toBe(true);
    });

    it("admin has ALL permissions", () => {
      const admin = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin")!;
      expect(admin.permissions).toEqual(ALL_PERMISSIONS);
    });

    it("manager has full CRUD on employees, projects, warehouses, inventory, plus debts:read", () => {
      const manager = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "manager")!;
      // employees CRUD
      expect(manager.permissions).toContain("employees:create");
      expect(manager.permissions).toContain("employees:read");
      expect(manager.permissions).toContain("employees:update");
      expect(manager.permissions).toContain("employees:delete");
      // projects CRUD
      expect(manager.permissions).toContain("projects:create");
      expect(manager.permissions).toContain("projects:read");
      expect(manager.permissions).toContain("projects:update");
      expect(manager.permissions).toContain("projects:delete");
      // warehouses CRUD
      expect(manager.permissions).toContain("warehouses:create");
      expect(manager.permissions).toContain("warehouses:read");
      expect(manager.permissions).toContain("warehouses:update");
      expect(manager.permissions).toContain("warehouses:delete");
      // inventory CRUD + transfer
      expect(manager.permissions).toContain("inventory:create");
      expect(manager.permissions).toContain("inventory:read");
      expect(manager.permissions).toContain("inventory:update");
      expect(manager.permissions).toContain("inventory:delete");
      expect(manager.permissions).toContain("inventory:transfer");
      // debts read-only
      expect(manager.permissions).toContain("debts:read");
      expect(manager.permissions).not.toContain("debts:create");
      expect(manager.permissions).not.toContain("debts:settle");
    });

    it("manager does NOT have admin-only or destructive perms (debts/invoices/payments mutations)", () => {
      const manager = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "manager")!;
      // no debt mutations
      expect(manager.permissions).not.toContain("debts:create");
      expect(manager.permissions).not.toContain("debts:update");
      expect(manager.permissions).not.toContain("debts:settle");
      // no invoice/payment mutations
      expect(manager.permissions).not.toContain("invoices:create");
      expect(manager.permissions).not.toContain("invoices:delete");
      expect(manager.permissions).not.toContain("payments:create");
      expect(manager.permissions).not.toContain("payments:delete");
    });

    it("viewer has read-only access to all entities", () => {
      const viewer = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "viewer")!;
      // all reads
      expect(viewer.permissions).toContain("employees:read");
      expect(viewer.permissions).toContain("projects:read");
      expect(viewer.permissions).toContain("warehouses:read");
      expect(viewer.permissions).toContain("inventory:read");
      expect(viewer.permissions).toContain("debts:read");
      expect(viewer.permissions).toContain("invoices:read");
      expect(viewer.permissions).toContain("payments:read");
      // no mutations
      expect(viewer.permissions).not.toContain("employees:create");
      expect(viewer.permissions).not.toContain("employees:update");
      expect(viewer.permissions).not.toContain("employees:delete");
      expect(viewer.permissions).not.toContain("projects:create");
      expect(viewer.permissions).not.toContain("inventory:transfer");
      expect(viewer.permissions).not.toContain("debts:settle");
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
    it("returns permissions for admin", () => {
      const perms = getPermissionsForRole("admin");
      expect(perms).toEqual(ALL_PERMISSIONS);
    });

    it("returns permissions for manager", () => {
      const perms = getPermissionsForRole("manager");
      expect(perms).toContain("employees:create");
      expect(perms).not.toContain("debts:create");
    });

    it("returns read-only permissions for viewer", () => {
      const perms = getPermissionsForRole("viewer");
      expect(perms).toContain("employees:read");
      expect(perms).not.toContain("employees:create");
    });

    it("returns empty array for unknown role", () => {
      const perms = getPermissionsForRole("nonexistent");
      expect(perms).toEqual([]);
    });

    it("returns empty array for empty or differently-cased role keys (exact match)", () => {
      expect(getPermissionsForRole("")).toEqual([]);
      expect(getPermissionsForRole("ADMIN")).toEqual([]);
    });

    it("returns a fresh copy — mutating it cannot corrupt the seed", () => {
      const perms = getPermissionsForRole("admin");
      perms.length = 0;
      // The seed list (and every later caller) is unaffected.
      expect(getPermissionsForRole("admin")).toEqual(ALL_PERMISSIONS);
      const seed = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin")!;
      expect(seed.permissions).toEqual(ALL_PERMISSIONS);
    });
  });
});
