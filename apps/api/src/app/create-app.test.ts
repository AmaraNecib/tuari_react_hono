import { describe, expect, it, vi } from "vitest";

import { AccountServiceError } from "../modules/account/account.service";
import { createApp, createTransportSecurity } from "./create-app";

const transportSecurity = {
  allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  appClientKey: "test-client-key",
} as const;

const createDependencies = () => ({
  auth: {
    handler: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    api: {
      getSession: vi.fn(),
    },
  },
  accountService: {
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
          "x-tuari-client-key": "test-client-key",
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
          "x-tuari-client-key": "test-client-key",
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
          "x-tuari-client-key": "test-client-key",
        },
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "Blocked origin." });
    expect(response.status).toBe(403);
  });

  it("blocks auth requests with a missing origin", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/api/auth/session", {
        method: "GET",
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "Blocked origin." });
    expect(response.status).toBe(403);
    expect(dependencies.auth.handler).not.toHaveBeenCalled();
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


  it("blocks RPC requests with a missing client key", async () => {
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

    await expect(response.json()).resolves.toEqual({ message: "Blocked client." });
    expect(response.status).toBe(403);
  });

  it("blocks RPC requests with the wrong client key", async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies as never, transportSecurity);

    const response = await app.request(
      new Request("http://localhost/rpc/health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-tuari-client-key": "wrong-client-key",
        },
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ message: "Blocked client." });
    expect(response.status).toBe(403);
  });
});

describe("createTransportSecurity", () => {
  it("fails closed for requests without an origin", () => {
    const transport = createTransportSecurity(transportSecurity);

    expect(transport.isAllowedOrigin(undefined)).toBe(false);
    expect(transport.resolveCorsOrigin(undefined)).toBe("");
  });
});
