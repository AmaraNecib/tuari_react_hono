import { implement, ORPCError } from "@orpc/server";
import crypto from "node:crypto";

import type { ExpensesModule } from "../../modules/expenses/expenses-module.interface";
import {
  ExpenseAlreadyVoidedError,
  ExpenseInvalidAmountError,
  ExpenseNotFoundError,
} from "../../modules/expenses/expenses.types";
import type {
  CreateExpenseInput,
  ExpenseListFilters,
  UpdateExpenseInput,
  VoidExpenseInput,
} from "../../modules/expenses/expenses.types";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

function mapExpenseError(error: unknown): unknown {
  if (error instanceof ExpenseNotFoundError) {
    return new ORPCError("NOT_FOUND", { message: error.message });
  }
  if (error instanceof ExpenseAlreadyVoidedError) {
    return new ORPCError("CONFLICT", { message: error.message });
  }
  if (error instanceof ExpenseInvalidAmountError) {
    return new ORPCError("BAD_REQUEST", { message: error.message });
  }
  return error;
}

export function createExpensesHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  expensesModule: ExpensesModule,
) {
  return {
    expensesList: os.expensesList.handler(
      m.withPermission(
        "expenses:read",
        m.withAuth(async ({ input }: { context: RpcContext; input: unknown }) => {
          const opts = (input ?? {}) as { filters?: ExpenseListFilters };
          return expensesModule.list(opts.filters);
        }),
      ),
    ),

    expensesGet: os.expensesGet.handler(
      m.withPermission(
        "expenses:read",
        m.withAuth(async ({ input }: { context: RpcContext; input: unknown }) => {
          const expense = await expensesModule.get((input as { id: string }).id);
          if (!expense) {
            throw new ORPCError("NOT_FOUND", { message: "Expense not found" });
          }
          return expense;
        }),
      ),
    ),

    expensesCreate: os.expensesCreate.handler(
      m.withPermission(
        "expenses:create",
        m.withAudit(
          async ({
            input,
            auditContext,
          }: {
            context: RpcContext;
            input: unknown;
            auditContext: unknown;
          }) => {
            return expensesModule.create(
              {
                ...(input as Omit<CreateExpenseInput, "id"> & { id?: string }),
                id: (input as { id?: string }).id ?? crypto.randomUUID(),
              },
              auditContext as { actorUserId: string; actorLabel: string; transactionId: string },
            );
          },
          mapExpenseError,
        ),
      ),
    ),

    expensesUpdate: os.expensesUpdate.handler(
      m.withPermission(
        "expenses:update",
        m.withAudit(
          async ({
            input,
            auditContext,
          }: {
            context: RpcContext;
            input: unknown;
            auditContext: unknown;
          }) => {
            return expensesModule.update(
              input as UpdateExpenseInput,
              auditContext as { actorUserId: string; actorLabel: string; transactionId: string },
            );
          },
          mapExpenseError,
        ),
      ),
    ),

    expensesVoid: os.expensesVoid.handler(
      m.withPermission(
        "expenses:delete",
        m.withAudit(
          async ({
            input,
            auditContext,
          }: {
            context: RpcContext;
            input: unknown;
            auditContext: unknown;
          }) => {
            return expensesModule.void(
              input as VoidExpenseInput,
              auditContext as { actorUserId: string; actorLabel: string; transactionId: string },
            );
          },
          mapExpenseError,
        ),
      ),
    ),
  };
}
