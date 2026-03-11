import type { Todo } from "./todo.entity";
import type { TodoRepository } from "./todo.repository";

export class TodoService {
  constructor(private readonly repository: TodoRepository) {}

  listForUser(userId: string): Promise<Todo[]> {
    return this.repository.listByUserId(userId);
  }

  createForUser(userId: string, title: string): Promise<Todo> {
    return this.repository.createForUser(userId, title);
  }

  toggleForUser(
    userId: string,
    todoId: string,
    completed: boolean,
  ): Promise<Todo | null> {
    return this.repository.toggleForUser(userId, todoId, completed);
  }

  removeForUser(userId: string, todoId: string): Promise<boolean> {
    return this.repository.removeForUser(userId, todoId);
  }
}
