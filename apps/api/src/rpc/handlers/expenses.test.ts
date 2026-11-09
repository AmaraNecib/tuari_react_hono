import { describe, expect, it, vi } from "vitest";

import type { ExpensesModule } from "../../modules/expenses/expenses-module.interface";
import {
  ExpenseAlreadyVoidedError,
  ExpenseInvalidAmountError,
  ExpenseNotFoundError,
} from "../../modules/expenses/expenses.types";
import type { RpcContext } from "../context";
import { createRpcMiddleware } from "../rpc-middleware";
import { createExpensesHandlers } from "./expenses";

const id = "11111111-1111-4111-8111-111111111111";
const mutations = [
  ["create", "expensesCreate", { id, amount: 10, expenseDate: "2026-10-03T10:00:00.000Z" }],
  ["update", "expensesUpdate", { id, amount: 10 }],
  ["void", "expensesVoid", { id }],
] as const;

function setup(operation: ReturnType<typeof vi.fn>) {
  // Capture registered handlers without ORPC's input/output validation. The
  // audit and permission wrappers are real, as in production composition.
  const registration = { handler: (handler: unknown) => handler };
  const os = Object.fromEntries(
    ["expensesList", "expensesGet", "expensesCreate", "expensesUpdate", "expensesVoid"]
      .map((name) => [name, registration]),
  ) as unknown as Parameters<typeof createExpensesHandlers>[0];
  const middleware = createRpcMiddleware({
    authBootstrapService: { isBootstrapOwner: async () => true },
  });
  const handlers = createExpensesHandlers(os, middleware, {
    create: operation,
    update: operation,
    void: operation,
  } as unknown as ExpensesModule) as unknown as Record<typeof mutations[number][1], (params: {
    context: RpcContext;
    input: unknown;
  }) => Promise<unknown>>;
  const context = {
    headers: new Headers(),
    resolveCurrentUser: async () => ({
      id: "user-1",
      name: "Taylor",
      phone: "0612345678",
      permissions: ["expenses:create", "expenses:update", "expenses:delete"],
      version: "0.0.0",
    }),
  } as RpcContext;
  return { handlers, context };
}

describe("expense mutation handlers", () => {
  it.each(mutations)("forwards %s input and audit identity and preserves its result", async (_method, procedure, input) => {
    const result = { id };
    const operation = vi.fn().mockResolvedValue(result);
    const { handlers, context } = setup(operation);

    await expect(handlers[procedure]({ context, input })).resolves.toBe(result);
    expect(operation).toHaveBeenCalledExactlyOnceWith(input, {
      actorUserId: "user-1",
      actorLabel: "Taylor",
      transactionId: expect.any(String),
    });
    expect(operation.mock.calls[0]![1].transactionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(mutations)("maps all async domain failures for %s", async (_method, procedure, input) => {
    for (const [error, code] of [
      [new ExpenseNotFoundError(id), "NOT_FOUND"],
      [new ExpenseAlreadyVoidedError(id), "CONFLICT"],
      [new ExpenseInvalidAmountError(0), "BAD_REQUEST"],
    ] as const) {
      const operation = vi.fn().mockRejectedValue(error);
      const { handlers, context } = setup(operation);

      await expect(handlers[procedure]({ context, input })).rejects.toMatchObject({
        code,
        message: error.message,
      });
      expect(operation).toHaveBeenCalledOnce();
    }
  });

  it.each(mutations)("preserves the audit resolver's unknown-error result for %s", async (_method, procedure, input) => {
    const error = new Error("storage unavailable");
    const { handlers, context } = setup(vi.fn().mockRejectedValue(error));

    await expect(handlers[procedure]({ context, input })).resolves.toBe(error);
  });

  it("generates an id for create when none is supplied", async () => {
    const operation = vi.fn().mockResolvedValue({ id });
    const { handlers, context } = setup(operation);
    const input = { amount: 10, expenseDate: "2026-10-03T10:00:00.000Z" };

    await handlers.expensesCreate({ context, input });

    expect(operation).toHaveBeenCalledOnce();
    expect(operation.mock.calls[0]![0]).toEqual({ ...input, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(input).not.toHaveProperty("id");
  });
});
