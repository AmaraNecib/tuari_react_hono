import { ORPCError, implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { auth } from "../lib/auth";
import { todoRepository } from "../lib/todos";

type Context = {
  headers: Headers;
};

const os = implement(appContract).$context<Context>();

const requireUser = async (headers: Headers) => {
  const sessionData = await auth.api.getSession({ headers });

  if (!sessionData?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return sessionData.user;
};

export const router = os.router({
  health: os.health.handler(() => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  })),
  session: os.session.handler(async ({ context }) => {
    const sessionData = await auth.api.getSession({
      headers: context.headers,
    });

    if (!sessionData?.user) {
      return { user: null };
    }

    return {
      user: {
        id: sessionData.user.id,
        name: sessionData.user.name,
        email: sessionData.user.email,
      },
    };
  }),
  todos: {
    list: os.todos.list.handler(async ({ context }) => {
      const user = await requireUser(context.headers);
      return todoRepository.list(user.id);
    }),
    create: os.todos.create.handler(async ({ context, input }) => {
      const user = await requireUser(context.headers);
      return todoRepository.create(user.id, input.title);
    }),
    toggle: os.todos.toggle.handler(async ({ context, input }) => {
      const user = await requireUser(context.headers);
      const item = await todoRepository.toggle(user.id, input.id, input.completed);

      if (!item) {
        throw new ORPCError("NOT_FOUND");
      }

      return item;
    }),
    remove: os.todos.remove.handler(async ({ context, input }) => {
      const user = await requireUser(context.headers);
      return {
        success: await todoRepository.remove(user.id, input.id),
      };
    }),
  },
});
