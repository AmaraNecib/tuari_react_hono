import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import type { Todo } from "./todo.entity";
import type { TodoRepository } from "./todo.repository";

const toTodo = (row: {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}): Todo => ({
  id: row.id,
  title: row.title,
  completed: row.completed,
  createdAt: row.createdAt.toISOString(),
});

export class PrismaTodoRepository implements TodoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByUserId(userId: string): Promise<Todo[]> {
    const rows = await this.prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toTodo);
  }

  async createForUser(userId: string, title: string): Promise<Todo> {
    const row = await this.prisma.todo.create({
      data: {
        id: randomUUID(),
        userId,
        title,
        completed: false,
        createdAt: new Date(),
      },
    });

    return toTodo(row);
  }

  async toggleForUser(
    userId: string,
    todoId: string,
    completed: boolean,
  ): Promise<Todo | null> {
    const existing = await this.prisma.todo.findFirst({
      where: {
        id: todoId,
        userId,
      },
    });

    if (!existing) {
      return null;
    }

    const row = await this.prisma.todo.update({
      where: { id: todoId },
      data: { completed },
    });

    return toTodo(row);
  }

  async removeForUser(userId: string, todoId: string): Promise<boolean> {
    const result = await this.prisma.todo.deleteMany({
      where: {
        id: todoId,
        userId,
      },
    });

    return result.count > 0;
  }
}
