import { createRouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import { createRouter } from "./router";
import type { RpcContext } from "./context";

describe("RPC router auth context", () => {
  const router = createRouter();
  const currentUser = {
    id: "user-1",
    name: "Taylor",
    phone: "+2135550101",
  };
  const createContext = (user: typeof currentUser | null = currentUser): RpcContext => ({
    headers: new Headers({ cookie: "session=token" }),
    resolveCurrentUser: vi.fn().mockResolvedValue(user),
  });

  it("returns the resolved current user for the session procedure", async () => {
    const context = createContext();
    const client = createRouterClient(router, { context });

    await expect(client.session()).resolves.toEqual({
      user: currentUser,
    });
    expect(context.resolveCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("returns a null user when no session exists", async () => {
    const context = createContext(null);
    const client = createRouterClient(router, { context });

    await expect(client.session()).resolves.toEqual({
      user: null,
    });
  });

  it("does not resolve auth for public health checks", async () => {
    const context = createContext();
    const client = createRouterClient(router, { context });

    await expect(client.health()).resolves.toMatchObject({
      status: "ok",
    });
    expect(context.resolveCurrentUser).not.toHaveBeenCalled();
  });
});
