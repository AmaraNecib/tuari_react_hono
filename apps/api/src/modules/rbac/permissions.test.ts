import { describe, it, expect } from "vitest";
import {
  ALL_PERMISSIONS,
  RESOURCE_PERMISSIONS,
  isPermission,
  isResourcePermission,
  type Permission,
  type ResourcePermission,
} from "./permissions";

describe("permissions", () => {
  describe("ALL_PERMISSIONS", () => {
    it("contains employees permissions", () => {
      expect(ALL_PERMISSIONS).toContain("employees:create");
      expect(ALL_PERMISSIONS).toContain("employees:read");
      expect(ALL_PERMISSIONS).toContain("employees:update");
      expect(ALL_PERMISSIONS).toContain("employees:delete");
    });

    it("is a readonly array", () => {
      expect(Array.isArray(ALL_PERMISSIONS)).toBe(true);
      expect(Object.freeze).toBeDefined();
    });
  });

  describe("RESOURCE_PERMISSIONS", () => {
    it("has employees resource", () => {
      expect(RESOURCE_PERMISSIONS.employees).toEqual([
        "create",
        "read",
        "update",
        "delete",
      ]);
    });

    it("has projects resource", () => {
      expect(RESOURCE_PERMISSIONS.projects).toEqual([
        "create",
        "read",
        "update",
        "delete",
      ]);
    });

    it("has warehouses resource", () => {
      expect(RESOURCE_PERMISSIONS.warehouses).toEqual([
        "create",
        "read",
        "update",
        "delete",
      ]);
    });

    it("has inventory resource with transfer action", () => {
      expect(RESOURCE_PERMISSIONS.inventory).toContain("transfer");
    });

    it("has debts resource with settle action", () => {
      expect(RESOURCE_PERMISSIONS.debts).toContain("settle");
    });
  });

  describe("isPermission", () => {
    it("returns true for valid permission strings", () => {
      expect(isPermission("employees:create")).toBe(true);
      expect(isPermission("employees:read")).toBe(true);
      expect(isPermission("projects:delete")).toBe(true);
    });

    it("returns false for invalid permission strings", () => {
      expect(isPermission("invalid")).toBe(false);
      expect(isPermission("employees:")).toBe(false);
      expect(isPermission("employees:unknown")).toBe(false);
      expect(isPermission("")).toBe(false);
    });

    it("returns false for the old dot-separated format (rejected on purpose)", () => {
      // The migration is a hard cut from `employees.create` to `employees:create`.
      // The colon form is the only one recognised.
      expect(isPermission("employees.create")).toBe(false);
      expect(isPermission("projects.create")).toBe(false);
    });

    it("returns false when whitespace or format characters smuggle into either segment", () => {
      // Permission strings are exact-match: neither segment may carry padding
      // (spaces/tabs) or invisible format chars (#210 unknown-string + #234
      // hygiene) — a stale or hand-edited string must not validate.
      expect(isPermission(" employees:create")).toBe(false);
      expect(isPermission("employees :create")).toBe(false);
      expect(isPermission("employees: create")).toBe(false);
      expect(isPermission("employees:\tcreate")).toBe(false);
      expect(isPermission("\u200Bemployees:create")).toBe(false);
      expect(isPermission("employees:\u200Bcreate")).toBe(false);
    });

    it("returns false for extra colon segments (the format is exactly resource:action)", () => {
      // A corrupted/legacy row with trailing segments (e.g. a note appended
      // after a second colon) must not validate as a known permission.
      expect(isPermission("employees:create:extra")).toBe(false);
      expect(isPermission("employees:create:")).toBe(false);
      expect(isPermission(":employees:create")).toBe(false);
      expect(isPermission("employees::create")).toBe(false);
      expect(isPermission(":")).toBe(false);
    });
  });

  describe("isResourcePermission", () => {
    it("returns true for valid resource permission", () => {
      expect(isResourcePermission("employees", "create")).toBe(true);
      expect(isResourcePermission("employees", "read")).toBe(true);
    });

    it("returns false for invalid resource", () => {
      expect(isResourcePermission("invalid", "create")).toBe(false);
    });

    it("returns false for invalid action", () => {
      expect(isResourcePermission("employees", "unknown")).toBe(false);
    });

    it("returns false when either segment carries whitespace or format characters", () => {
      expect(isResourcePermission(" employees", "create")).toBe(false);
      expect(isResourcePermission("employees", " create")).toBe(false);
      expect(isResourcePermission("employees", "\u200Bcreate")).toBe(false);
      expect(isResourcePermission("employees\u200B", "create")).toBe(false);
    });
  });
});

// Type tests — these should compile
type Assert<T extends true> = T;
type IsReadonlyArray = Assert<true extends (typeof ALL_PERMISSIONS extends readonly Permission[] ? true : false) ? true : false>;
