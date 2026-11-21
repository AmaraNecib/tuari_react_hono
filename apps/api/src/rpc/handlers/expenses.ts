import { implement, ORPCError } from "@orpc/server";
import crypto from "node:crypto";

import type { ExpensesModule } from "../../modules/expenses/expenses-module.interface";
import { ExpenseAlreadyVoidedError, ExpenseInvalidAmountError, ExpenseNotFoundError } from "../../modules/expenses/expenses.types";
import type { CreateExpenseInput, ExpenseListFilters, UpdateExpenseInput, VoidExpenseInput } from "../../modules/expenses/expenses.types";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

function mapExpenseError(error: unknown): unknown {
  if (error instanceof ExpenseNotFoundError) return new ORPCError("NOT_FOUND", { message: error.message });
  if (error instanceof ExpenseAlreadyVoidedError) return new ORPCError("CONFLICT", { message: error.message });
  if (error instanceof ExpenseInvalidAmountError) return new ORPCError("BAD_REQUEST", { message: error.message });
  return error;
}

type ReadParams = { context: RpcContext; input: unknown };
type WriteParams = ReadParams & { auditContext: unknown };
type Audit = { actorUserId: string; actorLabel: string; transactionId: string };

/** Shared permission and audit actions; each router retains its concrete contract types. */
export function createExpenseActions<Amount>(m: RpcMiddleware, expensesModule: ExpensesModule<Amount>) {
  return {
    expensesList: m.withPermission("expenses:read", m.withAuth(async ({ input }: ReadParams) => {
      const opts = (input ?? {}) as { filters?: ExpenseListFilters };
      return expensesModule.list(opts.filters);
    })),
    expensesGet: m.withPermission("expenses:read", m.withAuth(async ({ input }: ReadParams) => {
      const expense = await expensesModule.get((input as { id: string }).id);
      if (!expense) throw new ORPCError("NOT_FOUND", { message: "Expense not found" });
      return expense;
    })),
    expensesCreate: m.withPermission("expenses:create", m.withAudit(async ({ input, auditContext }: WriteParams) => {
      return expensesModule.create({
        ...(input as Omit<CreateExpenseInput<Amount>, "id"> & { id?: string }),
        id: (input as { id?: string }).id ?? crypto.randomUUID(),
      }, auditContext as Audit);
    }, mapExpenseError)),
    expensesUpdate: m.withPermission("expenses:update", m.withAudit(async ({ input, auditContext }: WriteParams) => {
      return expensesModule.update(input as UpdateExpenseInput<Amount>, auditContext as Audit);
    }, mapExpenseError)),
    expensesVoid: m.withPermission("expenses:delete", m.withAudit(async ({ input, auditContext }: WriteParams) => {
      return expensesModule.void(input as VoidExpenseInput, auditContext as Audit);
    }, mapExpenseError)),
  };
}

export function createExpensesHandlers<Amount = number>(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  expensesModule: ExpensesModule<Amount>,
) {
  const actions = createExpenseActions(m, expensesModule);
  return {
    expensesList: os.expensesList.handler(actions.expensesList),
    expensesGet: os.expensesGet.handler(actions.expensesGet),
    expensesCreate: os.expensesCreate.handler(actions.expensesCreate),
    expensesUpdate: os.expensesUpdate.handler(actions.expensesUpdate),
    expensesVoid: os.expensesVoid.handler(actions.expensesVoid),
  };
}
