import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Todo } from "./todo.entity";
import { TodoService } from "./todo.service";

describe("TodoService", () => {
  const repository = {
    listByUserId: vi.fn(),
    createForUser: vi.fn(),
    toggleForUser: vi.fn(),
    removeForUser: vi.fn(),
  };

  const service = new TodoService(repository);
  const userId = "user-1";
  const todo: Todo = {
    id: "todo-1",
    title: "Ship test foundations",
    completed: false,
    createdAt: "2026-03-12T10:00:00.000Z",
  };

  beforeEach(() => {
    repository.listByUserId.mockReset();
    repository.createForUser.mockReset();
    repository.toggleForUser.mockReset();
    repository.removeForUser.mockReset();
  });

  it("delegates list and create calls to the repository", async () => {
    repository.listByUserId.mockResolvedValue([todo]);
    repository.createForUser.mockResolvedValue(todo);

    await expect(service.listForUser(userId)).resolves.toEqual([todo]);
    await expect(service.createForUser(userId, todo.title)).resolves.toEqual(todo);
    expect(repository.listByUserId).toHaveBeenCalledWith(userId);
    expect(repository.createForUser).toHaveBeenCalledWith(userId, todo.title);
  });

  it("passes toggle and remove requests through with the current user id", async () => {
    repository.toggleForUser.mockResolvedValue({ ...todo, completed: true });
    repository.removeForUser.mockResolvedValue(true);

    await expect(service.toggleForUser(userId, todo.id, true)).resolves.toEqual({
      ...todo,
      completed: true,
    });
    await expect(service.removeForUser(userId, todo.id)).resolves.toBe(true);
    expect(repository.toggleForUser).toHaveBeenCalledWith(userId, todo.id, true);
    expect(repository.removeForUser).toHaveBeenCalledWith(userId, todo.id);
  });
});
