import { randomUUID } from "node:crypto";
import { prisma } from "./db";

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
};

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

export const todoRepository = {
  async list(userId: string): Promise<Todo[]> {
    const rows = await prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toTodo);
  },
  async create(userId: string, title: string): Promise<Todo> {
    const createdAt = new Date().toISOString();
    const id = randomUUID();

    const row = await prisma.todo.create({
      data: {
        id,
        userId,
        title,
        completed: false,
        createdAt: new Date(createdAt),
      },
    });

    return toTodo(row);
  },
  async toggle(userId: string, id: string, completed: boolean): Promise<Todo | null> {
    const existing = await prisma.todo.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existing) {
      return null;
    }

    const row = await prisma.todo.update({
      where: { id },
      data: { completed },
    });

    return toTodo(row);
  },
  async remove(userId: string, id: string): Promise<boolean> {
    const result = await prisma.todo.deleteMany({
      where: {
        id,
        userId,
      },
    });

    return result.count > 0;
  },
};
