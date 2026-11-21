import { ORPCError } from "@orpc/server";
import type { RpcContext } from "./context";
import type { RpcMiddleware } from "./rpc-middleware";

/** Authenticate stale numeric callers without constructing or invoking a writer. */
export function createRetiredFinancialAction(middleware: RpcMiddleware) {
  return async (params: { context: RpcContext; input: unknown }): Promise<never> => {
    await middleware.mutationAudit(async () => {}, error => { throw error; })(params);
    throw new ORPCError("BAD_REQUEST", { message: "This numeric financial procedure is retired. Use the exact financial interface." });
  };
}
