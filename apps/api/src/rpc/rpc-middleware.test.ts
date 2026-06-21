import { describe, it, expect, vi, beforeEach } from "vitest";
import { ORPCError } from "@orpc/server";
import { createRpcMiddleware, type RpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";
import type { SessionUser } from "../modules/session/session.types";

function createMockContext(user: (SessionUser & { permissions?: string[] }) | null = null): RpcContext {
  return {
    headers: new Headers(),
    resolveCurrentUser: () => Promise.resolve(user),
  };
}

describe("RPC Middleware — withPermission", () => {
  let middleware: RpcMiddleware;

  beforeEach(() => {
    middleware = createRpcMiddleware({
      authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
    });
  });

  it("allows access when user has the required permission", async () => {
    const handler = middleware.withPermission(
      "employees.create",
      async ({ context, input }) => ({ success: true }),
    );

    const result = await handler({
      context: createMockContext({
        id: "u1",
        name: "Admin",
        phone: "0555000001",
        permissions: ["employees.create", "employees.read"],
      }),
      input: {},
    });

    expect(result).toEqual({ success: true });
  });

  it("denies access when user lacks the required permission", async () => {
    const handler = middleware.withPermission(
      "employees.create",
      async ({ context, input }) => ({ success: true }),
    );

    try {
      await handler({
        context: createMockContext({
          id: "u1",
          name: "Viewer",
          phone: "0555000002",
          permissions: ["employees.read"],
        }),
        input: {},
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError).code).toBe("FORBIDDEN");
    }
  });

  it("denies access when user has no permissions", async () => {
    const handler = middleware.withPermission(
      "employees.create",
      async ({ context, input }) => ({ success: true }),
    );

    try {
      await handler({
        context: createMockContext({
          id: "u1",
          name: "NoPerms",
          phone: "0555000003",
          permissions: [],
        }),
        input: {},
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError).code).toBe("FORBIDDEN");
    }
  });

  it("denies access when user is not authenticated", async () => {
    const handler = middleware.withPermission(
      "employees.create",
      async ({ context, input }) => ({ success: true }),
    );

    try {
      await handler({
        context: createMockContext(null),
        input: {},
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError).code).toBe("UNAUTHORIZED");
    }
  });

  it("allows when user has ANY of multiple required permissions", async () => {
    const handler = middleware.withPermission(
      ["employees.create", "employees.update"],
      async ({ context, input }) => ({ success: true }),
    );

    const result = await handler({
      context: createMockContext({
        id: "u1",
        name: "PM",
        phone: "0555000004",
        permissions: ["employees.update"],
      }),
      input: {},
    });

    expect(result).toEqual({ success: true });
  });

  it("denies when user has NONE of multiple required permissions", async () => {
    const handler = middleware.withPermission(
      ["employees.create", "employees.update"],
      async ({ context, input }) => ({ success: true }),
    );

    try {
      await handler({
        context: createMockContext({
          id: "u1",
          name: "Viewer",
          phone: "0555000005",
          permissions: ["employees.read"],
        }),
        input: {},
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError).code).toBe("FORBIDDEN");
    }
  });
});
