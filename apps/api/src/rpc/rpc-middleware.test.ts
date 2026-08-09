import { describe, it, expect, vi, beforeEach } from "vitest";
import { ORPCError } from "@orpc/server";
import { createRpcMiddleware, type RpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";
import type { SessionUser } from "../modules/session/session.types";

function createMockContext(
  user: (SessionUser & { permissions?: string[] }) | null = null,
  options: { remoteAddress?: string } = {},
): RpcContext {
  return {
    headers: new Headers(),
    resolveCurrentUser: () => Promise.resolve(user),
    remoteAddress: options.remoteAddress,
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
      "employees:create",
      async ({ context, input }) => ({ success: true }),
    );

    const result = await handler({
      context: createMockContext({
        id: "u1",
        name: "Admin",
        phone: "0555000001",
        permissions: ["employees:create", "employees:read"],
        version: "0.0.0",
      }),
      input: {},
    });

    expect(result).toEqual({ success: true });
  });

  it("denies access when user lacks the required permission", async () => {
    const handler = middleware.withPermission(
      "employees:create",
      async ({ context, input }) => ({ success: true }),
    );

    try {
      await handler({
        context: createMockContext({
          id: "u1",
          name: "Viewer",
          phone: "0555000002",
          permissions: ["employees:read"],
          version: "0.0.0",
        }),
        input: {},
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as { code: string }).code).toBe("FORBIDDEN");
    }
  });

  it("denies access when user has no permissions", async () => {
    const handler = middleware.withPermission(
      "employees:create",
      async ({ context, input }) => ({ success: true }),
    );

    try {
      await handler({
        context: createMockContext({
          id: "u1",
          name: "NoPerms",
          phone: "0555000003",
          permissions: [],
          version: "0.0.0",
        }),
        input: {},
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as { code: string }).code).toBe("FORBIDDEN");
    }
  });

  it("denies access when user is not authenticated", async () => {
    const handler = middleware.withPermission(
      "employees:create",
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
      expect((error as { code: string }).code).toBe("UNAUTHORIZED");
    }
  });

  it("documents OR semantics: an array is satisfied by ANY single permission, not ALL", async () => {
    const handler = middleware.withPermission(
      ["employees:create", "employees:update"],
      async ({ context, input }) => ({ success: true }),
    );

    // User holds ONLY the first permission of the pair — allowed under OR
    // (some()), denied under AND (every()) — pinning the documented semantics.
    const result = await handler({
      context: createMockContext({
        id: "u1",
        name: "Creator",
        phone: "0555000006",
        permissions: ["employees:create"],
        version: "0.0.0",
      }),
      input: {},
    });

    expect(result).toEqual({ success: true });
  });

  it("allows when user has ANY of multiple required permissions", async () => {
    const handler = middleware.withPermission(
      ["employees:create", "employees:update"],
      async ({ context, input }) => ({ success: true }),
    );

    const result = await handler({
      context: createMockContext({
        id: "u1",
        name: "PM",
        phone: "0555000004",
        permissions: ["employees:update"],
        version: "0.0.0",
      }),
      input: {},
    });

    expect(result).toEqual({ success: true });
  });

  it("denies when user has NONE of multiple required permissions", async () => {
    const handler = middleware.withPermission(
      ["employees:create", "employees:update"],
      async ({ context, input }) => ({ success: true }),
    );

    try {
      await handler({
        context: createMockContext({
          id: "u1",
          name: "Viewer",
          phone: "0555000005",
          permissions: ["employees:read"],
          version: "0.0.0",
        }),
        input: {},
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as { code: string }).code).toBe("FORBIDDEN");
    }
  });
});

describe("RPC Middleware — rate limiting (unspoofable key)", () => {
  const adminUser = {
    id: "u-admin",
    name: "Admin",
    phone: "0555000001",
    permissions: [],
    version: "0.0.0",
  };

  async function callRateLimited(middleware: RpcMiddleware, context: RpcContext) {
    const handler = middleware.queryAuthRateLimited(async () => ({ success: true }));
    return handler({ context, input: {} });
  }

  it("keys the budget on the socket address and ignores spoofed x-forwarded-for", async () => {
    const middleware = createRpcMiddleware({
      authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
    });

    // 100 requests from the SAME socket, each with a DIFFERENT spoofed
    // x-forwarded-for. The pre-fix key (`trustProxyHeaders: true`, no socket
    // fallback) gave each rotation a fresh budget; the fix must keep them all
    // on ONE socket-keyed budget so the 101st request is rejected.
    for (let i = 0; i < 100; i++) {
      const context = createMockContext(adminUser, { remoteAddress: "192.0.2.7" });
      context.headers.set("x-forwarded-for", `203.0.113.${i}`);
      await expect(callRateLimited(middleware, context)).resolves.toEqual({ success: true });
    }

    const exhausted = createMockContext(adminUser, { remoteAddress: "192.0.2.7" });
    exhausted.headers.set("x-forwarded-for", "203.0.113.999");
    await expect(callRateLimited(middleware, exhausted)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("ignores spoofed x-real-ip when proxy headers are untrusted", async () => {
    const middleware = createRpcMiddleware({
      authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
    });

    for (let i = 0; i < 100; i++) {
      const context = createMockContext(adminUser, { remoteAddress: "192.0.2.8" });
      context.headers.set("x-real-ip", `203.0.113.${i}`);
      await expect(callRateLimited(middleware, context)).resolves.toEqual({ success: true });
    }

    const exhausted = createMockContext(adminUser, { remoteAddress: "192.0.2.8" });
    exhausted.headers.set("x-real-ip", "203.0.113.999");
    await expect(callRateLimited(middleware, exhausted)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("uses the spoofable header only when trustProxyHeaders is enabled", async () => {
    const middleware = createRpcMiddleware({
      authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
      trustProxyHeaders: true,
    });

    // Rotating the header rotates the key, so the budget is never exhausted
    // even from a single socket — the documented opt-in proxy trust.
    for (let i = 0; i < 100; i++) {
      const context = createMockContext(adminUser, { remoteAddress: "192.0.2.7" });
      context.headers.set("x-forwarded-for", `203.0.113.${i}`);
      await expect(callRateLimited(middleware, context)).resolves.toEqual({ success: true });
    }

    const freshHeader = createMockContext(adminUser, { remoteAddress: "192.0.2.7" });
    freshHeader.headers.set("x-forwarded-for", "198.51.100.1");
    await expect(callRateLimited(middleware, freshHeader)).resolves.toEqual({ success: true });
  });

  it("falls back to the socket address in trusted mode when no header is present", async () => {
    const middleware = createRpcMiddleware({
      authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
      trustProxyHeaders: true,
    });

    // No spoofed header on the wire: trusted mode still keys on the socket,
    // so the budget is shared and exhaustible rather than anonymous.
    for (let i = 0; i < 100; i++) {
      await expect(
        callRateLimited(middleware, createMockContext(adminUser, { remoteAddress: "192.0.2.9" })),
      ).resolves.toEqual({ success: true });
    }

    await expect(
      callRateLimited(middleware, createMockContext(adminUser, { remoteAddress: "192.0.2.9" })),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("falls back to a shared 'unknown' bucket when no socket address is available", async () => {
    const middleware = createRpcMiddleware({
      authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
    });

    for (let i = 0; i < 100; i++) {
      await expect(callRateLimited(middleware, createMockContext(adminUser))).resolves.toEqual({
        success: true,
      });
    }

    await expect(callRateLimited(middleware, createMockContext(adminUser))).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});

describe("RPC Middleware — license gating", () => {
  let rpcMiddleware: RpcMiddleware;
  const authedUser = {
    id: "u1",
    name: "Test",
    phone: "0612345678",
    version: "0.0.0",
    permissions: [],
  };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("TUARI_LICENSE_")) {
        delete process.env[key];
      }
    }
    rpcMiddleware = createRpcMiddleware({
      authBootstrapService: { isBootstrapOwner: vi.fn().mockResolvedValue(true) },
    });
  });

  describe("requireEdition", () => {
    it("passes through when current edition meets the minimum", async () => {
      process.env.TUARI_LICENSE_EDITION = "professional";
      const handler = vi.fn().mockResolvedValue("ok");

      const wrapped = rpcMiddleware.requireEdition("professional", handler);
      const result = await wrapped({
        context: createMockContext(authedUser),
        input: {},
      });

      expect(result).toBe("ok");
      expect(handler).toHaveBeenCalledOnce();
    });

    it("allows higher editions than the minimum with an authenticated user", async () => {
      process.env.TUARI_LICENSE_EDITION = "enterprise";
      const handler = vi.fn().mockResolvedValue("ok");

      const wrapped = rpcMiddleware.requireEdition("professional", handler);
      const result = await wrapped({
        context: createMockContext(authedUser),
        input: {},
      });

      expect(result).toBe("ok");
    });

    it("throws UPGRADE_REQUIRED when current edition is below the minimum", async () => {
      process.env.TUARI_LICENSE_EDITION = "standard";
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireEdition("professional", handler);

      await expect(
        wrapped({
          context: createMockContext(authedUser),
          input: {},
        }),
      ).rejects.toMatchObject({
        code: "UPGRADE_REQUIRED",
        data: { requiredEdition: "professional" },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("throws UNAUTHORIZED when user is not authenticated", async () => {
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireEdition("enterprise", handler);

      await expect(
        wrapped({
          context: createMockContext(null),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("uses defaults (standard edition) when env vars are missing and requires enterprise", async () => {
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireEdition("enterprise", handler);

      await expect(
        wrapped({
          context: createMockContext(authedUser),
          input: {},
        }),
      ).rejects.toMatchObject({
        code: "UPGRADE_REQUIRED",
        data: { requiredEdition: "enterprise" },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("rejects expired license even when edition meets the minimum", async () => {
      process.env.TUARI_LICENSE_EDITION = "enterprise";
      process.env.TUARI_LICENSE_STATUS = "expired";
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireEdition("enterprise", handler);

      await expect(
        wrapped({
          context: createMockContext(authedUser),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("requireFeature", () => {
    it("passes through when the feature is present", async () => {
      process.env.TUARI_LICENSE_FEATURES = "lan_server,multi_user";
      const handler = vi.fn().mockResolvedValue("ok");

      const wrapped = rpcMiddleware.requireFeature("lan_server", handler);
      const result = await wrapped({
        context: createMockContext(authedUser),
        input: {},
      });

      expect(result).toBe("ok");
      expect(handler).toHaveBeenCalledOnce();
    });

    it("throws UPGRADE_REQUIRED when the feature is absent", async () => {
      process.env.TUARI_LICENSE_FEATURES = "lan_server";
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireFeature("multi_user", handler);

      await expect(
        wrapped({
          context: createMockContext(authedUser),
          input: {},
        }),
      ).rejects.toMatchObject({
        code: "UPGRADE_REQUIRED",
        data: { requiredEdition: "professional" },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("throws UNAUTHORIZED when user is not authenticated", async () => {
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireFeature("lan_server", handler);

      await expect(
        wrapped({
          context: createMockContext(null),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("throws UPGRADE_REQUIRED when features list is empty", async () => {
      process.env.TUARI_LICENSE_FEATURES = "";
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireFeature("advanced_reports", handler);

      await expect(
        wrapped({
          context: createMockContext(authedUser),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("uses default empty features when env var is missing", async () => {
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireFeature("lan_server", handler);

      await expect(
        wrapped({
          context: createMockContext(authedUser),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("rejects expired license even when the feature is present", async () => {
      process.env.TUARI_LICENSE_FEATURES = "advanced_reports";
      process.env.TUARI_LICENSE_STATUS = "expired";
      const handler = vi.fn();

      const wrapped = rpcMiddleware.requireFeature("advanced_reports", handler);

      await expect(
        wrapped({
          context: createMockContext(authedUser),
          input: {},
        }),
      ).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
