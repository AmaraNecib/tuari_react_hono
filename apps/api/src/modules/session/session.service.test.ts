import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionService } from "./session.service";
import type { Permission } from "../rbac/permissions";

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
});

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

    it("returns null when user has no phone", async () => {
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

    it("returns user with version from env var", async () => {
      process.env.TUARI_APP_VERSION = "2.0.0";

      const gateway = createMockAuthGateway({
        id: "u1",
        name: "Admin",
        phoneNumber: "0555000001",
      });
      const permResolver = createMockPermissionResolver([
        "employees:create",
        "employees:read",
      ]);
      const service = new SessionService(gateway, permResolver);

      const result = await service.getCurrentUser(new Headers());
      expect(result).toEqual({
        id: "u1",
        name: "Admin",
        phone: "0555000001",
        permissions: ["employees:create", "employees:read"],
        version: "2.0.0",
      });
    });

    it("returns user with fallback version when env var is not set", async () => {
      delete process.env.TUARI_APP_VERSION;

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
        version: expect.any(String),
      });
    });
  });
});
