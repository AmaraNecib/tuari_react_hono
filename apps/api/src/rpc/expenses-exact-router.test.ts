import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExactExpensesClient } from "@tuari/contracts";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { SqliteExactExpenseRepository } from "../modules/expenses/adapters/sqlite-exact-expenses.repository";
import { createExactExpensesModule } from "../modules/expenses/expenses.exact";
import { exactExpenseSchemaStatements } from "../modules/expenses/expenses.exact-schema";
import { listExactExpenseCostInputs } from "../modules/expenses/expense-cost-inputs";
import { createExactExpensesRouter } from "./expenses-exact-router";
import { createRpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";

const date = "2026-10-03T10:00:00.000Z";
const user = { id: "user-1", name: "Operator", phone: "0612345678", version: "0.0.0", permissions: ["expenses:create", "expenses:read", "expenses:update", "expenses:delete"] as const };

describe.each([["plain", ""], ["keyed", "528-rpc-fixture-key"]])("exact expense RPC over %s storage", (_driver, key) => {
  it("validates exact input, persists audit and serves exact source inputs without mixed totals", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-528-rpc-")), "expense.sqlite");
    const db = createDatabaseConnection(path, key);
    try {
      db.pragma("foreign_keys = ON");
      for (const sql of exactExpenseSchemaStatements) db.exec(sql);
      const repo = new SqliteExactExpenseRepository(db, createFifoLock());
      const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async () => true } });
      const router = createExactExpensesRouter(createExactExpensesModule(repo), middleware);
      const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => ({ ...user, permissions: [...user.permissions] }) };
      const client = createRouterClient(router, { context }) as ExactExpensesClient;
      const id = randomUUID();
      const projectId = randomUUID();
      const created = await client.expensesCreate({ id, amount: "90071992547409.93", projectId, expenseDate: date });
      expect(JSON.parse(JSON.stringify(created))).toMatchObject({ amount: "90071992547409.93", currency: "DZD", actorUserId: "user-1", actorLabel: "Operator" });
      await expect(client.expensesUpdate({ id, amount: "0.001" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await client.expensesUpdate({ id, amount: "0.10", reason: "invoice correction" });
      const fetched = await client.expensesGet({ id });
      expect(fetched.revisions).toMatchObject([{ previousAmount: "90071992547409.93", newAmount: "0.10", reason: "invoice correction", actorUserId: "user-1" }]);
      expect(fetched.revisions[0]?.transactionId).toEqual(expect.any(String));
      expect(await listExactExpenseCostInputs(repo, projectId)).toEqual([{ id, projectId, amountDzd: "0.10", currency: "DZD", expenseDate: date, whatFor: null, responsibleWorkerId: null, sellerId: null }]);
      await client.expensesVoid({ id });
      expect(await listExactExpenseCostInputs(repo, projectId)).toEqual([]);
      expect(await client.expensesList({})).toMatchObject({ items: [{ status: "VOIDED" }], totals: { total: "0.00", count: 0 } });
      await expect(client.expensesUpdate({ id, amount: "1.00" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(client.expensesGet({ id: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
      const anonymous = createRouterClient(router, { context: { ...context, resolveCurrentUser: async () => null } }) as ExactExpensesClient;
      await expect(anonymous.expensesList({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    } finally { db.close(); }
  });
});
