import { auth } from "../infrastructure/auth/auth";
import { prisma } from "../infrastructure/database/prisma";
import { PrismaTodoRepository } from "../modules/todos/prisma-todo.repository";
import { SessionService } from "../modules/session/session.service";
import { TodoService } from "../modules/todos/todo.service";

const todoRepository = new PrismaTodoRepository(prisma);

export const appDependencies = {
  auth,
  sessionService: new SessionService(auth),
  todoService: new TodoService(todoRepository),
} as const;

export type AppDependencies = typeof appDependencies;
