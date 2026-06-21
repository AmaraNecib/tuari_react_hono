import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionService } from "./session.service";
import type { Permission } from "../rbac/permissions";

function createMockAuthGateway(user: any = null) {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(user ? { user } : null),
    },
  };
}

function createMockPermissionResolver(permissions: Permission[] = []) {
  return {
    getPermissionsForUserId: vi.fn().mockResolvedValue(permissions),
  };
}

describe("SessionService", () => {
  describe("getCurrentUser", () => {
    it("returns null when no session", async () => {
      const gateway = createMockAuthGateway(null);
      const permResolver = createMockPermissionResolver([]);
      const service = new SessionService(gateway, permResolver);

      const result = await service.getCurrentUser(new Headers());
      expect(result).toBeNull();
    });

    it("returns user without phone", async () => {
      const gateway = createMockAuthGateway({ id: "u1", name: "Test" });
      const permResolver = createMockPermissionResolver([]);
      const service = new SessionService(gateway, permResolver);

      const result = await service.getCurrentUser(new Headers());
      expect(result).toBeNull();
    });

    it("returns user with permissions", async () => {
      const gateway = createMockAuthGateway({
        id: "u1",
        name: "Admin",
        phoneNumber: "0555000001",
      });
      const permResolver = createMockPermissionResolver([
        "employees.create",
        "employees.read",
      ]);
      const service = new SessionService(gateway, permResolver);

      const result = await service.getCurrentUser(new Headers());
      expect(result).toEqual({
        id: "u1",
        name: "Admin",
        phone: "0555000001",
        permissions: ["employees.create", "employees.read"],
      });
    });

    it("returns user with empty permissions when none assigned", async () => {
      const gateway = createMockAuthGateway({
        id: "u1",
        name: "Viewer",
        phoneNumber: "0555000002",
      });
      const permResolver = createMockPermissionResolver([]);
      const service = new SessionService(gateway, permResolver);

      const result = await service.getCurrentUser(new Headers());
      expect(result).toEqual({
        id: "u1",
        name: "Viewer",
        phone: "0555000002",
        permissions: [],
      });
    });
  });
});
