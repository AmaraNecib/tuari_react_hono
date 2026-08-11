import { describe, expect, it, vi } from "vitest";

import { AccountServiceError } from "../modules/account/account.service";
import { createApp, createTransportSecurity } from "./create-app";

const transportSecurity = {
  allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
} as const;

const createDependencies = () => ({
  auth: {
    handler: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    api: {
      getSession: vi.fn(),
    },
  },
  accountService: {
    getCurrentSessionUser: vi.fn(),
    recordPasswordChangeForUser: vi.fn(),
    updateCurrentProfile: vi.fn(),
  },
  authBootstrapService: {
    getSetupStatus: vi.fn().mockResolvedValue({ hasUsers: false }),
    isBootstrapOwner: vi.fn().mockResolvedValue(true),
    bootstrapFirstUser: vi.fn(),
  },
  companyService: {
    listRoles: vi.fn(),
  },
  sessionService: {
    getCurrentUser: vi.fn(),
  },
  recoveryKeyService: {
    getPoolStatus: vi.fn().mockResolvedValue({ availableCount: 0, totalCount: 0, maxPoolSize: 5, maskedKeys: [] }),
    generateKeys: vi.fn().mockResolvedValue([]),
    consumeKey: vi.fn().mockResolvedValue(false),
    revokeKey: vi.fn().mockResolvedValue(false),
  },
  databaseKeyManager: {
    changeKey: vi.fn().mockReturnValue({ success: true }),
  },
  databaseKeyPersister: {
    persistKey: vi.fn().mockReturnValue({ success: true }),
  },
});

describe("createApp RPC wiring", () => {
  it("skips session resolution for public RPC procedures that do not need auth", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/rpc/health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      json: {
        status: "ok",
      },
    });
    expect(response.status).toBe(200);
    expect(dependencies.sessionService.getCurrentUser).not.toHaveBeenCalled();
  });

  it("resolves the current user once when the session RPC endpoint needs auth state", async () => {
    const currentUser = {
      id: "user-1",
      name: "Taylor",
      phone: "0612345678",
      version: "0.0.0",
    };
    const dependencies = createDependencies();
    dependencies.sessionService.getCurrentUser.mockResolvedValue(currentUser);
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/rpc/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          cookie: "session=token",
        },
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      json: {
        user: currentUser,
      },
    });
    expect(response.status).toBe(200);
    expect(dependencies.sessionService.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("blocks RPC requests from disallowed origins", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/rpc/health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "Blocked origin." });
    expect(response.status).toBe(403);
  });

  it("allows top-level auth GET requests with a missing origin", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/session", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(dependencies.auth.handler).toHaveBeenCalledTimes(1);
  });

  it("still blocks state-changing auth requests with a missing origin", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "Blocked origin." });
    expect(response.status).toBe(403);
    expect(dependencies.auth.handler).not.toHaveBeenCalled();
  });

  it("adds hardened security headers to API responses", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/health", {
        method: "GET",
        headers: {
          origin: "http://localhost:3000",
        },
      }),
    );

    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("disables caching for auth responses", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.updateCurrentProfile.mockResolvedValue({
      user: { id: "user-1", name: "Taylor", phone: "0612345678" },
    });
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ name: "Taylor" }),
      }),
    );

    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("adds HSTS only for secure non-localhost requests", async () => {
    const secureTransport = {
      allowedOrigins: ["https://app.example.com"],
    } as const;
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, secureTransport);

    const response = await app.request(
      new Request("https://api.example.com/health", {
        method: "GET",
        headers: {
          origin: "https://app.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("does not add HSTS for loopback /8 hosts other than 127.0.0.1", async () => {
    const secureTransport = {
      allowedOrigins: ["http://localhost:3000"],
    } as const;
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, secureTransport);

    const response = await app.request(
      new Request("https://127.0.0.2:4318/rpc/health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );

    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("accepts normalized allowed origins with trailing slashes", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, {
      allowedOrigins: ["https://app.example.com/"],
    });

    const response = await app.request(
      new Request("https://api.example.com/rpc/health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.example.com",
        },
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("delegates profile updates to the account service", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.updateCurrentProfile.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Taylor Updated",
        phone: "0612345678",
      },
    });
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ name: "Taylor Updated" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        name: "Taylor Updated",
        phone: "0612345678",
      },
    });
    expect(dependencies.accountService.updateCurrentProfile).toHaveBeenCalledTimes(1);
  });

  it("records password changes server-side after a successful auth change", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.getCurrentSessionUser.mockResolvedValue({
      id: "user-1",
      name: "Taylor",
      phoneNumber: "0612345678",
    });
    dependencies.auth.handler.mockResolvedValue(
      new Response(JSON.stringify({ token: "rotated-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          authorization: "Bearer current-token",
        },
        body: JSON.stringify({ currentPassword: "old", newPassword: "new-password-123" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ token: "rotated-token" });
    expect(dependencies.auth.handler).toHaveBeenCalledTimes(1);
    expect(dependencies.accountService.recordPasswordChangeForUser).toHaveBeenCalledWith({
      id: "user-1",
      name: "Taylor",
      phoneNumber: "0612345678",
    });
  });

  it("preserves a successful password-change response when audit logging fails", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.getCurrentSessionUser.mockResolvedValue({
      id: "user-1",
      name: "Taylor",
      phoneNumber: "0612345678",
    });
    dependencies.accountService.recordPasswordChangeForUser.mockRejectedValue(new Error("audit failed"));
    dependencies.auth.handler.mockResolvedValue(
      new Response(JSON.stringify({ token: "rotated-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/change-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ currentPassword: "old", newPassword: "new-password-123" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ token: "rotated-token" });
    expect(response.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("maps account-service validation failures to HTTP responses", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.updateCurrentProfile.mockRejectedValue(
      new AccountServiceError("أدخل اسمًا أو رقم هاتف واحدًا على الأقل.", 400),
    );
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({}),
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "أدخل اسمًا أو رقم هاتف واحدًا على الأقل." });
    expect(response.status).toBe(400);
  });

  it("maps account-service conflict failures to HTTP responses", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.updateCurrentProfile.mockRejectedValue(
      new AccountServiceError("رقم الهاتف مستخدم بالفعل.", 409),
    );
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ phone: "0612345678" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "رقم الهاتف مستخدم بالفعل." });
    expect(response.status).toBe(409);
  });

  it("maps account-service auth failures to HTTP responses", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.updateCurrentProfile.mockRejectedValue(
      new AccountServiceError("يجب تسجيل الدخول أولًا.", 401),
    );
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ name: "عمارة" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "يجب تسجيل الدخول أولًا." });
    expect(response.status).toBe(401);
  });
});

describe("createApp body-limit guard", () => {
  it("rejects an oversized JSON body to an app route with 413", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(2 * 1024 * 1024),
          origin: "http://localhost:3000",
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(16));
            controller.close();
          },
        }),
        duplex: "half",
      } as unknown as RequestInit),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ message: "الطلب كبير جدًا." });
    expect(dependencies.accountService.updateCurrentProfile).not.toHaveBeenCalled();
  });

  it("rejects an oversized multipart body to the attachment route before auth/parsing", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/inventory/invoice-groups/group-1/attachments", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=----test",
          "content-length": String(31 * 1024 * 1024),
          origin: "http://localhost:3000",
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(16));
            controller.close();
          },
        }),
        duplex: "half",
      } as unknown as RequestInit),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ message: "الطلب كبير جدًا." });
    // The size guard runs before session resolution and multipart parsing, so
    // neither the auth check nor the inventory service is reached.
    expect(dependencies.accountService.getCurrentSessionUser).not.toHaveBeenCalled();
  });

  it("lets an in-limit JSON body through to the handler", async () => {
    const dependencies = createDependencies();
    dependencies.accountService.updateCurrentProfile.mockResolvedValue({
      user: { id: "user-1", name: "Taylor", phone: "0612345678" },
    });
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ name: "Taylor" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(dependencies.accountService.updateCurrentProfile).toHaveBeenCalledTimes(1);
  });
});

describe("createTransportSecurity", () => {
  it("fails closed for requests without an origin", () => {
    const transport = createTransportSecurity(transportSecurity);

    expect(transport.isAllowedOrigin(undefined)).toBe(false);
    expect(transport.resolveCorsOrigin(undefined)).toBe("");
  });
});
