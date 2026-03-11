import { ORPCError, implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import type { AppDependencies } from "../app/dependencies";
import type { RpcContext } from "./context";

export function createRouter(dependencies: Pick<AppDependencies, "sessionService" | "todoService">) {
  const os = implement(appContract).$context<RpcContext>();

  const requireUser = async (headers: Headers) => {
    const user = await dependencies.sessionService.getCurrentUser(headers);

    if (!user) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return user;
  };

  return os.router({
    health: os.health.handler(() => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    })),
    session: os.session.handler(async ({ context }) => {
      return {
        user: await dependencies.sessionService.getCurrentUser(context.headers),
      };
    }),
    todos: {
      list: os.todos.list.handler(async ({ context }) => {
        const user = await requireUser(context.headers);
        return dependencies.todoService.listForUser(user.id);
      }),
      create: os.todos.create.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);
        return dependencies.todoService.createForUser(user.id, input.title);
      }),
      toggle: os.todos.toggle.handler(async ({ context, input }) => {
        const user = await requireUser(context.headers);
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
        const user = await requireUser(context.headers);
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
