import { implement } from "@orpc/server";
import { exactExpensesContract, exactExpenseListOutputSchema, exactExpenseSchema, exactExpenseWithRevisionsSchema } from "@tuari/contracts";

import type { ExpensesModule } from "../modules/expenses/expenses-module.interface";
import type { RpcContext } from "./context";
import { createExpenseActions } from "./handlers/expenses";
import type { RpcMiddleware } from "./rpc-middleware";

/** Isolated proof composition only. Production router and app dependencies do not import it. */
export function createExactExpensesRouter(service: ExpensesModule<string>, middleware: RpcMiddleware) {
  const os = implement(exactExpensesContract).$context<RpcContext>();
  const actions = createExpenseActions(middleware, service);
  return os.router({
    expensesList: os.expensesList.handler(async params => exactExpenseListOutputSchema.parse(await actions.expensesList(params))),
    expensesGet: os.expensesGet.handler(async params => exactExpenseWithRevisionsSchema.parse(await actions.expensesGet(params))),
    expensesCreate: os.expensesCreate.handler(async params => exactExpenseSchema.parse(await actions.expensesCreate(params))),
    expensesUpdate: os.expensesUpdate.handler(async params => exactExpenseSchema.parse(await actions.expensesUpdate(params))),
    expensesVoid: os.expensesVoid.handler(async params => exactExpenseSchema.parse(await actions.expensesVoid(params))),
  });
}
