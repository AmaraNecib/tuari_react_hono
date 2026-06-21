import { describe, it, expect, vi, beforeEach } from "vitest";
import { ORPCError } from "@orpc/server";
import { createPermissionMiddleware, type PermissionMiddleware } from "./permission-middleware";
import type { Permission } from "./permissions";
import type { RpcContext } from "../../rpc/context";
import type { SessionUser } from "../session/session.types";

function createMockContext(permissions: Permission[] = []): RpcContext {
  const user: SessionUser = {
    id: "user-1",
    name: "Admin",
    phone: "0555000001",
    permissions,
  };

  return {
    headers: new Headers(),
    resolveCurrentUser: () => Promise.resolve(user),
  };
}

function createNoUserContext(): RpcContext {
  return {
    headers: new Headers(),
    resolveCurrentUser: () => Promise.resolve(null),
  };
}

describe("permission middleware", () => {
  let middleware: PermissionMiddleware;

  beforeEach(() => {
    middleware = createPermissionMiddleware();
  });

  describe("withPermission", () => {
    it("allows access when user has the required permission", async () => {
      const handler = middleware.withPermission("employees.create", async ({ context }) => {
        return { success: true };
      });

      const result = await handler({
        context: createMockContext(["employees.create"]),
        input: {},
      });

      expect(result).toEqual({ success: true });
    });

    it("denies access when user lacks the required permission", async () => {
      const handler = middleware.withPermission("employees.create", async ({ context }) => {
        return { success: true };
      });

      await expect(
        handler({
          context: createMockContext(["employees.read"]),
          input: {},
        }),
      ).rejects.toThrow(ORPCError);

      try {
        await handler({
          context: createMockContext(["employees.read"]),
          input: {},
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as any).code).toBe("FORBIDDEN");
      }
    });

    it("denies access when user has no permissions", async () => {
      const handler = middleware.withPermission("employees.create", async ({ context }) => {
        return { success: true };
      });

      await expect(
        handler({
          context: createMockContext([]),
          input: {},
        }),
      ).rejects.toThrow(ORPCError);
    });

    it("denies access when user is not authenticated", async () => {
      const handler = middleware.withPermission("employees.create", async ({ context }) => {
        return { success: true };
      });

      await expect(
        handler({
          context: createNoUserContext(),
          input: {},
        }),
      ).rejects.toThrow(ORPCError);
    });

    it("denies access with correct error code", async () => {
      const handler = middleware.withPermission("employees.delete", async ({ context }) => {
        return { success: true };
      });

      try {
        await handler({
          context: createMockContext(["employees.read"]),
          input: {},
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as any).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("withPermission (multiple permissions)", () => {
    it("allows when user has ANY of the required permissions", async () => {
      const handler = middleware.withPermission(
        ["employees.create", "employees.update"],
        async ({ context }) => {
          return { success: true };
        },
      );

      // Has create
      const result1 = await handler({
        context: createMockContext(["employees.create"]),
        input: {},
      });
      expect(result1).toEqual({ success: true });

      // Has update
      const result2 = await handler({
        context: createMockContext(["employees.update"]),
        input: {},
      });
      expect(result2).toEqual({ success: true });
    });

    it("denies when user has NONE of the required permissions", async () => {
      const handler = middleware.withPermission(
        ["employees.create", "employees.update"],
        async ({ context }) => {
          return { success: true };
        },
      );

      await expect(
        handler({
          context: createMockContext(["employees.read"]),
          input: {},
        }),
      ).rejects.toThrow(ORPCError);
    });
  });
});
