import { createRouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from "./router";
import type { RpcContext } from "./context";

describe("RPC router auth context", () => {
  const todoService = {
    listForUser: vi.fn(),
    createForUser: vi.fn(),
    toggleForUser: vi.fn(),
    removeForUser: vi.fn(),
  };

  const router = createRouter({ todoService });
  const currentUser = {
    id: "user-1",
    name: "Taylor",
    email: "taylor@example.com",
  };
  const createContext = (user: typeof currentUser | null = currentUser): RpcContext => ({
    headers: new Headers({ cookie: "session=token" }),
    resolveCurrentUser: vi.fn().mockResolvedValue(user),
  });

  beforeEach(() => {
    todoService.listForUser.mockReset();
    todoService.createForUser.mockReset();
    todoService.toggleForUser.mockReset();
    todoService.removeForUser.mockReset();
  });

  it("returns the resolved current user for the session procedure", async () => {
    const context = createContext();
    const client = createRouterClient(router, { context });

    await expect(client.session()).resolves.toEqual({
      user: currentUser,
    });
    expect(context.resolveCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("uses the resolved current user in protected todo procedures", async () => {
    const context = createContext();
    const client = createRouterClient(router, { context });
    todoService.listForUser.mockResolvedValue([]);
    todoService.createForUser.mockResolvedValue({
      id: "todo-1",
      title: "Ship Phase 2",
      completed: false,
      createdAt: "2026-03-12T10:00:00.000Z",
    });

    await expect(client.todos.list()).resolves.toEqual([]);
    await expect(client.todos.create({ title: "Ship Phase 2" })).resolves.toEqual({
      id: "todo-1",
      title: "Ship Phase 2",
      completed: false,
      createdAt: "2026-03-12T10:00:00.000Z",
    });
    expect(todoService.listForUser).toHaveBeenCalledWith(currentUser.id);
    expect(todoService.createForUser).toHaveBeenCalledWith(currentUser.id, "Ship Phase 2");
    expect(context.resolveCurrentUser).toHaveBeenCalledTimes(2);
  });

  it("does not resolve auth for public procedures that do not use it", async () => {
    const context = createContext();
    const client = createRouterClient(router, { context });

    await expect(client.health()).resolves.toMatchObject({
      status: "ok",
    });

    expect(context.resolveCurrentUser).not.toHaveBeenCalled();
  });

  it("keeps unauthorized todo access consistent when no current user exists", async () => {
    const client = createRouterClient(router, {
      context: createContext(null),
    });

    await expect(client.todos.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(todoService.listForUser).not.toHaveBeenCalled();
  });
});
