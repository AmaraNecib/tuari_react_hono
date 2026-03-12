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
  const context: RpcContext = {
    headers: new Headers({ cookie: "session=token" }),
    currentUser,
  };

  beforeEach(() => {
    todoService.listForUser.mockReset();
    todoService.createForUser.mockReset();
    todoService.toggleForUser.mockReset();
    todoService.removeForUser.mockReset();
  });

  it("returns the preloaded current user for the session procedure", async () => {
    const client = createRouterClient(router, { context });

    await expect(client.session()).resolves.toEqual({
      user: currentUser,
    });
  });

  it("uses the preloaded current user in protected todo procedures", async () => {
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
  });

  it("keeps unauthorized todo access consistent when no current user exists", async () => {
    const client = createRouterClient(router, {
      context: {
        headers: new Headers(),
        currentUser: null,
      },
    });

    await expect(client.todos.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(todoService.listForUser).not.toHaveBeenCalled();
  });
});
