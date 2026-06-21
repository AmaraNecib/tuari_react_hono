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
    it("has 5 roles", () => {
      expect(DEFAULT_ROLE_PERMISSIONS).toHaveLength(5);
    });

    it("includes admin role", () => {
      const admin = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin");
      expect(admin).toBeDefined();
      expect(admin!.role.name).toBe("مدير النظام");
    });

    it("includes viewer role", () => {
      const viewer = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "viewer");
      expect(viewer).toBeDefined();
      expect(viewer!.role.name).toBe("مشاهد");
    });

    it("includes existing roles", () => {
      const keys = DEFAULT_ROLE_PERMISSIONS.map((r) => r.role.key);
      expect(keys).toContain("worker");
      expect(keys).toContain("project_manager");
      expect(keys).toContain("warehouse_manager");
    });

    it("admin has ALL permissions", () => {
      const admin = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "admin")!;
      expect(admin.permissions).toEqual(ALL_PERMISSIONS);
    });

    it("viewer has only employees.read", () => {
      const viewer = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "viewer")!;
      expect(viewer.permissions).toEqual(["employees.read"]);
    });

    it("worker has employees.read", () => {
      const worker = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "worker")!;
      expect(worker.permissions).toContain("employees.read");
    });

    it("project_manager has employees.read and employees.update", () => {
      const pm = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "project_manager")!;
      expect(pm.permissions).toContain("employees.read");
      expect(pm.permissions).toContain("employees.update");
      expect(pm.permissions).not.toContain("employees.create");
      expect(pm.permissions).not.toContain("employees.delete");
    });

    it("warehouse_manager has employees.read and invoice access", () => {
      const wm = DEFAULT_ROLE_PERMISSIONS.find((r) => r.role.key === "warehouse_manager")!;
      expect(wm.permissions).toEqual([
        "employees.read",
        "invoices.read",
        "invoices.create",
        "invoices.update",
      ]);
    });
  });

  describe("getPermissionsForRole", () => {
    it("returns permissions for known role", () => {
      const perms = getPermissionsForRole("admin");
      expect(perms).toEqual(ALL_PERMISSIONS);
    });

    it("returns empty array for unknown role", () => {
      const perms = getPermissionsForRole("nonexistent");
      expect(perms).toEqual([]);
    });
  });
});
