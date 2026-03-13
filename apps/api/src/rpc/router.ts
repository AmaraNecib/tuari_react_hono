import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { getCurrentUser, type RpcContext } from "./context";

export function createRouter() {
  const os = implement(appContract).$context<RpcContext>();

  return os.router({
    health: os.health.handler(() => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    })),
    session: os.session.handler(async ({ context }) => ({
      user: await getCurrentUser(context),
    })),
  });
}
