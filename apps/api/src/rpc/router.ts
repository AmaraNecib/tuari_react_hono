import { ORPCError, implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import type { TodoService } from "../modules/todos/todo.service";
import { getCurrentUser, requireCurrentUser, type RpcContext } from "./context";

type RouterDependencies = {
  todoService: Pick<
    TodoService,
    "listForUser" | "createForUser" | "toggleForUser" | "removeForUser"
  >;
};

export function createRouter(dependencies: RouterDependencies) {
  const os = implement(appContract).$context<RpcContext>();

  return os.router({
    health: os.health.handler(() => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    })),
    session: os.session.handler(async ({ context }) => {
      return {
        user: await getCurrentUser(context),
      };
    }),
    todos: {
      list: os.todos.list.handler(async ({ context }) => {
        const user = await requireCurrentUser(context);
        return dependencies.todoService.listForUser(user.id);
      }),
      create: os.todos.create.handler(async ({ context, input }) => {
        const user = await requireCurrentUser(context);
        return dependencies.todoService.createForUser(user.id, input.title);
      }),
      toggle: os.todos.toggle.handler(async ({ context, input }) => {
        const user = await requireCurrentUser(context);
        const item = await dependencies.todoService.toggleForUser(
          user.id,
          input.id,
          input.completed,
        );

        if (!item) {
          throw new ORPCError("NOT_FOUND");
        }

        return item;
      }),
      remove: os.todos.remove.handler(async ({ context, input }) => {
        const user = await requireCurrentUser(context);
        return {
          success: await dependencies.todoService.removeForUser(
            user.id,
            input.id,
          ),
        };
      }),
    },
  });
}
