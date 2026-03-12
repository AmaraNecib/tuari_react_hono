import { describe, expect, it, vi } from "vitest";

import { createApp } from "./create-app";

describe("createApp RPC wiring", () => {
  it("skips session resolution for public RPC procedures that do not need auth", async () => {
    const dependencies = {
      auth: {
        handler: vi.fn(),
      },
      sessionService: {
        getCurrentUser: vi.fn(),
      },
      todoService: {
        listForUser: vi.fn(),
        createForUser: vi.fn(),
        toggleForUser: vi.fn(),
        removeForUser: vi.fn(),
      },
    };
    const app = createApp(dependencies as never);

    const response = await app.request(
      new Request("http://localhost/rpc/health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:1420",
          "x-tuari-client-key": "tuari-desktop-client-key-v1",
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
      email: "taylor@example.com",
    };
    const dependencies = {
      auth: {
        handler: vi.fn(),
      },
      sessionService: {
        getCurrentUser: vi.fn().mockResolvedValue(currentUser),
      },
      todoService: {
        listForUser: vi.fn(),
        createForUser: vi.fn(),
        toggleForUser: vi.fn(),
        removeForUser: vi.fn(),
      },
    };
    const app = createApp(dependencies as never);

    const response = await app.request(
      new Request("http://localhost/rpc/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:1420",
          "x-tuari-client-key": "tuari-desktop-client-key-v1",
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
    expect(dependencies.todoService.listForUser).not.toHaveBeenCalled();
  });
});
