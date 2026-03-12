import { describe, expect, it, vi } from "vitest";

import { createApp } from "./create-app";

describe("createApp RPC wiring", () => {
  it("resolves the current user once and serves it through the session RPC endpoint", async () => {
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
