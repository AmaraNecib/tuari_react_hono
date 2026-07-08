import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionService } from "./session.service";
import type { Permission } from "../rbac/permissions";

const OLD_ENV = process.env;

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
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

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

    it("returns null without phone even when version env is set", async () => {
      process.env.TUARI_APP_VERSION = "2.0.0";
      const gateway = createMockAuthGateway({ id: "u1", name: "Test" });
      const permResolver = createMockPermissionResolver([]);
      const service = new SessionService(gateway, permResolver);

      const result = await service.getCurrentUser(new Headers());
      expect(result).toBeNull();
    });

    it("returns user with permissions and version from env", async () => {
      process.env.TUARI_APP_VERSION = "2.0.0";
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
        version: "2.0.0",
      });
    });

    it("returns user with empty permissions when none assigned", async () => {
      process.env.TUARI_APP_VERSION = "1.0.0";
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
        version: "1.0.0",
      });
    });

    it("falls back to package.json version when env var is not set", async () => {
      delete process.env.TUARI_APP_VERSION;
      const gateway = createMockAuthGateway({
        id: "u1",
        name: "Admin",
        phoneNumber: "0555000001",
      });
      const permResolver = createMockPermissionResolver([]);
      const service = new SessionService(gateway, permResolver);

      const result = await service.getCurrentUser(new Headers());
      expect(result).not.toBeNull();
      expect(result!.version).toBe("0.0.0");
    });
  });
});
