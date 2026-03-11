import type { Todo } from "./todo.entity";

export interface TodoRepository {
  listByUserId(userId: string): Promise<Todo[]>;
  createForUser(userId: string, title: string): Promise<Todo>;
  toggleForUser(
    userId: string,
    todoId: string,
    completed: boolean,
  ): Promise<Todo | null>;
  removeForUser(userId: string, todoId: string): Promise<boolean>;
}
