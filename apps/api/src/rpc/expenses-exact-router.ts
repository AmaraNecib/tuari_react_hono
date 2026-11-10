import { implement } from "@orpc/server";
import { exactExpensesContract } from "@tuari/contracts";

import type { ExpensesModule } from "../modules/expenses/expenses-module.interface";
import type { RpcContext } from "./context";
import { createExpensesHandlers } from "./handlers/expenses";
import type { RpcMiddleware } from "./rpc-middleware";

/** Isolated proof composition only. Production router and app dependencies do not import it. */
export function createExactExpensesRouter(service: ExpensesModule<string>, middleware: RpcMiddleware) {
  const os = implement(exactExpensesContract).$context<RpcContext>();
  return os.router(createExpensesHandlers(os, middleware, service));
}
