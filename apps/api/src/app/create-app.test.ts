import { describe, expect, it, vi } from "vitest";

import { createApp, createTransportSecurity } from "./create-app";

const transportSecurity = {
  allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  appClientKey: "test-client-key",
} as const;

const createDependencies = () => ({
  auth: {
    handler: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
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
      phone: "+2135550101",
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
